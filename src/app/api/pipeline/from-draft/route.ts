/**
 * POST /api/pipeline/from-draft
 * Body: { draftId: string, productType: 'print' | 'tv', competitorResearchId?: number }
 *
 * Kaydedilmiş bir taslağı (varyasyon/upload) doğrudan yayına götürmek için: yeni bir run oluşturur,
 * taslağı SEÇİLMİŞ GÖRSEL gibi alıp arka planda SEO üretimini başlatır (kapı 2'ye). Görsel üretimi
 * (kapı 1) atlanır — taslak zaten hazır görseldir.
 *
 * `productType` ZORUNLU, varsayılan yok: eskiden hiç geçilmiyordu ve her taslak sessizce 'print'
 * oluyordu — 16:9 TV görseli 5 dikey baskı dosyasına kırpılıp listing'e ölçü görseli ekleniyordu.
 * Görselin yönü de seçimle tutarlı olmalı (yatay → tv, dikey/kare → print).
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  createPipelineRun,
  getImageDraft,
  linkCompetitorResearchToRun,
} from '@/lib/db/queries';
import { sharp } from '@/lib/image/sharp';
import { selectImageForRun } from '@/lib/pipeline/run';
import { keyFromUrl, readObject } from '@/lib/storage';
import type { ProductType } from '@/types';

const PRODUCT_TYPES: ProductType[] = ['print', 'tv'];

/** TV 16:9 (1.78) üretilir; 1.3 altı yatay görsel TV dosyasına kırpılırsa sahnenin çoğu gider. */
const TV_MIN_RATIO = 1.3;

export async function POST(req: NextRequest) {
  let body: { draftId?: string; productType?: string; competitorResearchId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  if (!body.draftId) return NextResponse.json({ error: 'draftId zorunlu.' }, { status: 400 });

  const productType = body.productType as ProductType;
  if (!PRODUCT_TYPES.includes(productType)) {
    return NextResponse.json({ error: 'Ürün tipi seçilmeli (print | tv).' }, { status: 400 });
  }

  const draft = await getImageDraft(body.draftId);
  if (!draft) return NextResponse.json({ error: 'Taslak bulunamadı.' }, { status: 404 });

  // Yön kontrolü — yalnızca başlık okunur (metadata görseli decode etmez).
  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(await readObject(keyFromUrl(draft.imageUrl))).metadata();
    // EXIF 5-8 = 90°/270° döndürülmüş: görünen genişlik/yükseklik yer değiştirir.
    const rotated = (meta.orientation ?? 1) >= 5;
    width = rotated ? meta.height : meta.width;
    height = rotated ? meta.width : meta.height;
  } catch (e) {
    // Depo (upstream) hatası → 424 (502/504 DO tarafından HTML'e çevrilir, bkz. CLAUDE.md kural 4).
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Taslak görseli okunamadı: ${message}` }, { status: 424 });
  }
  if (!width || !height) {
    return NextResponse.json({ error: 'Taslak görselinin boyutu okunamadı.' }, { status: 400 });
  }
  if (productType === 'tv' && width / height < TV_MIN_RATIO) {
    return NextResponse.json(
      { error: `Frame TV için yatay (16:9'a yakın) görsel gerekir; bu taslak ${width}×${height}. Printable olarak devam et.` },
      { status: 400 },
    );
  }
  if (productType === 'print' && width > height) {
    return NextResponse.json(
      { error: `Printable için dikey görsel gerekir; bu taslak yatay (${width}×${height}). Frame TV olarak devam et.` },
      { status: 400 },
    );
  }

  const competitorResearchId =
    typeof body.competitorResearchId === 'number' && body.competitorResearchId > 0
      ? body.competitorResearchId
      : undefined;

  const run = await createPipelineRun(draft.prompt || 'Taslaktan başlatıldı', {
    competitorResearchId,
    productType,
  });
  if (competitorResearchId) {
    await linkCompetitorResearchToRun(competitorResearchId, run.id);
  }

  // Arka planda: görseli master yap + SEO üret. UI status/[id]'yi polling eder.
  void selectImageForRun(run.id, draft.imageUrl);

  return NextResponse.json({ ...run, generatedImageUrl: draft.imageUrl, status: 'generating_seo' }, { status: 202 });
}
