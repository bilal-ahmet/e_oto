/**
 * Rakip SEO analizi — Claude ile özgün SEO üretimi (yapılandırılmış çıktı).
 *
 * Kullanıcının girdiği bir Etsy listing URL'inden çekilen referans veriler (title/tags/description
 * vb.) verilir; aynı arama niyetini/nişi hedefleyen AMA özgün bir title + 13 tag + SEO açıklaması
 * üretilir (birebir kopya değil). Bu çıktı önizleme olarak gösterilir ve gate 2'deki vision SEO'ya
 * (generateSeo competitorRef) referans olarak beslenir.
 *
 * Not: Burası METİN-only bir analizdir (görsel kullanılmaz). Görsele uygun NİHAİ SEO gate 2'de
 * üretilir; bu adım yalnızca niş/keyword yönünü belirler.
 */

import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic, CLAUDE_MODEL } from './client';

export interface CompetitorSource {
  title: string;
  tags: string[];
  description: string;
  materials?: string[];
  style?: string[];
  taxonomyId?: number;
  whoMade?: string;
  whenMade?: string;
  numFavorers?: number;
  views?: number;
}

export interface GeneratedSeo {
  title: string;
  tags: string[];
  description: string;
}

const AnalysisSchema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
  description: z.string(),
});

const SYSTEM = `You are an Etsy SEO expert for a digital wall-art / printable shop (instant-download prints). You are given a TOP-PERFORMING competitor listing in this niche. Produce ORIGINAL, competitive SEO for OUR own product in the SAME niche — target the same search intent, but DO NOT copy. Generate everything in ENGLISH (Etsy's primary market). Rules:
- title: compelling and keyword-rich, START with the strongest keyword, between 130 and 140 characters. Use " | " to separate keyword phrases. Mirror the competitor's keyword PLACEMENT/structure, but write original wording.
- tags: EXACTLY 13 tags. Mix long-tail and short-tail phrases that match the same search intent. Each tag at most 20 characters, no '#', no commas inside a tag. Rephrase the competitor's intent — do not reproduce their exact tags.
- description: SEO-focused, a few short paragraphs describing the artwork and its appeal for this niche (style, rooms, occasions). Original wording, not copied from the competitor.`;

/** Tam olarak n eleman olacak şekilde diziyi kırpar/doldurur. */
function exactly(arr: string[], n: number, fill: string): string[] {
  const cleaned = arr.map((s) => s.trim()).filter(Boolean);
  while (cleaned.length < n) cleaned.push(fill);
  return cleaned.slice(0, n);
}

/** Rakip referans verisinden özgün SEO (title + 13 tag + description) üretir. */
export async function analyzeCompetitorSeo(source: CompetitorSource): Promise<GeneratedSeo> {
  const ref = [
    `title: ${source.title}`,
    `tags: ${source.tags.join(', ') || '(none)'}`,
    source.style?.length ? `style: ${source.style.join(', ')}` : null,
    source.materials?.length ? `materials: ${source.materials.join(', ')}` : null,
    source.numFavorers != null ? `favorites: ${source.numFavorers}` : null,
    source.views != null ? `views: ${source.views}` : null,
    `description: ${(source.description || '').slice(0, 1500)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const message = await anthropic().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(AnalysisSchema) },
    messages: [
      {
        role: 'user',
        content: `COMPETITOR REFERENCE LISTING (do not copy — target the same niche with original content):\n${ref}\n\nGenerate our original Etsy SEO (title, 13 tags, description).`,
      },
    ],
  });

  const parsed = message.parsed_output;
  if (!parsed) throw new Error('Claude rakip SEO analizini yapılandırılmış çıktı olarak döndürmedi.');

  return {
    title: parsed.title.slice(0, 140),
    tags: exactly(parsed.tags, 13, 'wall art').map((t) => t.slice(0, 20)),
    description: parsed.description.trim(),
  };
}
