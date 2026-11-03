/**
 * POST /api/pipeline/resume
 * Body: { id: string }
 *
 * Hata almış bir run'ı, ELDEKİ ÇIKTILARIN İZİN VERDİĞİ en ileri onay kapısına geri alır.
 *
 * NEDEN VAR: Bir adım patladığında (örn. yayın anında "Etsy bağlantısı yok") run `error`e
 * düşüyor ve adım route'ları yalnızca kendi `awaiting_*` durumunu kabul ettiği için run bir daha
 * ilerletilemiyordu — upscale, 8 mockup, video ve 5 JPG için harcanan para çöpe gidiyordu.
 * Sebep giderildikten sonra (Etsy'ye bağlandıktan sonra) bu uç run'ı kaldığı kapıya döndürür.
 *
 * Yeni iş ÜRETMEZ; yalnızca durumu geri alır. Hangi kapıya döneceği elde ne olduğuna bakılarak
 * belirlenir, böylece tamamlanmış hiçbir adım tekrarlanmaz.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun, updatePipelineRun } from '@/lib/db/queries';
import { displayStatus } from '@/lib/status';
import type { PipelineStatus } from '@/types';

export async function POST(req: NextRequest) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: 'id zorunlu.' }, { status: 400 });

  const run = await getPipelineRun(id);
  if (!run) return NextResponse.json({ error: 'Run bulunamadı.' }, { status: 404 });
  // Kullanıcı reddi (tarihsel 'error' + red mesajı dahil) teknik hata değildir — sürdürülmez.
  if (run.status !== 'error' || displayStatus(run) === 'rejected') {
    return NextResponse.json(
      { error: `Yalnızca hata almış run'lar sürdürülebilir (durum: ${run.status}).` },
      { status: 409 },
    );
  }

  // En ileriden geriye doğru: ne kadar çıktı varsa o kadar ileri kapıya dön.
  const hasMedia = Boolean(run.mediaUrls?.mockups?.some((u) => u));
  const hasFiles = Boolean(run.digitalFileUrls && Object.keys(run.digitalFileUrls).length > 0);

  let status: PipelineStatus;
  if (run.etsyListingId && run.errorStage === 'publishing_pinterest') {
    status = 'done'; // Etsy tamam, yalnız pin düştü — pin, "tamamlandı" ekranından yeniden denenir
  } else if (run.seo && !run.etsyListingId && run.errorKind === 'validation' && run.errorStage === 'publishing_etsy') {
    // İçerik düzeltmesi gerekiyor (ör. AI beyanı eksik, fiziksel materyal) ve gate 3'te SEO
    // düzenlenemiyor → SEO kapısına dön. Yeniden onayda işleme adımı mevcut master/dosya/mockup/
    // videoyu ATLAR (idempotent) — ek üretim maliyeti yok.
    status = 'awaiting_seo_approval';
  } else if (run.seo && hasFiles && hasMedia) {
    status = 'awaiting_publish'; // kapı 3: medya + dosyalar hazır, yalnızca yayın kaldı
  } else if (run.seo) {
    status = 'awaiting_seo_approval'; // kapı 2: SEO var, işleme yeniden çalıştırılabilir
  } else if (run.variationUrls?.length) {
    status = 'awaiting_approval'; // kapı 1: varyasyonlar duruyor
  } else {
    return NextResponse.json(
      { error: 'Bu run sürdürülemez — elde kullanılabilir bir çıktı yok. Yeni üretim başlatın.' },
      { status: 409 },
    );
  }

  // attempts sıfırlanır: kurtarma sweeper'ının önceki başarısız denemeleri yeni akışı engellemesin.
  await updatePipelineRun(id, { status, attempts: 0, errorMessage: null });
  return NextResponse.json({ ok: true, status });
}
