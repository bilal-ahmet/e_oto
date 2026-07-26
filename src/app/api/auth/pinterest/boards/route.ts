/**
 * GET  /api/auth/pinterest/boards → hesaptaki board'ları + seçili olanı döner.
 * POST /api/auth/pinterest/boards → { boardId } seçimini app_settings'e yazar,
 *                                   { name } ise YENİ board oluşturup onu seçer.
 *
 * Panel kartındaki board seçici bunu kullanır; board ID'si artık env değil DB'de tutulur
 * (sandbox → production geçişinde board yeniden seçilmek zorunda, redeploy beklemesin).
 * Oluşturma ucu sandbox için zorunlu: orada board pinterest.com arayüzünden açılamaz.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSetting, setSetting } from '@/lib/db/queries';
import { createBoard, listBoards } from '@/lib/pinterest/boards';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [boards, selectedBoardId] = await Promise.all([listBoards(), getSetting('pinterest_board_id')]);
    return NextResponse.json({ boards, selectedBoardId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Board listesi alınamadı.' },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: { boardId?: string; name?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  // Oluşturma modu: board yaratılır ve DOĞRUDAN seçilir — kullanıcının ikinci bir adım
  // atması gerekmesin (tek board'luk kullanımda seçmemek dışında bir seçenek yok zaten).
  const name = body.name?.trim();
  if (name) {
    try {
      const board = await createBoard(name, body.description?.trim() || undefined);
      await setSetting('pinterest_board_id', board.id);
      return NextResponse.json({ ok: true, board, selectedBoardId: board.id });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Board oluşturulamadı.' },
        { status: 502 },
      );
    }
  }

  const boardId = body.boardId?.trim();
  if (!boardId) {
    return NextResponse.json({ error: 'boardId veya name zorunlu.' }, { status: 400 });
  }

  await setSetting('pinterest_board_id', boardId);
  return NextResponse.json({ ok: true, selectedBoardId: boardId });
}
