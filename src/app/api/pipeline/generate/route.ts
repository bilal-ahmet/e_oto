/**
 * POST /api/pipeline/generate
 * Body: { prompt, model: 'imagen'|'flux', variations: number(1-4), referenceImage?: { base64, mediaType } }
 * Seçilen modelle `variations` adet varyasyon üretimini ARKA PLANDA başlatır; UI status/[id]'yi polling eder.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  createPipelineRun,
  linkCompetitorResearchToRun,
  updatePipelineRun,
} from '@/lib/db/queries';
import { generateVariations, type ReferenceImageInput } from '@/lib/pipeline/run';
import { putObject } from '@/lib/storage';
import type { ImageModel } from '@/types';

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MODELS: ImageModel[] = ['imagen', 'flux'];

export async function POST(req: NextRequest) {
  // Yakalanmamış hata Next.js production'da GÖVDESİZ 500 döner ve UI'da
  // "Unexpected end of JSON input" olarak görünür — asıl sebebi JSON'a çevirip yüzeye çıkar.
  try {
    return await handle(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Bilinmeyen sunucu hatası.';
    console.error('[pipeline/generate] beklenmeyen hata:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  let body: {
    prompt?: string;
    model?: string;
    variations?: number;
    competitorResearchId?: number;
    referenceImage?: { base64?: string; mediaType?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return NextResponse.json({ error: 'prompt zorunlu.' }, { status: 400 });

  const model = (body.model ?? 'flux') as ImageModel;
  if (!MODELS.includes(model)) {
    return NextResponse.json({ error: 'Geçersiz model (imagen | flux).' }, { status: 400 });
  }

  const variations = Math.max(1, Math.min(Number(body.variations) || 1, 4));

  let reference: ReferenceImageInput | undefined;
  if (body.referenceImage?.base64 && body.referenceImage.mediaType) {
    if (!ALLOWED_MEDIA.includes(body.referenceImage.mediaType)) {
      return NextResponse.json({ error: 'Desteklenmeyen referans görsel tipi.' }, { status: 400 });
    }
    reference = {
      base64: body.referenceImage.base64,
      mediaType: body.referenceImage.mediaType as ReferenceImageInput['mediaType'],
    };
  }

  const competitorResearchId =
    typeof body.competitorResearchId === 'number' && body.competitorResearchId > 0
      ? body.competitorResearchId
      : undefined;

  const run = await createPipelineRun(prompt, { imageModel: model, competitorResearchId });

  // Rakip analizine bağlıysa iki yönlü bağı tamamla (research → run).
  if (competitorResearchId) {
    await linkCompetitorResearchToRun(competitorResearchId, run.id);
  }

  // Referans görseli kayıt amaçlı sakla (telif: birebir kopya üretilmez — bkz. claude/vision).
  if (reference) {
    const ext = reference.mediaType.split('/')[1] ?? 'png';
    const url = await putObject(
      `runs/${run.id}/reference.${ext}`,
      Buffer.from(reference.base64, 'base64'),
      reference.mediaType,
    );
    await updatePipelineRun(run.id, { referenceImageUrl: url });
  }

  // Arka planda üret; UI polling ile takip eder.
  // (Referans modunda prompt zaten Instruction Üretici'nin onaylı transformation instruction'ıdır.)
  void generateVariations(run.id, model, prompt, variations);

  return NextResponse.json({ ...run, status: 'generating_image' }, { status: 202 });
}
