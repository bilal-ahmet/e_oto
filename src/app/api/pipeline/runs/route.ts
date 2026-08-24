/**
 * GET    /api/pipeline/runs — son pipeline run'larını döner (panel listesi).
 * DELETE /api/pipeline/runs — TÜM run kayıtlarını ve depodaki dosyalarını siler (panel "Temizle").
 */

import { NextResponse } from 'next/server';
import { deleteAllPipelineRuns, listPipelineRuns } from '@/lib/db/queries';
import { isRunActive } from '@/lib/pipeline/run';
import { deletePrefix } from '@/lib/storage';

export async function GET() {
  const runs = await listPipelineRuns(50);
  return NextResponse.json(runs);
}

/**
 * Geçmişi tamamen temizler: DB satırları + `runs/<id>/` altındaki tüm dosyalar
 * (master, baskı JPG'leri, mockuplar, video, referans görsel).
 *
 * GERİ DÖNÜŞÜ YOKTUR. Onay UI tarafında alınır (components/ClearRunsButton).
 *
 * Yayınlanmış Etsy ilanları ETKİLENMEZ — Etsy yüklenen medyanın kendi kopyasını tutar;
 * burada silinen yalnızca bizim üretim geçmişimizdir.
 *
 * Dosya silme, DB silmeden SONRA yapılır: depo hatası yüzünden yarım silinmiş bir liste
 * bırakmaktansa, kayıt gitmiş ama birkaç dosya kalmış olması tercih edilir (yetim dosya
 * zararsız, yetim kayıt kafa karıştırıcı).
 */
export async function DELETE() {
  try {
    const ids = await deleteAllPipelineRuns();

    // Arka planda hâlâ çalışan bir adım varsa kaydı silinmiş olur; adım DB'ye yazamaz ve
    // sessizce sonlanır. Kullanıcı onayladığı için engellemiyoruz, yalnızca loga düşüyoruz.
    const active = ids.filter(isRunActive);
    if (active.length > 0) {
      console.warn(`[runs/DELETE] ${active.length} run hâlâ çalışıyordu, kaydı silindi:`, active);
    }

    let filesDeleted = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        filesDeleted += await deletePrefix(`runs/${id}/`);
      } catch (e) {
        failed.push(id);
        console.error(`[runs/DELETE] ${id} dosyaları silinemedi:`, e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ ok: true, deleted: ids.length, filesDeleted, failed: failed.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Bilinmeyen hata.';
    console.error('[runs/DELETE] temizleme hatası:', e);
    return NextResponse.json({ error: `Geçmiş temizlenemedi: ${message}` }, { status: 500 });
  }
}
