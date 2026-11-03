/**
 * POST /api/pipeline/publish-pinterest
 * Body: { id: string, title?, description?, altText? }
 * Etsy yayını tamamlanmış (status='done', etsyListingId var) bir run için Pinterest pin'ini
 * ARKA PLANDA başlatır. Kullanıcı Etsy panelinden listing'i kendisi aktive ettikten sonra tetiklenir.
 *
 * Metin alanları /api/pipeline/pin-copy ile üretilip kullanıcı tarafından onaylanmış metindir;
 * gelmezse pipeline kendisi üretir (bkz. publishToPinterest).
 *
 * Ek alanlar: `boardId` (bu pin için pano; yoksa panelde seçili varsayılan — varsayılan DEĞİŞMEZ),
 * `force` (önceki belirsiz denemeye rağmen bilinçli yeni pin).
 *
 * Ön koşul SENKRON kontrol edilir: Etsy ilanı salt okunur okunur; `active` değilse ya da başka
 * mağazaya aitse 409 + sebep döner, pin atılmaz ve run `error`'a düşmez. Etsy okunamazsa 424.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun } from '@/lib/db/queries';
import { publishToPinterest } from '@/lib/pipeline/run';
import { refreshListingState } from '@/lib/pipeline/listing-state';
import { listingStateLabel } from '@/lib/status';

const UPSTREAM_FAILED = 424;

export async function POST(req: NextRequest) {
  let body: { id?: string; title?: string; description?: string; altText?: string; boardId?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: 'id zorunlu.' }, { status: 400 });

  const run = await getPipelineRun(id);
  if (!run) return NextResponse.json({ error: 'Run bulunamadı.' }, { status: 404 });
  if (run.status !== 'done') {
    return NextResponse.json({ error: `Bu adımda pinlenemez (durum: ${run.status}).` }, { status: 409 });
  }
  if (!run.etsyListingId) {
    return NextResponse.json({ error: 'Önce Etsy yayını tamamlanmalı.' }, { status: 409 });
  }
  if (run.pinterestPinId) {
    return NextResponse.json({ error: "Bu run zaten Pinterest'te pinlenmiş." }, { status: 409 });
  }

  // Başlık zorunlu alan; onaylanmış metin ancak eksiksizse kullanılır, aksi halde
  // pipeline kendi üretir.
  const title = body.title?.trim();
  const copy = title
    ? {
        title,
        description: body.description?.trim() ?? '',
        altText: body.altText?.trim() ?? '',
      }
    : undefined;

  const st = await refreshListingState(id);
  if (!st || st.state === 'unknown') {
    return NextResponse.json(
      { error: `Etsy ilan durumu okunamadı — pin atılmadı. ${st?.error ?? ''}`.trim() },
      { status: UPSTREAM_FAILED },
    );
  }
  if (st.state !== 'active') {
    return NextResponse.json(
      {
        error: `Pin atılmadı — Etsy ilanı #${st.listingId}: ${listingStateLabel(st.state)}. İlanı Etsy'de yayına alıp tekrar deneyin.`,
        listingState: st.state,
      },
      { status: 409 },
    );
  }

  void publishToPinterest(id, copy, { boardId: body.boardId?.trim() || undefined, force: body.force === true });
  return NextResponse.json({ ok: true, status: 'publishing_pinterest' }, { status: 202 });
}
