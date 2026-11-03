/**
 * Referanstan tema promptu üretici — Claude Vision referans görseli tek başına kullanılabilir bir
 * text-to-image promptu olarak tarif eder, sonra o prompttan UZAKLAŞMADAN 2 farklı temalı prompt yazar.
 *
 * NEDEN BU AKIŞ: eski üretici, görseli zaten gören bir düzenleme modeli (FLUX Kontext) için kısa
 * "edit komutları" yazıyordu; sonuçlar istenen yere varmıyordu. Kullanıcının Claude sohbetinde
 * iyi sonuç veren akışı kodlandı: (1) ayrıntılı sahne tarifi, (2) aynı sahne + yeni tema × 2
 * (ışık/günün saati, palet, eşlik eden öğe, atmosfer değişir; özne, duruş, kompozisyon, teknik korunur).
 *
 * Çıktı promptları İngilizce; tema etiketleri Türkçe (panelde gösterilir).
 */

import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { anthropic } from './client';
import type { ProductType } from '@/types';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// Sohbette alınan kaliteyi yakalamak için en güncel Opus; reddederse sunucu tarafı yedek model tamamlar.
const PROMPT_MODEL = 'claude-opus-5-5';
const FALLBACK_MODEL = 'claude-opus-4-8';

const Variant = z.object({
  theme: z.string(), // kısa Türkçe etiket, ör. "Alacakaranlık · kar baykuşu"
  prompt: z.string(), // İngilizce, tek paragraf
});

const Schema = z.object({
  referencePrompt: z.string(),
  variant1: Variant,
  variant2: Variant,
});

export interface ThemePrompts {
  referencePrompt: string;
  variants: { theme: string; prompt: string }[];
}

// Kullanıcının sohbette iyi sonuç aldığı varyant çifti — KONU için değil, yapı/uzunluk/değişim derecesi için örnek.
const EXAMPLE_PAIR = `Example A: A vintage painterly illustration of Santa Claus seen from behind, sitting on a weathered wooden rail fence in a snowy open field at twilight. He wears a rich red velvet coat and matching hat, both trimmed with thick cream-white fur, and a dark leather belt around his waist. On the left, a small snowy owl is perched on top of a snow-capped wooden fence post, and a small vintage brass lantern hangs from the post, casting a soft warm glow on the snow. The field is covered in a thin layer of snow with tufts of dry, frosted grass in the foreground. In the background, bare leafless trees and a distant fence line fade into a cool blue haze. The sky glows in soft blue and violet twilight tones, with the first faint stars appearing. Gentle snowflakes fall throughout the scene. Muted cool blue and silver color palette with Santa's red coat as the warm focal point, soft textured brushwork, quiet and nostalgic mood. Classic vintage winter painting aesthetic, hand-painted oil style, vertical 3:4 format. No text, no signatures, no watermarks.

Example B: A vintage painterly illustration of Santa Claus seen from behind, sitting on a weathered wooden rail fence in a snowy open field at sunset. He wears a rich red velvet coat and matching hat, both trimmed with thick cream-white fur, and a dark brown leather belt around his waist. On the left, a small robin with an orange-red breast is perched on top of a snow-capped wooden fence post, as if keeping Santa company. The field is covered in a thin layer of snow with tufts of dry wheat-colored grass in the foreground. In the background, bare leafless trees and a distant fence line are softly silhouetted against the glow. Warm golden sun rays break through the clouds from the upper left, bathing the snow in amber and honey tones. Gentle snowflakes fall throughout the scene. Muted warm gold and red color palette, soft textured brushwork, quiet and nostalgic mood. Classic vintage Christmas painting aesthetic, hand-painted oil style, vertical 3:4 format. No text, no signatures, no watermarks.`;

function systemPrompt(formatLine: string): string {
  return `You write image-generation prompts for a shop that sells printable and screen wall art. You are shown a reference artwork. Produce three prompts.

1) referencePrompt — describe the reference as a complete, standalone text-to-image prompt (someone who never saw the reference must be able to recreate it). One paragraph, 120-200 words, in this order:
   - the art form and medium up front (e.g. "A vintage painterly illustration of …")
   - the main subject, its pose and viewing angle
   - the setting
   - secondary elements with their position (left/right, foreground/background)
   - foreground and background details
   - lighting and time of day
   - the color palette and where the focal color sits
   - brushwork / texture and mood
   - the style line, then exactly: "${formatLine}. No text, no signatures, no watermarks."
   Describe what you see concretely. Never say "the image", "the reference" or "this artwork". Never name artists, brands, logos, signatures or copyrighted characters (public-domain figures such as Santa Claus are fine); replace any of them with generic equivalents.

2) variant1 and variant2 — two NEW THEMES that stay close to referencePrompt:
   - KEEP: the subject, its pose and viewing angle, the composition and layout, the medium and brushwork, the paragraph structure and length, and the closing format line.
   - CHANGE: time of day and lighting, the color palette, the companion/accent element (e.g. a different small animal or prop), weather and atmosphere, and the matching seasonal details.
   - The two variants must clearly differ from the reference AND from each other (e.g. one cool twilight, one warm golden sunset).
   - Each variant's "theme" is a short Turkish label of what changed (e.g. "Alacakaranlık · kar baykuşu · fener"); its "prompt" is English.

The two examples below are a good variant pair of one shared reference. Learn the STRUCTURE, length and degree of change from them — not their subject:

${EXAMPLE_PAIR}`;
}

/**
 * Referans görsel (base64) → referans promptu + 2 temalı varyant.
 * @param note Kullanıcının tema isteği (Türkçe olabilir) — varyantlara yansıtılır.
 */
export async function generateThemePrompts(
  imageBase64: string,
  mediaType: ImageMediaType,
  opts: { note?: string; productType?: ProductType } = {},
): Promise<ThemePrompts> {
  const formatLine = opts.productType === 'tv' ? 'horizontal 16:9 format' : 'vertical 3:4 format';
  const note = opts.note?.trim();
  const noteBlock = note
    ? `\n\nTheme request from the user (may be Turkish; reflect its intent in BOTH variants, keep prompts in English): "${note}"`
    : '';

  const message = await anthropic().beta.messages.parse({
    model: PROMPT_MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-06-01'],
    fallbacks: [{ model: FALLBACK_MODEL }],
    output_config: { effort: 'high', format: betaZodOutputFormat(Schema) },
    system: systemPrompt(formatLine),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: `Write referencePrompt, variant1 and variant2 for this artwork.${noteBlock}` },
        ],
      },
    ],
  });

  if (message.stop_reason === 'refusal') {
    throw new Error('Claude bu görsel için prompt yazmayı reddetti — farklı bir referans görsel deneyin.');
  }
  const out = message.parsed_output;
  if (!out) throw new Error('Claude yapılandırılmış prompt çıktısı döndürmedi.');
  return {
    referencePrompt: out.referencePrompt.trim(),
    variants: [out.variant1, out.variant2].map((v) => ({ theme: v.theme.trim(), prompt: v.prompt.trim() })),
  };
}
