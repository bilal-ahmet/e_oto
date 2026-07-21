/**
 * Instruction Üretici — Claude Vision ile referans görselden İngilizce transformation instruction üretir.
 *
 * Referans görsel + (opsiyonel) kullanıcı notu verilir; görsele bakılarak FLUX.1 Kontext'e
 * (image-to-image; referans görseli girdi olarak ALIR — bkz. lib/flux/client) gönderilecek SPESİFİK
 * editing talimatı döner. Amaç: kompozisyon/atmosfer korunarak, bazı somut farklarla
 * (şekil/renk/bakış açısı) yeni bir görsel üretmek — birebir kopya değil.
 *
 * Çıktı her zaman İngilizce ve SADECE talimat metni (açıklama/başlık/markdown yok).
 */

import { anthropic } from './client';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// SEO modülü opus kullanır; instruction üretimi için vision destekli, hızlı/uygun maliyetli Sonnet.
const VISION_MODEL = 'claude-sonnet-5';

const SYSTEM = `You write a single ENGLISH image transformation instruction for FLUX.1 Kontext, an image EDITING model that receives the reference image itself as input alongside your instruction. You are given that same reference image. Produce a precise editing instruction that yields a NEW image clearly inspired by the reference, with a few deliberate differences — NOT a faithful copy. Because the model already sees the image, write direct edit commands rather than a full scene description.

PRESERVE: overall composition, layout structure, use of negative space, and the general mood/atmosphere of the reference.
CHANGE ONLY SLIGHTLY: color palette, motifs/patterns, and typographic weight.
REDESIGN A FEW SPECIFIC ELEMENTS with concrete edits, e.g. reshape an object (a house into a different house), recolor an object (a brown car into navy blue), or shift the viewpoint/camera angle (a straight-on view into a slight three-quarter angle).

RULES:
- Never instruct to copy logos, signatures, recognizable characters, or brand elements. If such elements appear in the reference, instruct to omit or replace them with generic equivalents.
- Use specific, concrete editing commands. Avoid vague language ("make it nicer", "improve the style").
- The goal is a familiar-but-new image — do not drift far from the reference.
- Output ONLY the transformation instruction text. No preamble, no headings, no markdown, no quotes around the whole thing.`;

/**
 * Referans görsel (base64) + opsiyonel nottan İngilizce transformation instruction üretir.
 */
export async function generateTransformationInstruction(
  imageBase64: string,
  mediaType: ImageMediaType,
  note?: string,
): Promise<string> {
  const trimmedNote = note?.trim();
  const noteBlock = trimmedNote
    ? `\n\nAdditional user request to incorporate into the instruction (it may be in Turkish or English; reflect its intent but keep the final instruction in English): "${trimmedNote}"`
    : '';

  const message = await anthropic().messages.create({
    model: VISION_MODEL,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          {
            type: 'text',
            text: `Analyze this reference image and write the transformation instruction.${noteBlock}`,
          },
        ],
      },
    ],
  });

  let instruction = '';
  for (const block of message.content) {
    if (block.type === 'text') {
      instruction = block.text.trim();
      break;
    }
  }
  if (!instruction) throw new Error('Claude Vision transformation instruction döndürmedi.');
  return instruction;
}
