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

import { sharp } from '@/lib/image/sharp';
import { getCompetitorResearch, getPipelineRun, updatePipelineRun } from '@/lib/db/queries';
import { keyFromUrl, putObject, readObject } from '@/lib/storage';
import { generateImages } from '@/lib/image-gen';
import { generateSeo } from '@/lib/claude/seo';
import { upscale } from '@/lib/upscale/client';
import { packageJpegs } from '@/lib/packaging/resize-and-export';
import { generateAllMockups, generateMockup } from '@/lib/mockup/client';
import { MOCKUP_SCENES } from '@/lib/mockup/scenes';
import { hasFal, uploadBuffer } from '@/lib/fal';
import { createPin } from '@/lib/pinterest/pins';
import { fallbackPinCopy, generatePinCopy } from '@/lib/claude/pin-copy';
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
import type { ImageModel, MediaUrls, PinCopy, PipelineRun, PublishProgress, SeoData } from '@/types';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface ReferenceImageInput {
  base64: string;
  mediaType: ImageMediaType;
}

// ── Süreç-içi çalışma kirası (lease) ─────────────────────────────────────────
/**
 * Bu süreçte ŞU AN üzerinde çalışılan run id'leri.
 *
 * NEDEN: Kurtarma sweeper'ı (lib/pipeline/recovery.ts) "askıda" kararını yalnızca `updated_at`e
 * bakarak veriyordu. Uzun adımlarda (upscale + paketleme) DB'ye yazım olmadığından, iş HÂLÂ
 * çalışırken 15 dk dolunca sweeper aynı run için İKİNCİ bir kopya başlatıyor; bellek ve CPU
 * ikiye katlanıp 1 GB'lık instance'ı OOM'a sürüklüyordu. Sweeper artık aktif run'ları atlar.
 *
 * `heartbeat` ayrıca uzun adım boyunca `updated_at`i tazeler; böylece başka bir instance da
 * (ileride instance_count>1) bu run'ı askıda sanmaz.
 */
const activeRuns = new Map<string, string>(); // runId → çalışan adımın adı (log için)

export function isRunActive(runId: string): boolean {
  return activeRuns.has(runId);
}

const HEARTBEAT_MS = 60_000;

/**
 * Adımı kira + heartbeat altında çalıştırır. Aynı run için ikinci bir çalışma isteği gelirse
 * (sweeper yarışı) sessizce yok sayılır — çift işleme yapılmaz.
 */
async function withRunLease(runId: string, step: string, fn: () => Promise<void>): Promise<void> {
  const running = activeRuns.get(runId);
  if (running) {
    console.warn(`[pipeline] run ${runId} halen ${running} adımında — yinelenen ${step} çağrısı atlandı.`);
    return;
  }
  activeRuns.set(runId, step);
  const beat = setInterval(() => {
    // Yalnızca updated_at'i tazeler (status'a dokunmaz) — sweeper'ın 15 dk penceresini sıfırlar.
    void updatePipelineRun(runId, {}).catch(() => {});
  }, HEARTBEAT_MS);
  try {
    await fn();
  } finally {
    clearInterval(beat);
    activeRuns.delete(runId);
  }
}

/**
 * Kapı 1 — Seçilen modelle `count` varyasyon üretir; run'ı awaiting_approval'a getirir.
 *
 * `prompt` zaten nihai metindir (Instruction Üretici'nin transformation instruction'ı kullanıcı
 * onayından geçip Prompt olarak gelir) — burada ek zenginleştirme yapılmaz.
 *
 * REFERANS GÖRSEL: run'a `referenceImageUrl` yazılmışsa (route yükleme sonrası yazar) görsel
 * depodan okunup fal storage'a yüklenir ve modele `image_url` olarak GİRDİ verilir. Önceden
 * referans yalnızca kayıt amaçlı saklanıyor, modele hiç ulaşmıyordu; çıktı prompt metnine
 * bağlı kalıp referansla alakasız çıkıyordu. Referans modunda üretim daima FLUX Kontext i2i'dir.
 */
