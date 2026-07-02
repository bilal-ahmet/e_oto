/**
 * Pipeline orkestrasyonu — ADIM ADIM insan onaylı akış (CLAUDE.md §7).
 *
 * 3 onay kapısı:
 *   1) generateVariations → awaiting_approval (varyasyonlardan görsel seç)
 *   2) selectVariation → generating_seo → awaiting_seo_approval (SEO incele/düzenle)
 *   3) approveSeoAndProcess → processing_files (upscale + 5 JPG + 8 mockup + video + ölçü)
 *      → awaiting_publish (medya incele, tek tek mockup yeniden üret) → publishToEtsy → done
 *
 * fal kredisi yoksa: upscale pass-through'a düşer, mockup'lar boş kalır (run düşmez);
 * SEO + 5 JPG + video + ölçü görseli + Etsy taslak yine üretilir.
 */

import sharp from 'sharp';
import { getCompetitorResearch, getPipelineRun, updatePipelineRun } from '@/lib/db/queries';
import { keyFromUrl, putObject, readObject } from '@/lib/storage';
import { generateImages } from '@/lib/image-gen';
import { generateSeo } from '@/lib/claude/seo';
import { upscale } from '@/lib/upscale/client';
import { packageJpegs } from '@/lib/packaging/resize-and-export';
import { generateAllMockups, generateMockup } from '@/lib/mockup/client';
import { MOCKUP_SCENES } from '@/lib/mockup/scenes';
import { uploadBuffer } from '@/lib/fal';
import { makeZoomVideo } from '@/lib/video/zoom';
import { getSizeGuide } from '@/lib/listing/size-guide';
import {
  createDraftListing,
  getAttributeOptions,
  getDigitalPrintsTaxonomyId,
  getShopId,
  setListingAttributes,
  uploadListingFile,
  uploadListingImage,
  uploadListingVideo,
} from '@/lib/etsy/listings';
import type { ImageModel, MediaUrls, PipelineRun, SeoData } from '@/types';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface ReferenceImageInput {
  base64: string;
  mediaType: ImageMediaType;
}

/**
 * Kapı 1 — Seçilen modelle `count` varyasyon üretir; run'ı awaiting_approval'a getirir.
 * `prompt` zaten nihai metindir (referans modunda Instruction Üretici'nin ürettiği transformation
 * instruction, kullanıcı onayından geçip Prompt olarak gelir) — burada ek zenginleştirme yapılmaz.
 */
export async function generateVariations(
  runId: string,
  model: ImageModel,
  prompt: string,
  count: number,
): Promise<void> {
  try {
    await updatePipelineRun(runId, { status: 'generating_image', errorMessage: null });

    const images = await generateImages(model, prompt, count);
    const variationUrls: string[] = [];
    for (let i = 0; i < images.length; i++) {
      variationUrls.push(
        await putObject(`runs/${runId}/variation-${i}.png`, images[i].buffer, images[i].contentType),
      );
    }

    await updatePipelineRun(runId, { variationUrls, status: 'awaiting_approval' });
  } catch (err) {
    await fail(runId, err);
    throw err;
  }
}

type ImageMediaTypeIn = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/** Uzantıdan media type tahmini (taslak görselleri png/jpg olabilir). */
function mediaTypeFromUrl(url: string): ImageMediaTypeIn {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/png';
}

/**
 * Seçilen görseli (varyasyon veya taslak) master kaynağı yapar ve SEO üretir (kapı 2'ye götürür).
 * Hem `selectVariation` hem de taslaktan başlatma (`from-draft`) bunu kullanır.
 */
