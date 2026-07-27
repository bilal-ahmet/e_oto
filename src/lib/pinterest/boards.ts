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

/**
 * Yeni board oluşturur.
 *
 * NEDEN GEREKLİ: Sandbox'ın (trial access) varlık dünyası production'dan AYRIDIR —
 * pinterest.com arayüzünde elle açılan board sandbox API'sinde görünmez, `listBoards`
 * boş döner. Sandbox'ta board yalnızca bu uçla yaratılabilir. Standart erişimde de zararsız:
 * board'u panelden açmak, ID'yi elle bulmaktan kolay.
 */
export async function createBoard(name: string, description?: string): Promise<PinterestBoard> {
  const data = await pinterestFetch<{ id: string; name: string; privacy?: string }>('/boards', {
    method: 'POST',
    json: { name, description, privacy: 'PUBLIC' },
  });
  return { id: data.id, name: data.name, privacy: data.privacy ?? 'PUBLIC' };
}

/**
 * Board'u ve İÇİNDEKİ TÜM PİNLERİ kalıcı olarak siler (Pinterest'te geri alınamaz).
 *
 * createBoard ile aynı gerekçe: sandbox board'ları pinterest.com arayüzünde görünmediğinden
 * yanlışlıkla açılan bir board'u temizlemenin başka yolu yok.
 */
export async function deleteBoard(boardId: string): Promise<void> {
  await pinterestFetch(`/boards/${encodeURIComponent(boardId)}`, { method: 'DELETE' });
}
