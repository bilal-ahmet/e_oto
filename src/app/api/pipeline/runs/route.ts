/**
 * GET /api/pipeline/runs — son pipeline run'larını döner (dashboard).
 */

import { NextResponse } from 'next/server';
import { listPipelineRuns } from '@/lib/db/queries';

export async function GET() {
  const runs = await listPipelineRuns(50);
  return NextResponse.json(runs);
}
