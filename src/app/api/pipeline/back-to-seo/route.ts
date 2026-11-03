/**
 * POST /api/pipeline/back-to-seo
 * Body: { id: string }
 *
 * Kapı 3 (yayın onayı) → kapı 2 (metin onayı). Yalnız durum değişir; YENİ İŞ ÜRETMEZ.
 *
 * NEDEN: Yayın öncesi doğrulama (`validateListingSeo`) metinde düzeltme gerektiren bir sorun
 * bulursa (ör. bu kural gelmeden onaylanmış bir SEO'da AI beyanı eksik) gate 3'te metin
 * düzenlenemiyordu. Kullanıcı metne döner, düzeltip onaylar; işleme adımı mevcut master/dosya/
 * mockup/videoyu atlar (idempotent) — ek üretim maliyeti yok.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun, updatePipelineRun } from '@/lib/db/queries';
import { isRunActive } from '@/lib/pipeline/run';

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
  if (run.status !== 'awaiting_publish' || isRunActive(id)) {
    return NextResponse.json({ error: `Yalnız yayın onayındaki run metne döndürülebilir (durum: ${run.status}).` }, { status: 409 });
  }
  if (run.etsyListingId || !run.seo) {
    return NextResponse.json({ error: "Bu run'ın Etsy taslağı var ya da SEO verisi yok — metne dönülemez." }, { status: 409 });
  }

  await updatePipelineRun(id, { status: 'awaiting_seo_approval', errorMessage: null });
  return NextResponse.json({ ok: true, status: 'awaiting_seo_approval' });
}