export async function generateVariations(
  runId: string,
  model: ImageModel,
  prompt: string,
  count: number,
): Promise<void> {
  // Hata YENİDEN FIRLATILMAZ: çağıran `void generateVariations(...)` diyor; rethrow her üretim
  // hatasında unhandled rejection üretip aynı hatayı ikinci kez loglatıyordu. Hata zaten
  // `fail()` ile run'a yazılıyor ve UI status polling'inde görünüyor.
  return withRunLease(runId, 'generateVariations', async () => {
    try {
      // Idempotent: varyasyonlar zaten üretilmişse tekrar üretme (resume).
      const existing = await getPipelineRun(runId);
      if (existing?.variationUrls?.length) {
        await updatePipelineRun(runId, { status: 'awaiting_approval', attempts: 0, errorMessage: null });
        return;
      }

      await updatePipelineRun(runId, { status: 'generating_image', errorMessage: null });

      // Referans varsa fal storage'a yükle (i2i modelleri image_url'i fal sunucusundan çeker;
      // lokal/Spaces URL'i yerine fal URL'i kullanılır — mockup akışıyla aynı desen).
      let referenceUrl: string | undefined;
      let effectiveModel = model;
      if (existing?.referenceImageUrl) {
        if (!hasFal()) {
          throw new Error(
            'Referans görselli üretim FLUX (fal.ai) gerektirir — FAL_KEY tanımlı değil. ' +
              'Referansı kaldırıp metin prompt ile üretebilirsiniz.',
          );
        }
        const contentType = mediaTypeFromUrl(existing.referenceImageUrl);
        const buffer = await readObject(keyFromUrl(existing.referenceImageUrl));
        referenceUrl = await uploadBuffer(buffer, contentType, `reference.${contentType.split('/')[1]}`);

        // Imagen 4 görsel girdisi almıyor — referans modunda FLUX'a düşülür; run'a da yazılır ki
        // UI'da ve kayıtta gerçekten kullanılan model görünsün.
        if (effectiveModel !== 'flux') {
          effectiveModel = 'flux';
          await updatePipelineRun(runId, { imageModel: 'flux' });
        }
      }

      const images = await generateImages(effectiveModel, prompt, count, referenceUrl);
      const variationUrls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        variationUrls.push(
          await putObject(`runs/${runId}/variation-${i}.png`, images[i].buffer, images[i].contentType),
        );
      }

      await updatePipelineRun(runId, { variationUrls, status: 'awaiting_approval', attempts: 0 });
    } catch (err) {
      await fail(runId, err);
    }
  });
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
  return withRunLease(runId, 'selectImageForRun', () => selectImageForRunInner(runId, url));
}

