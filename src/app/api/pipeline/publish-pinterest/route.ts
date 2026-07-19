/**
 * POST /api/pipeline/publish-pinterest
 * Body: { id: string }
 * Etsy yayını tamamlanmış (status='done', etsyListingId var) bir run için Pinterest pin'ini
 * ARKA PLANDA başlatır. Kullanıcı Etsy panelinden listing'i kendisi aktive ettikten sonra tetiklenir.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun } from '@/lib/db/queries';
import { publishToPinterest } from '@/lib/pipeline/run';

export async function POST(req: NextRequest) {
  let body: { id?: string };
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

  void publishToPinterest(id);
  return NextResponse.json({ ok: true, status: 'publishing_pinterest' }, { status: 202 });
}
