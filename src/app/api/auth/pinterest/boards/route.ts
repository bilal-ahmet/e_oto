/**
 * GET  /api/auth/pinterest/boards → hesaptaki board'ları + seçili olanı döner.
 * POST /api/auth/pinterest/boards → { boardId } seçimini app_settings'e yazar,
 *                                   { name } ise YENİ board oluşturup onu seçer.
 * DELETE /api/auth/pinterest/boards?boardId=… → board'u Pinterest'ten siler.
 *
 * Panel kartındaki board seçici bunu kullanır; board ID'si artık env değil DB'de tutulur
 * (sandbox → production geçişinde board yeniden seçilmek zorunda, redeploy beklemesin).
 * Oluşturma ucu sandbox için zorunlu: orada board pinterest.com arayüzünden açılamaz.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSetting, setSetting } from '@/lib/db/queries';
import { createBoard, deleteBoard, listBoards } from '@/lib/pinterest/boards';

export const dynamic = 'force-dynamic';

/**
 * Pinterest çağrısı patladığında dönülecek durum kodu.
 *
 * 502/504 KULLANMAYIN: DigitalOcean/Cloudflare origin'den gelen bu kodları kendi HTML hata
 * sayfalarıyla DEĞİŞTİRİR — gövdedeki gerçek hata mesajı tarayıcıya hiç ulaşmaz, panel de
 * HTML'i JSON sanıp "Unexpected token '<'" verir. 424 (Failed Dependency) semantik olarak
 * doğru ("bağımlı olduğumuz servis başarısız") ve 4xx olduğu için ara katmanlar dokunmaz.
 */
const UPSTREAM_FAILED = 424;

export async function GET() {
  try {
    const [boards, selectedBoardId] = await Promise.all([listBoards(), getSetting('pinterest_board_id')]);
    return NextResponse.json({ boards, selectedBoardId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Board listesi alınamadı.' },
      { status: UPSTREAM_FAILED },
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
        { status: UPSTREAM_FAILED },
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

export async function DELETE(req: NextRequest) {
  const boardId = req.nextUrl.searchParams.get('boardId')?.trim();
  if (!boardId) return NextResponse.json({ error: 'boardId zorunlu.' }, { status: 400 });

  try {
    await deleteBoard(boardId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Board silinemedi.' },
      { status: UPSTREAM_FAILED },
    );
  }

  // Silinen board seçiliyse seçim de temizlenir — aksi halde pin adımı var olmayan bir
  // board'a POST edip hattın sonunda 404 ile patlardı.
  if ((await getSetting('pinterest_board_id')) === boardId) {
    await setSetting('pinterest_board_id', '');
  }
  return NextResponse.json({ ok: true });
}
