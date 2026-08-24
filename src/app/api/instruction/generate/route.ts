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
import { MAX_UPLOAD_BYTES, bodyErrorStatus, decodeBase64Limited, readJsonBody } from '@/lib/http/body';

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(req: NextRequest) {
  let body: { referenceImage?: { base64?: string; mediaType?: string }; note?: string };
  try {
    body = await readJsonBody(req);
  } catch (e) {
    const status = bodyErrorStatus(e) ?? 400;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }

  const base64 = body.referenceImage?.base64;
  const mediaType = body.referenceImage?.mediaType;
  if (!base64 || !mediaType) {
    return NextResponse.json({ error: 'referenceImage (base64 + mediaType) zorunlu.' }, { status: 400 });
  }
  if (!ALLOWED_MEDIA.includes(mediaType)) {
    return NextResponse.json({ error: 'Desteklenmeyen referans görsel tipi.' }, { status: 400 });
  }
  // Görsel Claude'a base64 olarak GEÇİLİR (buffer'a çevrilmez); yine de çözülmüş boyutu
  // doğrula — tavanı aşan bir görsel hem belleği hem Claude token bütçesini boşa harcar.
  try {
    decodeBase64Limited(base64, MAX_UPLOAD_BYTES);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: bodyErrorStatus(e) ?? 400 });
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
