/**
 * Pinterest pin metni üretimi (CLAUDE.md §8).
 *
 * NEDEN AYRI: Önceden pin, Etsy başlığının ilk 100 karakteri + hook ile atılıyordu. Etsy
 * başlığı " | " ile ayrılmış ~140 karakterlik anahtar kelime dizisidir; kırpılınca Pinterest'te
 * yarım cümle olarak görünür ve Pinterest'in arama davranışı Etsy'den farklıdır. Bu üretici
 * aynı ürün için Pinterest'e uygun başlık + açıklama + alt metin yazar.
 *
 * Metin-only bir çağrıdır (görsel gönderilmez): görsele dayalı SEO gate 2'de zaten üretilmiş
 * durumda ve pin, o SEO'dan türetiliyor.
 */

import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { PinCopy, SeoData } from '@/types';
import { anthropic, CLAUDE_MODEL } from './client';

// Pinterest alan sınırları — üretimden sonra ayrıca slice() ile de zorlanır.
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 500;
const ALT_TEXT_MAX = 500;

const PinCopySchema = z.object({
  title: z.string(),
  description: z.string(),
  altText: z.string(),
});

const SYSTEM = `You write Pinterest Pin copy for a digital wall-art / printable shop (instant-download prints). You are given the product's existing Etsy SEO. Write Pin copy in ENGLISH that targets Pinterest search, not Etsy search. Rules:
- title: at most ${TITLE_MAX} characters. Start with the strongest keyword. Write it as a natural, readable phrase — NOT a pipe-separated keyword list. It must stand alone as a complete thought.
- description: at most ${DESCRIPTION_MAX} characters. 2-4 natural sentences describing the artwork, the feeling it creates, and where it fits (room, style, occasion). Weave keywords in naturally. End with a soft call to action pointing to the Etsy listing (e.g. an instant digital download). No hashtag spam — at most 3 hashtags, and only if they genuinely help.
- altText: at most ${ALT_TEXT_MAX} characters. A plain, literal description of what is visually in the image, for screen readers and Pinterest visual search. No marketing language, no call to action.`;

/** Etsy SEO'sundan Pinterest'e uygun pin metni üretir. */
export async function generatePinCopy(seo: SeoData): Promise<PinCopy> {
  const ref = [
    `title: ${seo.title}`,
    `hook: ${seo.hook}`,
    seo.perfectFor?.length ? `perfect for: ${seo.perfectFor.join(', ')}` : null,
    seo.tags?.length ? `tags: ${seo.tags.join(', ')}` : null,
    `style: ${seo.attributes?.style ?? '—'}`,
    `room: ${seo.attributes?.room ?? '—'}`,
    `subject: ${seo.attributes?.subject ?? '—'}`,
    `orientation: ${seo.attributes?.orientation ?? '—'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const message = await anthropic().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(PinCopySchema) },
    messages: [
      {
        role: 'user',
        content: `PRODUCT (existing Etsy SEO):\n${ref}\n\nWrite the Pinterest Pin title, description and alt text.`,
      },
    ],
  });

  const parsed = message.parsed_output;
  if (!parsed) throw new Error('Claude pin metnini yapılandırılmış çıktı olarak döndürmedi.');

  return {
    title: parsed.title.trim().slice(0, TITLE_MAX),
    description: parsed.description.trim().slice(0, DESCRIPTION_MAX),
    altText: parsed.altText.trim().slice(0, ALT_TEXT_MAX),
  };
}

/**
 * Claude çağrısı başarısız olursa kullanılan yedek: eski davranış (Etsy başlığı + hook).
 * Pin, yalnızca metin üretimi patladı diye kaybedilmemeli.
 */
export function fallbackPinCopy(seo: SeoData | undefined): PinCopy {
  return {
    title: (seo?.title ?? 'Printable Wall Art').slice(0, TITLE_MAX),
    description: (seo?.hook ?? '').slice(0, DESCRIPTION_MAX),
    altText: (seo?.hook ?? seo?.title ?? '').slice(0, ALT_TEXT_MAX),
  };
}
