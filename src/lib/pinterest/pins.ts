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
async function resolveBoardId(): Promise<string> {
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
}

/** Yeni bir pin oluşturur, oluşan pin id'sini döner. */
export async function createPin(input: CreatePinInput): Promise<string> {
  const boardId = await resolveBoardId();
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
