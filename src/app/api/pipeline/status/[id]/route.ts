/**
 * GET /api/pipeline/status/[id] — run durumunu döner (UI polling).
 */

import { NextResponse } from 'next/server';
import { getPipelineRun } from '@/lib/db/queries';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getPipelineRun(id);
  if (!run) return NextResponse.json({ error: 'Run bulunamadı.' }, { status: 404 });
  return NextResponse.json(run);
}