export async function selectImageForRun(runId: string, url: string): Promise<void> {
  try {
    const run = await getPipelineRun(runId);
    if (!run) throw new Error(`Pipeline run bulunamadı: ${runId}`);

    await updatePipelineRun(runId, { generatedImageUrl: url, status: 'generating_seo', errorMessage: null });

    // Etsy izin verilen öznitelik değerlerini çek (Claude tam eşleşen değer seçsin); Etsy yoksa serbest.
    let allowedValues: Record<string, string[]> | undefined;
    try {
      const taxId = await getDigitalPrintsTaxonomyId();
      allowedValues = await getAttributeOptions(taxId);
    } catch {
      allowedValues = undefined;
    }

    // Rakip SEO analizine bağlıysa, üretilen özgün başlık/etiketleri SEO'ya referans olarak ver.
    let competitorRef: { title: string; tags: string[] } | undefined;
    if (run.competitorResearchId != null) {
      const research = await getCompetitorResearch(run.competitorResearchId);
      if (research && (research.generatedTitle || research.generatedTags.length)) {
        competitorRef = { title: research.generatedTitle, tags: research.generatedTags };
      }
    }

    const imageBuffer = await readObject(keyFromUrl(url));
    const seo = await generateSeo(
      run.prompt,
      imageBuffer.toString('base64'),
      mediaTypeFromUrl(url),
      allowedValues,
      competitorRef,
    );

    await updatePipelineRun(runId, { seoJson: seo, status: 'awaiting_seo_approval' });
  } catch (err) {
    await fail(runId, err);
  }
}

/** Kapı 1 onayı — seçilen varyasyonu master kaynağı yapar, ardından SEO üretir (kapı 2'ye götürür). */
export async function selectVariation(runId: string, index: number): Promise<void> {
  const run = await getPipelineRun(runId);
  if (!run) {
    await fail(runId, new Error(`Pipeline run bulunamadı: ${runId}`));
    return;
  }
  const url = run.variationUrls?.[index];
  if (!url) {
    await fail(runId, new Error(`Geçersiz varyasyon index'i: ${index}`));
    return;
  }
  await selectImageForRun(runId, url);
}

/** Oran'dan Etsy orientation değeri. */
function orientationFor(width: number, height: number): string {
  if (Math.abs(width - height) / Math.max(width, height) < 0.05) return 'Square';
  return height >= width ? 'Vertical' : 'Horizontal';
}

/**
 * Kapı 2 onayı — (düzenlenmiş) SEO'yu kaydeder; upscale + 5 JPG + 8 mockup + video + ölçü görseli üretir.
 */