async function selectImageForRunInner(runId: string, url: string): Promise<void> {
  try {
    const run = await getPipelineRun(runId);
    if (!run) throw new Error(`Pipeline run bulunamadı: ${runId}`);

    // Idempotent: SEO zaten üretilmişse (resume) tekrar üretme.
    if (run.seo) {
      await updatePipelineRun(runId, { status: 'awaiting_seo_approval', attempts: 0, errorMessage: null });
      return;
    }

    await updatePipelineRun(runId, { generatedImageUrl: url, status: 'generating_seo', errorMessage: null });

    // Etsy izin verilen öznitelik değerlerini çek (Claude tam eşleşen değer seçsin); Etsy yoksa serbest.
    // Hata BİLEREK yutulur (Etsy'siz de SEO üretilebilmeli) ama SESSİZ değil: buradaki başarısızlık
    // çoğu zaman "Etsy bağlı değil" demektir ve kullanıcı bunu yayın adımına kadar öğrenemiyordu.
    let allowedValues: Record<string, string[]> | undefined;
    try {
      const taxId = await getDigitalPrintsTaxonomyId();
      allowedValues = await getAttributeOptions(taxId);
    } catch (e) {
      allowedValues = undefined;
      console.warn(
        `[pipeline] run ${runId}: Etsy taksonomi/öznitelik listesi alınamadı — öznitelikler serbest metin olarak üretilecek. ` +
          `Sebep: ${e instanceof Error ? e.message : e}`,
      );
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

    await updatePipelineRun(runId, { seoJson: seo, status: 'awaiting_seo_approval', attempts: 0 });
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
  return withRunLease(runId, 'approveSeoAndProcess', () => approveSeoAndProcessInner(runId, seo));
}

async function approveSeoAndProcessInner(runId: string, seo: SeoData): Promise<void> {
  try {
    const run = await getPipelineRun(runId);
    if (!run) throw new Error(`Pipeline run bulunamadı: ${runId}`);
    if (!run.generatedImageUrl) throw new Error('Seçili görsel yok.');

    await updatePipelineRun(runId, { seoJson: seo, status: 'processing_files', errorMessage: null });

    // 1) Master (upscale ×4) — zaten üretilmişse Spaces'ten oku (idempotent resume; tekrar upscale yok).
    let masterUrl: string;
    let master: Buffer;
    if (run.upscaledImageUrl) {
      masterUrl = run.upscaledImageUrl;
      master = await readObject(keyFromUrl(masterUrl));
    } else {
      const selected = await readObject(keyFromUrl(run.generatedImageUrl));
      master = await upscale(selected); // clarity ×4; fal yoksa pass-through
      masterUrl = await putObject(`runs/${runId}/master.png`, master, 'image/png');
    }

    // Orientation'ı gerçek oran'dan doğrula (deterministik — resume'da da aynı sonuç).
    const meta = await sharp(master).metadata();
    if (meta.width && meta.height) {
      seo = { ...seo, attributes: { ...seo.attributes, orientation: orientationFor(meta.width, meta.height) } };
      await updatePipelineRun(runId, { seoJson: seo });
    }

    // 2) Dijital dosyalar: 5 JPG (300 DPI, <20MB) — zaten üretilmişse atla.
    // Her dosya üretilir üretilmez depoya yazılır: aynı anda bellekte tek bir 77MP çıktı bulunur
    // (5'ini biriktiren eski hal instance limitini aşıp OOM'a yol açıyordu — bkz. packaging başlığı).
    let digitalFileUrls = run.digitalFileUrls as Record<string, string> | undefined;
    if (!digitalFileUrls || Object.keys(digitalFileUrls).length === 0) {
      const map: Record<string, string> = {};
      await packageJpegs(master, async (f) => {
        map[f.key] = await putObject(`runs/${runId}/${f.filename}`, f.buffer, f.contentType);
      });
      digitalFileUrls = map;
    }
    await updatePipelineRun(runId, { upscaledImageUrl: masterUrl, digitalFileUrls });

    // Mevcut medyayı koru (resume): tamamlanmış mockup/video/ölçü tekrar üretilmez.
    const media: MediaUrls = run.mediaUrls
      ? { ...run.mediaUrls, mockups: [...(run.mediaUrls.mockups ?? [])] }
      : { mockups: [] };

    // 3) Mockup'lar (8 sahne) — mockups dizisi henüz hiç kaydedilmemişse üret.
    // HIZ: 27MB master yerine küçültülmüş kaynak (1536px JPEG) yüklenir; aynı kaynak gate-3 regen'de kullanılır.
    if (media.mockups.length === 0) {
      const mockupSource = await sharp(master)
        .resize(1536, 1536, { fit: 'inside' })
        .jpeg({ quality: 90 })
        .toBuffer();
      await putObject(`runs/${runId}/mockup-source.jpg`, mockupSource, 'image/jpeg');

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
      await updatePipelineRun(runId, { mediaUrls: media }); // checkpoint: mockup'lar
    }

    // 4) Zoom video (birincil mockup, yoksa master'dan) — yoksa üret.
    if (!media.video) {
      try {
        const firstMockup = media.mockups.find((u) => u);
        const source = firstMockup ? await readObject(keyFromUrl(firstMockup)) : master;
        const video = await makeZoomVideo(source);
        media.video = await putObject(`runs/${runId}/zoom.mp4`, video, 'video/mp4');
        await updatePipelineRun(runId, { mediaUrls: media }); // checkpoint: video
      } catch (e) {
        await addWarning(runId, `Zoom videosu üretilemedi: ${e instanceof Error ? e.message : e}`);
      }
    }

    // 5) Sabit ölçü görseli — yoksa ekle.
    if (!media.sizeGuide) {
      const sizeGuide = await getSizeGuide();
      if (sizeGuide) {
        media.sizeGuide = await putObject(
          `runs/${runId}/size-guide.${sizeGuide.ext}`,
          sizeGuide.buffer,
          sizeGuide.contentType,
        );
      }
    }

    await updatePipelineRun(runId, { mediaUrls: media, status: 'awaiting_publish', attempts: 0 });
  } catch (err) {
    await fail(runId, err);
  }
}

/**
 * Gate 3 — tek bir mockup sahnesini yeniden üretir (master'dan).
 *
 * Kira (withRunLease) BİLEREK yok: run bu adım boyunca `awaiting_publish`te kalır, yani kurtarma
 * sweeper'ı onu hiç sürdürmez — kiraya ihtiyaç yok. Dahası kullanıcı farklı sahneleri arka arkaya
 * yeniden üretebilmeli; kira ikinci isteği sessizce düşürüp UI'yi sonsuz spinner'da bırakırdı.
 */
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
export async function publishToEtsy(runId: string, price?: number, thumbnailIndex?: number): Promise<void> {
  return withRunLease(runId, 'publishToEtsy', () => publishToEtsyInner(runId, price, thumbnailIndex));
}

async function publishToEtsyInner(runId: string, price?: number, thumbnailIndex?: number): Promise<void> {
  try {
    const run = await getPipelineRun(runId);
    if (!run) throw new Error(`Pipeline run bulunamadı: ${runId}`);
    if (!run.seo) throw new Error('SEO yok — önce SEO onaylanmalı.');
    if (!run.digitalFileUrls) throw new Error('Dijital dosyalar (JPG) yok — önce paketleme yapılmalı.');

    // Resume: parametreler önce çağrıdan, yoksa kalıcı checkpoint'ten, yoksa default.
    // Böylece sweeper publishToEtsy(runId) ile yarım kalan yayını aynı fiyat/thumbnail ile sürdürür.
    const pp: PublishProgress = { ...(run.publishProgress ?? {}) };
    pp.price = price ?? pp.price ?? 5.0;
    pp.thumbnailIndex = thumbnailIndex ?? pp.thumbnailIndex ?? 0;
    const effThumb = pp.thumbnailIndex;

    await updatePipelineRun(runId, { status: 'publishing_etsy', publishProgress: pp, errorMessage: null });

    const shopId = await getShopId();
    const taxonomyId = await getDigitalPrintsTaxonomyId();
    const seo = { ...run.seo, categoryId: String(taxonomyId) };

    // 1) Taslak listing — varsa (checkpoint/etsyListingId) YENİDEN OLUŞTURMA (çift listing önlenir).
    let listingId = pp.listingId ?? run.etsyListingId;
    if (!listingId) {
      listingId = await createDraftListing(shopId, seo, pp.price);
      pp.listingId = listingId;
      await updatePipelineRun(runId, { etsyListingId: listingId, publishProgress: pp });
    }

    // 2) Öznitelikler — bir kez.
    if (!pp.attributesDone) {
      await setListingAttributes(shopId, listingId, taxonomyId, seo.attributes);
      pp.attributesDone = true;
      await updatePipelineRun(runId, { publishProgress: pp });
    }

    // Görsel sırası: seçilen thumbnail mockup EN BAŞA (Etsy ilk görseli thumbnail yapar), diğerleri, en sona ölçü.
    const allMockups = run.mediaUrls?.mockups ?? [];
    const ordered: string[] = [];
    if (allMockups[effThumb]) ordered.push(allMockups[effThumb]);
    allMockups.forEach((u, i) => {
      if (u && i !== effThumb) ordered.push(u);
    });

    // 3) Görseller — sıralı, her yüklemeden sonra checkpoint (imagesUploaded) → resume tam kaldığı yerden, çift upload yok.
    for (let i = pp.imagesUploaded ?? 0; i < ordered.length; i++) {
      const buf = await readObject(keyFromUrl(ordered[i]));
      await uploadListingImage(shopId, listingId, buf, `mockup-${i}.jpg`, 'image/jpeg', i + 1);
      pp.imagesUploaded = i + 1;
      await updatePipelineRun(runId, { publishProgress: pp });
    }

    // 4) Ölçü görseli — görsellerden sonra, EN SON rank.
    if (run.mediaUrls?.sizeGuide && !pp.sizeGuideDone) {
      const buf = await readObject(keyFromUrl(run.mediaUrls.sizeGuide));
      await uploadListingImage(shopId, listingId, buf, 'size-guide.jpg', 'image/jpeg', ordered.length + 1);
      pp.sizeGuideDone = true;
      await updatePipelineRun(runId, { publishProgress: pp });
    }

    // 5) Video — best-effort: yayını BLOKLAMAZ ama hata artık yutulmaz.
    // `videoDone` yalnızca BAŞARIDA işaretlenir; başarısızlıkta run sürdürülürse tekrar denenir.
    if (run.mediaUrls?.video && !pp.videoDone) {
      try {
        const vid = await readObject(keyFromUrl(run.mediaUrls.video));
        await uploadListingVideo(shopId, listingId, vid, 'zoom.mp4');
        pp.videoDone = true;
      } catch (e) {
        await addWarning(
          runId,
          `Etsy videoyu kabul etmedi — listing videosuz yayınlandı. Videoyu Etsy panelinden elle ` +
            `ekleyebilirsiniz (dosya gate 3 ekranında indirilebilir). Sebep: ${e instanceof Error ? e.message : e}`,
        );
        // addWarning publishProgress'i tazeledi; kendi kopyamıza uyarıları geri al ki üzerine yazmayalım.
        const fresh = await getPipelineRun(runId);
        pp.warnings = fresh?.publishProgress?.warnings ?? pp.warnings;
      }
      await updatePipelineRun(runId, { publishProgress: pp });
    } else if (!run.mediaUrls?.video && !pp.videoDone) {
      await addWarning(runId, 'Bu run için zoom videosu üretilmemişti — listing videosuz yayınlandı.');
    }

    // 6) Dijital dosyalar: 5 JPG — key bazlı checkpoint (resume'da yüklenmişleri atlar).
    const uploadedFiles = new Set(pp.filesUploaded ?? []);
    for (const [key, url] of Object.entries(run.digitalFileUrls)) {
      if (uploadedFiles.has(key)) continue;
      const buf = await readObject(keyFromUrl(url));
      await uploadListingFile(shopId, listingId, buf, `${key.replace(/_/g, '-')}.jpg`, 'image/jpeg');
      uploadedFiles.add(key);
      pp.filesUploaded = [...uploadedFiles];
      await updatePipelineRun(runId, { publishProgress: pp });
    }

    // Listing 'active' YAPILMIYOR — taslak bırakılır; yayın Etsy panelinden manuel onayla yapılır.
    await updatePipelineRun(runId, { etsyListingId: listingId, status: 'done', attempts: 0, publishProgress: pp });
  } catch (err) {
    await fail(runId, err);
  }
}

/**
 * Pinterest'te pin oluşturur — Etsy yayınından SONRA, kullanıcı Etsy panelinden listing'i kendisi
 * aktive ettikten sonra elle tetiklenir (Etsy adımı listing'i bilerek taslak bırakıyor; taslak/
 * yayında-olmayan bir listing'e pin atmak ölü link üretir, bu yüzden otomatik zincirlenmez).
 * Etsy adımının aksine tek atomik `POST /pins` çağrısıdır — checkpoint yok, resume tüm işlemi tekrarlar.
 */
export async function publishToPinterest(runId: string, copy?: PinCopy): Promise<void> {
  return withRunLease(runId, 'publishToPinterest', () => publishToPinterestInner(runId, copy));
}

async function publishToPinterestInner(runId: string, copy?: PinCopy): Promise<void> {
  try {
    const run = await getPipelineRun(runId);
    if (!run) throw new Error(`Pipeline run bulunamadı: ${runId}`);
    if (!run.etsyListingId) throw new Error('Önce Etsy yayını tamamlanmalı.');
    if (run.pinterestPinId) throw new Error("Bu run zaten Pinterest'te pinlenmiş.");

    await updatePipelineRun(runId, { status: 'publishing_pinterest', errorMessage: null });

    const mockups = run.mediaUrls?.mockups ?? [];
    const idx = run.publishProgress?.thumbnailIndex ?? 0;
    const imageUrl = mockups[idx] || mockups.find((u) => u);
    if (!imageUrl) throw new Error('Pinlenecek bir mockup görseli bulunamadı.');

    const listingUrl = `https://www.etsy.com/listing/${run.etsyListingId}`;

    // Kullanıcı gate'te metni onayladıysa o kullanılır. Onaysız (ör. kurtarma sweeper'ı)
    // çağrıda metin üretilir; Claude patlarsa eski davranışa düşülür — pin, yalnızca metin
    // üretimi başarısız oldu diye kaybedilmemeli.
    let pinCopy = copy;
    if (!pinCopy) {
      try {
        pinCopy = run.seo ? await generatePinCopy(run.seo) : fallbackPinCopy(run.seo);
      } catch (e) {
        console.warn('[pinterest] Pin metni üretilemedi, Etsy SEO metnine düşülüyor:', e);
        pinCopy = fallbackPinCopy(run.seo);
      }
    }

    const pinId = await createPin({
      imageUrl,
      link: listingUrl,
      title: pinCopy.title,
      description: pinCopy.description,
      altText: pinCopy.altText,
    });
    await updatePipelineRun(runId, { pinterestPinId: pinId, status: 'done', attempts: 0 });
  } catch (err) {
    await fail(runId, err);
  }
}

async function fail(runId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await updatePipelineRun(runId, { status: 'error', errorMessage: message });
}

/**
 * Yayını bloklamayan bir sorunu run'a KALICI olarak yazar (UI gate 3 / "tamamlandı" ekranında
 * gösterilir). `console.warn` tek başına yetmiyordu: kullanıcı listing'de video olmadığını
 * görüyor ama sebebini öğrenemiyordu ve sunucu loglarına bakmak zorunda kalıyordu.
 */
async function addWarning(runId: string, message: string): Promise<void> {
  console.warn(`[pipeline] run ${runId} uyarı: ${message}`);
  try {
    const fresh = await getPipelineRun(runId);
    const pp: PublishProgress = { ...(fresh?.publishProgress ?? {}) };
    const warnings = [...(pp.warnings ?? [])];
    if (!warnings.includes(message)) warnings.push(message);
    pp.warnings = warnings.slice(-10); // sınırlı tut
    await updatePipelineRun(runId, { publishProgress: pp });
  } catch {
    /* uyarı yazımı asla akışı bozmamalı */
  }
}

/** Reddedilen görsel için run'ı hata/iptal durumuna alır. */
export async function rejectRun(runId: string): Promise<void> {
  await updatePipelineRun(runId, {
    status: 'error',
    errorMessage: 'Görsel kullanıcı tarafından reddedildi.',
  });
}

export type { PipelineRun };
