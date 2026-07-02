/**
 * POST /api/pipeline/reject
 * Body: { id: string }
 * Run'ı iptal/hata durumuna alır (kullanıcı görseli/akışı reddetti).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun } from '@/lib/db/queries';
import { rejectRun } from '@/lib/pipeline/run';

export async function POST(req: NextRequest) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: 'id zorunlu.' }, { status: 400 });

  const run = await getPipelineRun(body.id);
  if (!run) return NextResponse.json({ error: 'Run bulunamadı.' }, { status: 404 });

  await rejectRun(body.id);
  return NextResponse.json({ ok: true, status: 'error' });
}
