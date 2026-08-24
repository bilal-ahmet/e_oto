/**
 * POST /api/pipeline/reject
 * Body: { id: string }
 * Run'ı iptal/hata durumuna alır (kullanıcı görseli/akışı reddetti).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun } from '@/lib/db/queries';
import { isRunActive, rejectRun } from '@/lib/pipeline/run';
import type { PipelineStatus } from '@/types';

/**
 * Reddin GEÇERLİ olduğu durumlar: insan-onayı kapıları + zaten bitmiş run'lar.
 *
 * NEDEN LİSTE VAR: `rejectRun` yalnızca `status='error'` yazar, çalışan adımı DURDURAMAZ.
 * `processing_files` gibi bir adımın ortasında çağrılırsa arka plan işi para harcamaya devam
 * eder ve bittiğinde `awaiting_publish` yazıp reddi SESSİZCE GERİ ALIR. Arayüz bu butonu
 * zaten yalnızca kapılarda gösteriyor; uç da aynı kuralı uygulasın.
 */
const REJECTABLE: PipelineStatus[] = [
  'queued',
  'awaiting_approval',
  'awaiting_seo_approval',
  'awaiting_publish',
  'done',
  'error',
];

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

  if (!REJECTABLE.includes(run.status) || isRunActive(body.id)) {
    return NextResponse.json(
      {
        error:
          `Bu run şu anda iptal edilemez (durum: ${run.status}). Çalışan bir adım durdurulamaz — ` +
          'bitmesini bekleyin, sonraki onay kapısında iptal edebilirsiniz.',
      },
      { status: 409 },
    );
  }

  await rejectRun(body.id);
  return NextResponse.json({ ok: true, status: 'error' });
}
