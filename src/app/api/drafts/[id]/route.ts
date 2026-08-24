/**
 * DELETE /api/drafts/[id]  → taslağı kayıtlardan VE depodan siler.
 *
 * Dosya eskiden depoda bırakılıyordu; kayıt gidince galeride görünmediği için hiçbir zaman
 * temizlenmeyen yetim dosyalar birikiyordu (run temizliği dosyaları sildiği hâlde taslaklar
 * silmiyordu — tutarsızdı). Dosya silme kayıt silmeden SONRA ve best-effort yapılır: depo
 * hatası yüzünden kullanıcının silme işlemi başarısız görünmesin.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { deleteImageDraft, getImageDraft } from '@/lib/db/queries';
import { deleteObject, keyFromUrl } from '@/lib/storage';

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const draft = await getImageDraft(id);
  if (!draft) return NextResponse.json({ error: 'Taslak bulunamadı.' }, { status: 404 });

  await deleteImageDraft(id);

  try {
    await deleteObject(keyFromUrl(draft.imageUrl));
  } catch (e) {
    console.error(`[drafts/DELETE] ${id} dosyası silinemedi:`, e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}
