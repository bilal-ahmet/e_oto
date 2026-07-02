/**
 * POST /api/pipeline/regenerate-mockup
 * Body: { id: string, index: number }
 * Gate 3 — beğenilmeyen tek bir mockup sahnesini ARKA PLANDA yeniden üretir.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun } from '@/lib/db/queries';
import { regenerateMockup } from '@/lib/pipeline/run';

export async function POST(req: NextRequest) {
  let body: { id?: string; index?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  const { id, index } = body;
  if (!id) return NextResponse.json({ error: 'id zorunlu.' }, { status: 400 });
  if (typeof index !== 'number') return NextResponse.json({ error: 'index zorunlu.' }, { status: 400 });

  const run = await getPipelineRun(id);
  if (!run) return NextResponse.json({ error: 'Run bulunamadı.' }, { status: 404 });
  if (run.status !== 'awaiting_publish') {
    return NextResponse.json({ error: `Bu adımda mockup üretilemez (durum: ${run.status}).` }, { status: 409 });
  }

  void regenerateMockup(id, index);
  return NextResponse.json({ ok: true, status: 'processing_files' }, { status: 202 });
}
