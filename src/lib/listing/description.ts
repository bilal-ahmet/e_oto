/**
 * Etsy açıklama şablonları (CLAUDE.md §10). Claude ürün-özel HOOK + PERFECT FOR üretir;
 * geri kalan sabit gövde ürün tipine göre burada birleştirilir.
 *  - print: 5 JPG, 300 DPI, PRINT_RATIOS boyut listesi, baskı talimatları.
 *  - tv:    2 JPG (4K + Full HD), ekran kullanımı, Frame TV görüntüleme talimatları.
 */

import { PRINT_RATIOS, type ProductType } from '@/types';
import { getEnv } from '@/lib/env';

const DIVIDER = '──────────────────────';

/** Oran → alt boyut satırı (baskı açıklamasındaki referans listesi). */
function sizeLines(): string {
  return PRINT_RATIOS.map((r) => `- ${r.label} → ${r.subSizes.join(', ')}`).join('\n');
}

/**
 * Baskı (print) açıklaması.
 * @param hook 2-3 cümle ürün-özel açılış (ana anahtar kelimeyle başlar).
 * @param perfectFor 3-5 stil/mekân/vesile anahtar kelimesi.
 */
export function buildPrintDescription(hook: string, perfectFor: string[]): string {
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

/**
 * Frame TV / ekran (tv) açıklaması — kullanıcının verdiği şablon.
 * @param hook 2-3 cümle ürün-özel açılış (ne + sahne + stil/renk + dekor/sezon + "instant download").
 * @param perfectFor 3-5 stil/mekân/vesile anahtar kelimesi.
 */
export function buildTvDescription(hook: string, perfectFor: string[]): string {
  const shopName = getEnv().ETSY_SHOP_NAME;
  const perfect = perfectFor.map((p) => p.trim()).filter(Boolean).join(' · ');

  return `${hook.trim()}

✦ PERFECT FOR: ${perfect}

${DIVIDER}

✦ WHAT YOU'LL RECEIVE
2 high-resolution JPG files, ready for your screen:
- 3840x2160 px (4K Ultra HD) — perfect fit for the Samsung Frame TV (16:9)
- 1920x1080 px (Full HD) — for standard smart TVs and digital frames

Also works on Roku TVs, smart displays, and digital photo frames. Need a different resolution for your screen? Just message me — I'm happy to provide a custom size for free.

⚠️ SCREEN USE ONLY: This file is optimized for digital display and is not suitable for printing. Looking for printable wall art? Visit the shop for print versions.

${DIVIDER}

✦ HOW TO DOWNLOAD
After payment, download instantly from Etsy: You → Purchases & Reviews. Note: digital files can't be downloaded in the Etsy app — use a browser (Safari/Chrome) on your phone or computer, or check your email for the download link. Guest checkout? The link is in your Etsy receipt email (check spam/promotions too).

✦ HOW TO DISPLAY ON YOUR FRAME TV
1. Install the free Samsung SmartThings app on your phone.
2. Connect your Frame TV and phone to the same Wi-Fi network.
3. Select your Frame TV in the app and open Art Mode.
4. Upload the downloaded image from your phone's gallery.
5. Select the image, tap "Set," and choose your preferred mat (or No Mat for full-screen).

Official Samsung guide: samsung.com/us/support/answer/ANS00076727

✦ PLEASE NOTE
Colors may vary slightly between screens. This is a digital product — nothing will be shipped. Due to the nature of digital downloads, all sales are final.

✦ HOW THIS WAS MADE
This design was created using AI image-generation tools based on my own original prompts and creative direction, then curated and refined for digital display.

✦ TERMS
For personal use only. Reselling, redistributing, sharing, or using AI to copy or regenerate this artwork is not permitted. © ${shopName}.

Thank you for visiting! Follow the shop to see new seasonal arrivals first. 🤍`;
}

/** Ürün tipine göre açıklama şablonu seçer. */
export function buildDescriptionFor(
  productType: ProductType | undefined,
  hook: string,
  perfectFor: string[],
): string {
  return productType === 'tv'
    ? buildTvDescription(hook, perfectFor)
    : buildPrintDescription(hook, perfectFor);
}
