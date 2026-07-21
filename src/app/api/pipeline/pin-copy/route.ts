/**
 * POST /api/pipeline/pin-copy
 * Body: { id: string }
 * Bir run için Pinterest pin metnini ÜRETİR ve döner — DB'ye yazmaz, pin atmaz.
 * Kullanıcı metni düzenleyip onayladıktan sonra /api/pipeline/publish-pinterest'e geçirir
 * (CLAUDE.md §1: hiçbir adım kullanıcı görmeden geçilmez).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPipelineRun } from '@/lib/db/queries';
import { fallbackPinCopy, generatePinCopy } from '@/lib/claude/pin-copy';

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
  if (!run.seo) return NextResponse.json({ error: 'Bu run için SEO verisi yok.' }, { status: 409 });

  // Claude erişilemezse akışı durdurmak yerine düzenlenebilir bir taslak döneriz —
  // kullanıcı metni zaten gate'te elden geçiriyor.
  try {
    const copy = await generatePinCopy(run.seo);
    return NextResponse.json({ copy, generated: true });
  } catch (e) {
    return NextResponse.json({
      copy: fallbackPinCopy(run.seo),
      generated: false,
      warning: e instanceof Error ? e.message : 'Pin metni üretilemedi; Etsy SEO metni kullanıldı.',
    });
  }
}
