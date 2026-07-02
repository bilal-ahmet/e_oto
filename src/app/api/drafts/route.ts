/**
 * GET  /api/drafts            → kaydedilmiş görsel taslaklarını listeler.
 * POST /api/drafts            → taslak kaydeder. İki mod:
 *   - { variationUrl, prompt? }            → mevcut bir varyasyon görselini taslaklara KOPYALAR.
 *   - { upload: { base64, mediaType } }    → dışarıdan yüklenen görseli taslaklara ekler.
 *
 * Görsel her durumda `drafts/<uuid>.<ext>` altına kopyalanır (taslak, run'dan bağımsız yaşar).
 */

import { randomUUID } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createImageDraft, listImageDrafts } from '@/lib/db/queries';
import { keyFromUrl, putObject, readObject } from '@/lib/storage';

const ALLOWED_MEDIA: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export async function GET() {
  const drafts = await listImageDrafts();
  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest) {
  let body: {
    variationUrl?: string;
    prompt?: string;
    upload?: { base64?: string; mediaType?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  try {
    // Mod B — dışarıdan yükleme.
    if (body.upload?.base64 && body.upload.mediaType) {
      const ext = ALLOWED_MEDIA[body.upload.mediaType];
      if (!ext) {
        return NextResponse.json({ error: 'Desteklenmeyen görsel tipi.' }, { status: 400 });
      }
      const buffer = Buffer.from(body.upload.base64, 'base64');
      const url = await putObject(`drafts/${randomUUID()}.${ext}`, buffer, body.upload.mediaType);
      const draft = await createImageDraft({ imageUrl: url, source: 'upload' });
      return NextResponse.json({ draft }, { status: 201 });
    }

    // Mod A — mevcut varyasyonu taslaklara kopyala.
    if (body.variationUrl) {
      const srcKey = keyFromUrl(body.variationUrl);
      const buffer = await readObject(srcKey);
      const ext = srcKey.split('.').pop()?.toLowerCase() || 'png';
      const url = await putObject(`drafts/${randomUUID()}.${ext}`, buffer, 'image/png');
      const draft = await createImageDraft({
        imageUrl: url,
        source: 'variation',
        prompt: body.prompt?.trim() || undefined,
      });
      return NextResponse.json({ draft }, { status: 201 });
    }

    return NextResponse.json(
      { error: 'variationUrl veya upload (base64+mediaType) zorunlu.' },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Taslak kaydedilemedi.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
