/**
 * Etsy açıklama şablonu (CLAUDE.md §10). Claude ürün-özel HOOK + PERFECT FOR üretir;
 * geri kalan sabit gövde (ne alacağın, indirme/baskı/şartlar) burada birleştirilir.
 * "WHAT YOU'LL RECEIVE" gerçek teslimatı yansıtır: 5 JPG, 300 DPI, PRINT_RATIOS'tan türetilir.
 */

import { PRINT_RATIOS } from '@/types';
import { getEnv } from '@/lib/env';

const DIVIDER = '──────────────────────';

/** Oran → alt boyut satırı (açıklamadaki referans listesi). */
function sizeLines(): string {
  return PRINT_RATIOS.map((r) => `- ${r.label} → ${r.subSizes.join(', ')}`).join('\n');
}

/**
 * Tam açıklama metnini kurar.
 * @param hook 2-3 cümle ürün-özel açılış (ana anahtar kelimeyle başlar).
 * @param perfectFor 3-5 stil/mekân/vesile anahtar kelimesi.
 */
export function buildDescription(hook: string, perfectFor: string[]): string {
  const shopName = getEnv().ETSY_SHOP_NAME;
  const perfect = perfectFor.map((p) => p.trim()).filter(Boolean).join(' · ');

  return `${hook.trim()}

✦ PERFECT FOR: ${perfect}

${DIVIDER}

✦ WHAT YOU'LL RECEIVE
5 high-resolution JPG files (RGB, 300 DPI) — instant download, no physical item shipped. Print in 20+ sizes:

${sizeLines()}

Each file is provided at the largest size for its ratio and scales down to any smaller size. Need a different size? Just message me.

${DIVIDER}

✦ HOW TO DOWNLOAD
After payment, download instantly from Etsy: You → Purchases & Reviews. Note: digital files can't be downloaded in the Etsy app — use a browser (Safari/Chrome) or check your email for the link.

✦ HOW TO PRINT
Print at home on quality matte or photo paper, at a local print shop, or via an online service (Shutterfly, Mpix, Snapfish). For a fine-art feel, try textured or canvas paper.

✦ PLEASE NOTE
Colors may vary slightly between screens and printers. This is a digital product — nothing will be shipped.

✦ TERMS
For personal use only. Reselling, sharing, or redistributing the files is not permitted. © ${shopName}.

Thank you for visiting! Follow the shop to see new arrivals first. 🤍`;
}
