/**
 * POST /api/pipeline/select-image
 * Body: { id: string, index: number }
 * Kapı 1 onayı — seçilen varyasyonu işaretler ve SEO üretimini ARKA PLANDA başlatır.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun } from '@/lib/db/queries';
import { selectVariation } from '@/lib/pipeline/run';

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
  if (run.status !== 'awaiting_approval') {
    return NextResponse.json({ error: `Bu adımda görsel seçilemez (durum: ${run.status}).` }, { status: 409 });
  }

  void selectVariation(id, index);
  return NextResponse.json({ ok: true, status: 'generating_seo' }, { status: 202 });
}
