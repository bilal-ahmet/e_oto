/**
 * POST /api/pipeline/publish
 * Body: { id: string, price?: number }
 * Kapı 3 onayı — Etsy yayınını ARKA PLANDA başlatır (taslak listing + görsel + 5 ZIP + aktive).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun } from '@/lib/db/queries';
import { publishToEtsy } from '@/lib/pipeline/run';

export async function POST(req: NextRequest) {
  let body: { id?: string; price?: number; thumbnailIndex?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: 'id zorunlu.' }, { status: 400 });

  const run = await getPipelineRun(id);
  if (!run) return NextResponse.json({ error: 'Run bulunamadı.' }, { status: 404 });
  if (run.status !== 'awaiting_publish') {
    return NextResponse.json({ error: `Bu adımda yayınlanamaz (durum: ${run.status}).` }, { status: 409 });
  }

  const price = typeof body.price === 'number' && body.price > 0 ? body.price : 5.0;
  const thumbnailIndex = typeof body.thumbnailIndex === 'number' ? body.thumbnailIndex : 0;
  void publishToEtsy(id, price, thumbnailIndex);
  return NextResponse.json({ ok: true, status: 'publishing_etsy' }, { status: 202 });
}
