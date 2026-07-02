/**
 * POST /api/pipeline/from-draft
 * Body: { draftId: string, competitorResearchId?: number }
 *
 * Kaydedilmiş bir taslağı (varyasyon/upload) doğrudan yayına götürmek için: yeni bir run oluşturur,
 * taslağı SEÇİLMİŞ GÖRSEL gibi alıp arka planda SEO üretimini başlatır (kapı 2'ye). Görsel üretimi
 * (kapı 1) atlanır — taslak zaten hazır görseldir.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  createPipelineRun,
  getImageDraft,
  linkCompetitorResearchToRun,
} from '@/lib/db/queries';
import { selectImageForRun } from '@/lib/pipeline/run';

export async function POST(req: NextRequest) {
  let body: { draftId?: string; competitorResearchId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  if (!body.draftId) return NextResponse.json({ error: 'draftId zorunlu.' }, { status: 400 });

  const draft = await getImageDraft(body.draftId);
  if (!draft) return NextResponse.json({ error: 'Taslak bulunamadı.' }, { status: 404 });

  const competitorResearchId =
    typeof body.competitorResearchId === 'number' && body.competitorResearchId > 0
      ? body.competitorResearchId
      : undefined;

  const run = await createPipelineRun(draft.prompt || 'Taslaktan başlatıldı', {
    competitorResearchId,
  });
  if (competitorResearchId) {
    await linkCompetitorResearchToRun(competitorResearchId, run.id);
  }

  // Arka planda: görseli master yap + SEO üret. UI status/[id]'yi polling eder.
  void selectImageForRun(run.id, draft.imageUrl);

  return NextResponse.json({ ...run, generatedImageUrl: draft.imageUrl, status: 'generating_seo' }, { status: 202 });
}
