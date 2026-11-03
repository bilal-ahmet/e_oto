/**
 * POST /api/pipeline/etsy-state
 * Body: { id: string }            → tek run'ın Etsy ilan durumunu okur
 *       { offset?: number }        → listing'i olan run'lardan bir sayfayı (20) okur; `hasMore` döner
 *
 * SALT OKUNUR: Etsy'den yalnız `GET /listings/{id}` yapılır, ilana hiçbir şey yazılmaz.
 * Sonuç `pipeline_runs.etsy_listing_state` + `etsy_state_checked_at`'e yazılır; panel "aktif"
 * sayısını buna dayandırır. Okuma başarısız olursa durum 'unknown' olur (aktif sayılmaz).
 * Upstream (Etsy) kimlik/erişim hatası → 424 (502/504 DEĞİL — CLAUDE.md kural 4).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { refreshListingState, refreshListingStatesPage } from '@/lib/pipeline/listing-state';
import { getShopId } from '@/lib/etsy/listings';

const UPSTREAM_FAILED = 424;

export async function POST(req: NextRequest) {
  let body: { id?: string; offset?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Önce kimlik: Etsy'ye hiç erişilemiyorsa her satıra 'unknown' yazmak yerine net hata dön.
  try {
    await getShopId();
  } catch (e) {
    return NextResponse.json(
      { error: `Etsy'ye erişilemedi: ${e instanceof Error ? e.message : String(e)}` },
      { status: UPSTREAM_FAILED },
    );
  }

  if (body.id) {
    const result = await refreshListingState(body.id);
    if (!result) return NextResponse.json({ error: "Bu run'ın Etsy ilanı yok." }, { status: 404 });
    return NextResponse.json({ result });
  }

  const offset = Number.isInteger(body.offset) && body.offset! >= 0 ? body.offset! : 0;
  const page = await refreshListingStatesPage(offset);
  return NextResponse.json({ ...page, nextOffset: offset + page.results.length });
}