export async function approveSeoAndProcess(runId: string, seo: SeoData): Promise<void> {
  try {
    const run = await getPipelineRun(runId);
    if (!run) throw new Error(`Pipeline run bulunamadı: ${runId}`);
    if (!run.generatedImageUrl) throw new Error('Seçili görsel yok.');

    await updatePipelineRun(runId, { seoJson: seo, status: 'processing_files', errorMessage: null });

    // 1) Upscale (clarity ×4; fal yoksa pass-through)
    const selected = await readObject(keyFromUrl(run.generatedImageUrl));
    const master = await upscale(selected);
    const masterUrl = await putObject(`runs/${runId}/master.png`, master, 'image/png');

    // Orientation'ı gerçek oran'dan doğrula.
    const meta = await sharp(master).metadata();
    if (meta.width && meta.height) {
      seo = { ...seo, attributes: { ...seo.attributes, orientation: orientationFor(meta.width, meta.height) } };
      await updatePipelineRun(runId, { seoJson: seo });
    }

    // 2) Dijital dosyalar: 5 JPG (300 DPI, <20MB)
    const files = await packageJpegs(master);
    const digitalFileUrls: Record<string, string> = {};
    for (const f of files) {
      digitalFileUrls[f.key] = await putObject(`runs/${runId}/${f.filename}`, f.buffer, f.contentType);
    }
    await updatePipelineRun(runId, { upscaledImageUrl: masterUrl, digitalFileUrls });

    // 3) Mockup'lar (8 sahne; fal hatalarına dayanıklı — boş slot kalabilir)
    // HIZ: 27MB master yerine küçültülmüş kaynak (1536px JPEG) yüklenir — upload çok daha hızlı.
    // Aynı kaynak yeniden-üret'te de kullanılır (tekrar 27MB upload edilmez).
    const mockupSource = await sharp(master)
      .resize(1536, 1536, { fit: 'inside' })
      .jpeg({ quality: 90 })
      .toBuffer();
    await putObject(`runs/${runId}/mockup-source.jpg`, mockupSource, 'image/jpeg');

    const media: MediaUrls = { mockups: [] };
    try {
      const results = await generateAllMockups(mockupSource);
      const mockups: string[] = [];
      for (const r of results) {
        if (r.ok && r.buffer) {
          mockups.push(await putObject(`runs/${runId}/mockup-${r.index}.jpg`, r.buffer, r.contentType ?? 'image/jpeg'));
        } else {
          mockups.push(''); // boş slot — gate 3'te yeniden üretilebilir
        }
      }
      media.mockups = mockups;
    } catch (e) {
      console.warn('[pipeline] mockup üretimi atlandı:', e instanceof Error ? e.message : e);
      media.mockups = MOCKUP_SCENES.map(() => '');
    }

    // 4) Zoom video (birincil mockup, yoksa master'dan)
    try {
      const firstMockup = media.mockups.find((u) => u);
      const source = firstMockup ? await readObject(keyFromUrl(firstMockup)) : master;
      const video = await makeZoomVideo(source);
      media.video = await putObject(`runs/${runId}/zoom.mp4`, video, 'video/mp4');
    } catch (e) {
      console.warn('[pipeline] video üretimi atlandı:', e instanceof Error ? e.message : e);
    }

    // 5) Sabit ölçü görseli
    const sizeGuide = await getSizeGuide();
    if (sizeGuide) {
      media.sizeGuide = await putObject(
        `runs/${runId}/size-guide.${sizeGuide.ext}`,
        sizeGuide.buffer,
        sizeGuide.contentType,
      );
    }

    await updatePipelineRun(runId, { mediaUrls: media, status: 'awaiting_publish' });
  } catch (err) {
    await fail(runId, err);
  }
}

/** Gate 3 — tek bir mockup sahnesini yeniden üretir (master'dan). */
export async function regenerateMockup(runId: string, index: number): Promise<void> {
  try {
    const run = await getPipelineRun(runId);
    if (!run) throw new Error(`Pipeline run bulunamadı: ${runId}`);
    if (!run.upscaledImageUrl) throw new Error('Master görsel yok.');
    const scene = MOCKUP_SCENES[index];
    if (!scene) throw new Error(`Geçersiz mockup index'i: ${index}`);

    // Status awaiting_publish'te kalır; UI sadece ilgili küçük resmi spinner'a alır ve
    // mockup URL'i değişene kadar polling eder (versiyonlu dosya adı → URL değişir, tarayıcı cache'i de bypass).
    // Küçük mockup kaynağını kullan (27MB master yerine) — upload çok daha hızlı.
    let source: Buffer;
    try {
      source = await readObject(`runs/${runId}/mockup-source.jpg`);
    } catch {
      source = await readObject(keyFromUrl(run.upscaledImageUrl)); // eski run'lar için fallback
    }
    const masterUrl = await uploadBuffer(source, 'image/jpeg', 'mockup-source.jpg');
    const seed = Math.floor(Math.random() * 2_000_000_000); // farklı çıktı için
    const { buffer, contentType } = await generateMockup(masterUrl, scene, seed);
    const url = await putObject(`runs/${runId}/mockup-${index}-${Date.now()}.jpg`, buffer, contentType);

    const mockups = [...(run.mediaUrls?.mockups ?? [])];
    while (mockups.length <= index) mockups.push('');
    mockups[index] = url;
    await updatePipelineRun(runId, { mediaUrls: { ...run.mediaUrls, mockups } });
  } catch (err) {
    await fail(runId, err);
  }
}

