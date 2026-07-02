/**
 * Etsy SEO üretimi — Claude vision + yapılandırılmış çıktı (structured output).
 * Üretilen görsel + prompt verilir; SeoData (İngilizce) döner.
 *
 * Açıklama stratejisi (CLAUDE.md §10): Claude ürün-özel HOOK + PERFECT FOR üretir; tam açıklama
 * `buildDescription` ile sabit şablona oturtulur. Başlık hook stratejisinde (ana anahtar kelimeyle başlar).
 * Öznitelikler (Orientation/Style/Occasion/Room/Subject) Claude tarafından seçilir; yayında Etsy
 * taksonomi izinli değerlerine eşlenir (orientation ayrıca görsel oranından doğrulanır).
 */

import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic, CLAUDE_MODEL } from './client';
import { buildDescription } from '@/lib/listing/description';
import type { SeoData } from '@/types';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const SeoSchema = z.object({
  title: z.string(),
  hook: z.string(),
  perfectFor: z.array(z.string()),
  tags: z.array(z.string()),
  materials: z.array(z.string()),
  attributes: z.object({
    orientation: z.string(),
    style: z.string(),
    occasion: z.string(),
    room: z.string(),
    subject: z.string(),
  }),
});

const SYSTEM = `You are an Etsy SEO expert for a digital wall-art / printable shop (instant-download prints). Generate listing content in ENGLISH (Etsy's primary market). Rules:
- title: compelling and keyword-rich, START with the main keyword, up to ~140 characters. Use " | " to separate keyword phrases (e.g. "Boho Abstract Arch Print | Terracotta Wall Art | Minimalist Digital Download").
- hook: 2-3 sentences, product-specific, START with the main keyword. Include: what it is + style + which room/wall it fits + who/what occasion it suits. End by noting it is an instant digital download you can print and hang the same day. (This becomes the opening of the description.)
- perfectFor: 3-5 short style/room/occasion keywords (e.g. "Coastal & Nautical Decor", "Beach House Wall Art", "Housewarming Gift").
- tags: EXACTLY 13 tags, each a short phrase, each at most 20 characters. No '#', no commas inside a tag.
- materials: EXACTLY 13 short material/keyword terms (e.g. "Digital download", "Printable art", "JPG file").`;

/** İzin verilen Etsy değerleri verildiğinde tam-eşleşme talimatı; yoksa serbest seçim. */
function attributesInstruction(allowed?: Record<string, string[]>): string {
  const list = (a?: string[]) => (a && a.length ? a.join(' | ') : '(none)');
  if (allowed && (allowed.room?.length || allowed.style?.length)) {
    return `For attributes, choose values EXACTLY as written from these Etsy-allowed lists (copy exact spelling; do NOT invent values):
- orientation: choose ONE of: ${list(allowed.orientation)}
- style: choose ONE of: ${list(allowed.style)}
- occasion: choose 1-2 (comma-separated) of: ${list(allowed.occasion)}
- room: choose 2-4 (comma-separated, all rooms where this art fits) of: ${list(allowed.room)}
- subject: choose 1-3 (comma-separated) of: ${list(allowed.subject)}`;
  }
  return `For attributes:
- orientation: one of "Vertical", "Horizontal", "Square".
- style: a home/decor style (e.g. "Bohemian & eclectic", "Mid-century", "Minimalist").
- occasion: 1-2 fitting occasions, comma-separated, or "Everyday".
- room: 2-4 suitable rooms, comma-separated (e.g. "Living room, Bedroom, Office").
- subject: 1-3 subjects, comma-separated (e.g. "Abstract & geometric, Botanical").`;
}

/** Tam olarak n eleman olacak şekilde diziyi kırpar/doldurur. */
function exactly(arr: string[], n: number, fill: string): string[] {
  const cleaned = arr.map((s) => s.trim()).filter(Boolean);
  while (cleaned.length < n) cleaned.push(fill);
  return cleaned.slice(0, n);
}

/** Rakip analizinden gelen referans — gate 2'de SEO'yu o nişe yönlendirir (kopya değil). */
export interface CompetitorRef {
  title: string;
  tags: string[];
}

/** Rakip referansı verilmişse user metnine eklenecek yönlendirme bloğu. */
function competitorInstruction(ref?: CompetitorRef): string {
  if (!ref || (!ref.title && !ref.tags.length)) return '';
  return `\n\nCOMPETITOR REFERENCE (a top-performing listing in this niche):\ntitle: ${ref.title}\ntags: ${ref.tags.join(', ')}\nTarget the SAME search intent and niche; mirror the title's keyword placement/structure; produce ORIGINAL phrasing — do NOT copy. Prefer keywords this reference ranks for WHERE they fit the actual artwork shown above.`;
}

/**
 * Görsel + prompt'tan Etsy SeoData üretir (açıklama şablona oturtulmuş tam metin olarak döner).
 * `competitorRef` verilirse SEO, görsele sadık kalarak o nişe/keyword'lere yönlendirilir.
 */
export async function generateSeo(
  prompt: string,
  imageBase64: string,
  mediaType: ImageMediaType,
  allowedValues?: Record<string, string[]>,
  competitorRef?: CompetitorRef,
): Promise<SeoData> {
  const message = await anthropic().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: `${SYSTEM}\n${attributesInstruction(allowedValues)}`,
    output_config: { format: zodOutputFormat(SeoSchema) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          {
            type: 'text',
            text: `This is the artwork. Original generation prompt: "${prompt}". Generate the Etsy listing fields.${competitorInstruction(competitorRef)}`,
          },
        ],
      },
    ],
  });

  const parsed = message.parsed_output;
  if (!parsed) throw new Error('Claude SEO yapılandırılmış çıktı döndürmedi.');

  const hook = parsed.hook.trim();
  const perfectFor = exactly(parsed.perfectFor, Math.min(Math.max(parsed.perfectFor.length, 3), 5) || 3, 'Wall Art');

  return {
    title: parsed.title.slice(0, 140),
    hook,
    perfectFor,
    tags: exactly(parsed.tags, 13, 'wall art').map((t) => t.slice(0, 20)),
    description: buildDescription(hook, perfectFor),
    materials: exactly(parsed.materials, 13, 'Digital download'),
    categoryId: '', // yayında Digital Prints taksonomi id ile doldurulur
    attributes: {
      orientation: parsed.attributes.orientation.trim() || 'Vertical',
      style: parsed.attributes.style.trim(),
      occasion: parsed.attributes.occasion.trim(),
      room: parsed.attributes.room.trim(),
      subject: parsed.attributes.subject.trim(),
    },
  };
}
