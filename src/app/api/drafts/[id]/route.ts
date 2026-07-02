/**
 * DELETE /api/drafts/[id]  → taslağı kayıtlardan siler.
 * (Disk dosyası lokal sürücüde bırakılır; kayıt silinince galeride görünmez.)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { deleteImageDraft, getImageDraft } from '@/lib/db/queries';

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const draft = await getImageDraft(id);
  if (!draft) return NextResponse.json({ error: 'Taslak bulunamadı.' }, { status: 404 });
  await deleteImageDraft(id);
  return NextResponse.json({ ok: true });
}
