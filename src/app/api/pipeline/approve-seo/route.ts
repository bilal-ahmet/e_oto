/**
 * POST /api/pipeline/approve-seo
 * Body: { id: string, seo: SeoData }
 * Kapı 2 onayı — (düzenlenmiş) SEO'yu kaydeder ve 5 ZIP paketlemeyi ARKA PLANDA başlatır.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun } from '@/lib/db/queries';
import { approveSeoAndProcess } from '@/lib/pipeline/run';
import type { SeoData } from '@/types';

function isValidSeo(s: unknown): s is SeoData {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.title === 'string' &&
    Array.isArray(o.tags) &&
    typeof o.description === 'string' &&
    Array.isArray(o.materials) &&
    typeof o.categoryId === 'string' &&
    typeof o.hook === 'string' &&
    Array.isArray(o.perfectFor) &&
    typeof o.attributes === 'object' &&
    o.attributes !== null
  );
}

export async function POST(req: NextRequest) {
  let body: { id?: string; seo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  const { id, seo } = body;
  if (!id) return NextResponse.json({ error: 'id zorunlu.' }, { status: 400 });
  if (!isValidSeo(seo)) return NextResponse.json({ error: 'Geçersiz SEO verisi.' }, { status: 400 });

  const run = await getPipelineRun(id);
  if (!run) return NextResponse.json({ error: 'Run bulunamadı.' }, { status: 404 });
  if (run.status !== 'awaiting_seo_approval') {
    return NextResponse.json({ error: `Bu adımda SEO onaylanamaz (durum: ${run.status}).` }, { status: 409 });
  }

  void approveSeoAndProcess(id, seo);
  return NextResponse.json({ ok: true, status: 'processing_files' }, { status: 202 });
}
