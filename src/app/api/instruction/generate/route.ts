/**
 * POST /api/instruction/generate
 * Body: { referenceImage: { base64, mediaType }, note?: string, productType?: 'print' | 'tv' }
 *
 * Referans görseli Claude Vision'a verir; görselin tek başına kullanılabilir sahne promptunu
 * (referencePrompt) ve ondan uzaklaşmayan 2 temalı varyantı üretir. SENKRON döner:
 * { referencePrompt, variants: [{ theme, prompt }] }. Panel bunları kart olarak gösterir;
 * kullanıcı seçtiğini Prompt kutusuna alır, düzenleyip üretimi başlatır (görsel üretmez).
 * Upstream (Claude) hatası → 424 (502/504 DEĞİL — CLAUDE.md kural 4).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { generateThemePrompts } from '@/lib/claude/vision';
import { MAX_UPLOAD_BYTES, bodyErrorStatus, decodeBase64Limited, readJsonBody } from '@/lib/http/body';

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const UPSTREAM_FAILED = 424;

export async function POST(req: NextRequest) {
  let body: { referenceImage?: { base64?: string; mediaType?: string }; note?: string; productType?: string };
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
    const result = await generateThemePrompts(
      base64,
      mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      { note: body.note, productType: body.productType === 'tv' ? 'tv' : 'print' },
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Prompt üretilemedi.';
    return NextResponse.json({ error: message }, { status: UPSTREAM_FAILED });
  }
}