/**
 * Kapı 3 onayı — Etsy taslak listing + öznitelikler + medya (9 görsel + video) + 5 JPG → aktive.
 * @param thumbnailIndex Seçilen mockup index'i; ilk yüklenir (Etsy birincil/thumbnail = ilk görsel).
 */
export async function publishToEtsy(runId: string, price = 5.0, thumbnailIndex = 0): Promise<void> {
  try {
    const run = await getPipelineRun(runId);
    if (!run) throw new Error(`Pipeline run bulunamadı: ${runId}`);
    if (!run.seo) throw new Error('SEO yok — önce SEO onaylanmalı.');
    if (!run.digitalFileUrls) throw new Error('Dijital dosyalar (JPG) yok — önce paketleme yapılmalı.');

    await updatePipelineRun(runId, { status: 'publishing_etsy', errorMessage: null });

    const shopId = await getShopId();
    const taxonomyId = await getDigitalPrintsTaxonomyId();
    const seo = { ...run.seo, categoryId: String(taxonomyId) };
    const listingId = await createDraftListing(shopId, seo, price);

    // Öznitelikler
    await setListingAttributes(shopId, listingId, taxonomyId, seo.attributes);

    // Görseller: seçilen thumbnail mockup'ı EN BAŞA al (Etsy ilk görseli birincil/thumbnail yapar),
    // diğer mockup'lar, en sona ölçü görseli (thumbnail asla ölçü görseli olmaz).
    const allMockups = run.mediaUrls?.mockups ?? [];
    const ordered: string[] = [];
    if (allMockups[thumbnailIndex]) ordered.push(allMockups[thumbnailIndex]);
    allMockups.forEach((u, i) => {
      if (u && i !== thumbnailIndex) ordered.push(u);
    });
    // Açık rank ile yükle: seçilen mockup rank 1 (thumbnail), diğerleri sonra, ölçü görseli EN SON.
    let rank = 1;
    for (let i = 0; i < ordered.length; i++) {
      const buf = await readObject(keyFromUrl(ordered[i]));
      await uploadListingImage(shopId, listingId, buf, `mockup-${i}.jpg`, 'image/jpeg', rank++);
    }
    if (run.mediaUrls?.sizeGuide) {
      const buf = await readObject(keyFromUrl(run.mediaUrls.sizeGuide));
      await uploadListingImage(shopId, listingId, buf, 'size-guide.jpg', 'image/jpeg', rank++);
    }

    // Video
    if (run.mediaUrls?.video) {
      try {
        const vid = await readObject(keyFromUrl(run.mediaUrls.video));
        await uploadListingVideo(shopId, listingId, vid, 'zoom.mp4');
      } catch (e) {
        console.warn('[pipeline] video yüklenemedi:', e instanceof Error ? e.message : e);
      }
    }

    // Dijital dosyalar: 5 JPG — sıra önemsiz, paralel yükle (hız). etsyFetch throttle korur.
    await Promise.all(
      Object.entries(run.digitalFileUrls).map(async ([key, url]) => {
        const buf = await readObject(keyFromUrl(url));
        await uploadListingFile(shopId, listingId, buf, `${key.replace(/_/g, '-')}.jpg`, 'image/jpeg');
      }),
    );

    // Listing'i aktifleştirme: kullanıcı isteğiyle 'active' YAPILMIYOR — taslak (draft) olarak bırakılır.
    // Yayın, Etsy panelinden manuel onayla yapılacak.
    await updatePipelineRun(runId, { etsyListingId: listingId, status: 'done' });
  } catch (err) {
    await fail(runId, err);
  }
}

async function fail(runId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await updatePipelineRun(runId, { status: 'error', errorMessage: message });
}

/** Reddedilen görsel için run'ı hata/iptal durumuna alır. */
export async function rejectRun(runId: string): Promise<void> {
  await updatePipelineRun(runId, {
    status: 'error',
    errorMessage: 'Görsel kullanıcı tarafından reddedildi.',
  });
}

export type { PipelineRun };
