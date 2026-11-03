/**
 * Run ↔ Etsy ilan durumu senkronu (SALT OKUNUR).
 *
 * NEDEN: `done` yalnızca "Etsy'ye taslak olarak aktarıldı" demektir; ilanın satışa açılması
 * kullanıcının Etsy panelindeki kararıdır. Panel "aktif ilan" sayısını ve Pinterest pin ön
 * koşulunu `done`'a değil, Etsy'den geri okunan duruma dayandırır. Okuma başarısızsa durum
 * `unknown` yazılır — eski bilgi güncelmiş gibi sunulmaz, aktif sayılmaz.
 */

import { getPipelineRun, listRunsWithListing, updatePipelineRun } from '@/lib/db/queries';
import { getOwnListingState, getShopId, type OwnListingState } from '@/lib/etsy/listings';

export interface ListingStateResult {
  runId: string;
  listingId: number;
  state: string; // Etsy değeri | 'not_found' | 'foreign_shop' | 'unknown'
  checkedAt: string;
  error?: string;
}

/** Okunan ilan bu mağazaya ait değilse 'foreign_shop' — yanlış eşleşmiş hedef, aktif sayılmaz. */
function effectiveState(r: OwnListingState, shopId: number): string {
  if (r.state !== 'not_found' && r.shopId != null && r.shopId !== shopId) return 'foreign_shop';
  return r.state;
}

export async function refreshListingState(runId: string): Promise<ListingStateResult | null> {
  const run = await getPipelineRun(runId);
  if (!run?.etsyListingId) return null;
  const checkedAt = new Date();
  let state: string;
  let error: string | undefined;
  try {
    const [r, shopId] = await Promise.all([getOwnListingState(run.etsyListingId), getShopId()]);
    state = effectiveState(r, shopId);
  } catch (e) {
    state = 'unknown';
    error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
  }
  await updatePipelineRun(runId, { etsyListingState: state, etsyStateCheckedAt: checkedAt });
  return { runId, listingId: run.etsyListingId, state, checkedAt: checkedAt.toISOString(), error };
}

/**
 * Listing'i olan run'lardan bir SAYFAYI sırayla kontrol eder (etsyFetch ~10 req/s throttle'lı).
 * Sayfalı çünkü panel isteği senkron bekler ve proxy ~60 sn'de kendi HTML 504'ünü basar —
 * istemci sayfaları tek tek ister (`hasMore`).
 */
export async function refreshListingStatesPage(
  offset: number,
  limit = 20,
): Promise<{ results: ListingStateResult[]; hasMore: boolean }> {
  const runs = await listRunsWithListing(limit + 1, offset);
  const results: ListingStateResult[] = [];
  for (const run of runs.slice(0, limit)) {
    const r = await refreshListingState(run.id);
    if (r) results.push(r);
  }
  return { results, hasMore: runs.length > limit };
}

