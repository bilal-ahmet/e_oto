/**
 * Pinterest board listesi — pin'in hangi board'a atılacağını panelden seçebilmek için.
 *
 * NEDEN: Board ID önceden yalnızca PINTEREST_BOARD_ID env'inden geliyordu; kullanıcının bu
 * ID'yi bulmasının bir yolu yoktu ve her değişiklik redeploy gerektiriyordu. Sandbox board
 * ID'leri production'da geçersiz olduğundan, standart erişime geçişte board mutlaka yeniden
 * seçilir — bu yüzden seçim env'de değil app_settings'te tutulur.
 *
 * `boards:read` scope'u oauth.PINTEREST_SCOPES içinde zaten isteniyor.
 */

import { pinterestFetch } from './client';

export interface PinterestBoard {
  id: string;
  name: string;
  privacy: string;
}

interface BoardsResponse {
  items?: Array<{ id: string; name: string; privacy?: string }>;
}

/**
 * Hesaptaki board'ları döner (ilk sayfa — 100 kayıt; tek mağazalık kullanım için fazlasıyla yeterli).
 */
export async function listBoards(): Promise<PinterestBoard[]> {
  const data = await pinterestFetch<BoardsResponse>('/boards?page_size=100');
  return (data.items ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    privacy: b.privacy ?? 'PUBLIC',
  }));
}
