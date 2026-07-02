/**
 * POST /api/instruction/generate
 * Body: { referenceImage: { base64, mediaType }, note?: string }
 *
 * Referans görseli Claude Vision'a verir, görsellere gönderilecek İngilizce transformation
 * instruction'ı üretir (kullanıcının opsiyonel notu talimata entegre edilir). SENKRON döner:
 * { instruction }. Frontend bu metni Prompt kutusuna yazar; kullanıcı düzenleyip üretimi başlatır.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { generateTransformationInstruction } from '@/lib/claude/vision';

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(req: NextRequest) {
  let body: { referenceImage?: { base64?: string; mediaType?: string }; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  const base64 = body.referenceImage?.base64;
  const mediaType = body.referenceImage?.mediaType;
  if (!base64 || !mediaType) {
    return NextResponse.json({ error: 'referenceImage (base64 + mediaType) zorunlu.' }, { status: 400 });
  }
  if (!ALLOWED_MEDIA.includes(mediaType)) {
    return NextResponse.json({ error: 'Desteklenmeyen referans görsel tipi.' }, { status: 400 });
  }

  try {
    const instruction = await generateTransformationInstruction(
      base64,
      mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      body.note,
    );
    return NextResponse.json({ instruction });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Talimat üretilemedi.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
