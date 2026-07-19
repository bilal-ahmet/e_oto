/**
 * Pinterest pin oluşturma (CLAUDE.md §8): POST /v5/pins — link Etsy listing URL'i,
 * görsel zaten public bir Spaces URL'i (image_url; re-upload gerekmez).
 */

import { getEnv } from '@/lib/env';
import { pinterestFetch } from './client';

function requirePinterestBoardConfig(): string {
  const env = getEnv();
  if (!env.PINTEREST_BOARD_ID) {
    throw new Error('PINTEREST_BOARD_ID tanımlı değil — pin oluşturulacak board seçilmemiş.');
  }
  return env.PINTEREST_BOARD_ID;
}

interface CreatePinResponse {
  id: string;
}

/** Yeni bir pin oluşturur, oluşan pin id'sini döner. */
export async function createPin(
  imageUrl: string,
  link: string,
  title: string,
  description?: string,
): Promise<string> {
  const boardId = requirePinterestBoardConfig();
  const data = await pinterestFetch<CreatePinResponse>('/pins', {
    method: 'POST',
    json: {
      board_id: boardId,
      link,
      title,
      description,
      media_source: { source_type: 'image_url', url: imageUrl },
    },
  });
  return data.id;
}
