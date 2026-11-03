/**
 * Pinterest pin oluşturma (CLAUDE.md §8): POST /v5/pins — link Etsy listing URL'i,
 * görsel zaten public bir Spaces URL'i (image_url; re-upload gerekmez).
 */

import { getEnv } from '@/lib/env';
import { getSetting } from '@/lib/db/queries';
import { pinterestFetch } from './client';

/**
 * Pin atılacak board: önce panelden seçilen değer (app_settings), yoksa eski PINTEREST_BOARD_ID
 * env'i (geriye dönük uyumluluk). İkisi de yoksa hata EYLEM içerir — kullanıcı hattın sonunda
 * "board yok" deyip ne yapacağını bilmeden kalmasın.
 */
export async function resolveBoardId(): Promise<string> {
  const selected = await getSetting('pinterest_board_id');
  if (selected) return selected;

  const fromEnv = getEnv().PINTEREST_BOARD_ID;
  if (fromEnv) return fromEnv;

  throw new Error(
    'Pin atılacak board seçilmemiş — /admin sayfasındaki Pinterest kartından bir board seçin.',
  );
}

interface CreatePinResponse {
  id: string;
}

export interface CreatePinInput {
  imageUrl: string;
  link: string;
  title: string;
  description?: string;
  /** Görme engelli kullanıcılar + Pinterest görsel araması için alternatif metin. */
  altText?: string;
  /** Pin'in atılacağı pano; verilmezse panelde seçili varsayılan (app_settings). */
  boardId?: string;
}

/** Yeni bir pin oluşturur, oluşan pin id'sini döner. */
export async function createPin(input: CreatePinInput): Promise<string> {
  const boardId = input.boardId || (await resolveBoardId());
  const data = await pinterestFetch<CreatePinResponse>('/pins', {
    method: 'POST',
    json: {
      board_id: boardId,
      link: input.link,
      title: input.title,
      description: input.description,
      alt_text: input.altText,
      media_source: { source_type: 'image_url', url: input.imageUrl },
    },
  });
  return data.id;
}

interface PinSummary {
  id: string;
  link?: string | null;
  board_id?: string;
}

/** Pin'i geri okur (pins:read) — oluşturma sonrası link/pano doğrulaması için. */
export async function getPin(pinId: string): Promise<PinSummary> {
  return pinterestFetch<PinSummary>(`/pins/${encodeURIComponent(pinId)}`);
}

/**
 * Panoda bu Etsy ilanına link veren bir pin arar (en fazla 3 sayfa × 100).
 *
 * NEDEN: `POST /pins` zaman aşımına uğradığında pin oluşmuş OLABİLİR; Pinterest'in idempotency
 * desteği varsayılmaz. Yeniden pinlemeden önce bu mutabakat yapılır — bulunursa benimsenir,
 * bulunamazsa kullanıcıya bırakılır (kör tekrar = çift pin).
 */
export async function findPinForListing(boardId: string, listingId: number): Promise<PinSummary | null> {
  const needle = `/listing/${listingId}`;
  let bookmark: string | undefined;
  for (let page = 0; page < 3; page++) {
    const q = `page_size=100${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`;
    const data = await pinterestFetch<{ items?: PinSummary[]; bookmark?: string | null }>(
      `/boards/${encodeURIComponent(boardId)}/pins?${q}`,
    );
    const hit = (data.items ?? []).find((p) => p.link?.includes(needle));
    if (hit) return hit;
    if (!data.bookmark) break;
    bookmark = data.bookmark;
  }
  return null;
}
