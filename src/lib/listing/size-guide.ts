/**
 * Ölçü (size guide) görseli — `PRINT_RATIOS`'tan KODDAN üretilir, her print listing'ine aynısı eklenir.
 *
 * NEDEN koddan: eskiden `public/templates/size-guide.png` adında elle konmuş (AI üretimi) sabit bir
 * görsel vardı; dosyalarla hiç senkron değildi ("ISO Ratio" başlığı ama dosya 5:7, "21x38",
 * "A2 420x394", 2:3 sütunu 20x30'da bitiyor ama dosya 24x36). Artık açıklamadaki boyut listesi,
 * paketlenen dosyalar ve bu görsel aynı kaynaktan gelir — oran değişirse görsel de değişir.
 *
 * Metin librsvg ile çizilir → sistemde font GEREKİR. Konteynerde `fonts-dejavu-core` kurulu
 * (bkz. Dockerfile); font yoksa metinler boş/kutu çıkar.
 */

import { PRINT_RATIOS } from '@/types';
import { sharp } from '@/lib/image/sharp';

export interface SizeGuide {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

// Tuval (Etsy listing görseli için yatay, 2000px uzun kenar yeterli). Ölçek genişlikten gelir
// (5 sütun yan yana), yükseklik ona göre sıkı tutulur — boş orta alan bırakmamak için.
const W = 2000;
const H = 1200;
const MARGIN_X = 90;
const GAP = 44;
const RECT_BOTTOM = 980; // tüm sütunların ortak taban çizgisi
const FONT = "DejaVu Sans, Arial, Helvetica, sans-serif";

const BG = '#F4EFE8';
const INK = '#2B2622';
const MUTED = '#7A6E64';
const LINE = '#3A332D';
const FILL = '#FBF8F4';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** '24x36' → { w: 24, h: 36 }. subSizes sözleşmesi gereği her zaman ayrıştırılabilir. */
function parseSize(s: string): { w: number; h: number } {
  const [w, h] = s.split('x').map(Number);
  if (!(w > 0 && h > 0)) throw new Error(`[size-guide] ayrıştırılamayan boyut: ${s}`);
  return { w, h };
}

function text(x: number, y: number, size: number, body: string, opts: { weight?: number; fill?: string; anchor?: string } = {}): string {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? INK}" text-anchor="${opts.anchor ?? 'start'}">${esc(body)}</text>`;
}

/** SVG'yi üretir (test/önizleme için ayrıca dışa açık). */
export function buildSizeGuideSvg(): string {
  const cols = PRINT_RATIOS.length;
  const colW = (W - 2 * MARGIN_X - GAP * (cols - 1)) / cols;
  const maxW = Math.max(...PRINT_RATIOS.map((r) => r.width / 300));
  const scale = colW / maxW; // px / inç — TÜM sütunlarda aynı, boyutlar birbirine göre gerçek

  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`);
  parts.push(text(W / 2, 120, 64, 'PRINT SIZE GUIDE', { weight: 700, anchor: 'middle' }));
  parts.push(
    text(W / 2, 182, 30, `${cols} high-resolution JPG files · 300 DPI · sizes in inches`, { fill: MUTED, anchor: 'middle' }),
  );

  PRINT_RATIOS.forEach((r, i) => {
    const x0 = MARGIN_X + i * (colW + GAP);
    const fileIn = { w: r.width / 300, h: r.height / 300 };
    const sizes = r.subSizes.map(parseSize).sort((a, b) => b.w * b.h - a.w * a.h);
    const topY = RECT_BOTTOM - fileIn.h * scale;

    parts.push(text(x0 + colW / 2, topY - 62, 40, `${r.label} Ratio`, { weight: 700, anchor: 'middle' }));
    parts.push(text(x0 + colW / 2, topY - 22, 22, `file: ${fileIn.w}x${fileIn.h}"`, { fill: MUTED, anchor: 'middle' }));

    // İç içe dikdörtgenler, sağ-alt köşeye hizalı; etiket her birinin sol-üstünde.
    const right = x0 + (colW + fileIn.w * scale) / 2;
    sizes.forEach((s, j) => {
      const w = s.w * scale;
      const h = s.h * scale;
      const x = right - w;
      const y = RECT_BOTTOM - h;
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${j === 0 ? FILL : 'none'}" stroke="${LINE}" stroke-width="${j === 0 ? 5 : 3}"/>`,
      );
      parts.push(text(x + 8, y + 26, 21, `${s.w}x${s.h}"`, { weight: j === 0 ? 700 : 400 }));
    });

    if ('isoNote' in r) {
      parts.push(text(x0 + colW / 2, RECT_BOTTOM + 48, 22, 'Also fits', { fill: MUTED, anchor: 'middle' }));
      parts.push(text(x0 + colW / 2, RECT_BOTTOM + 78, 22, r.isoNote, { fill: MUTED, anchor: 'middle' }));
    }
  });

  parts.push(
    text(W / 2, H - 92, 28, 'Each file is provided at the largest size of its ratio', { anchor: 'middle' }),
  );
  parts.push(text(W / 2, H - 50, 28, 'and scales down to every smaller size shown.', { anchor: 'middle' }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

// Süreç ömrü boyunca tek sefer üretilir (PRINT_RATIOS çalışırken değişmez).
let _cached: SizeGuide | undefined;

export async function getSizeGuide(): Promise<SizeGuide | null> {
  if (_cached) return _cached;
  const buffer = await sharp(Buffer.from(buildSizeGuideSvg()))
    .flatten({ background: BG })
    .jpeg({ quality: 90, mozjpeg: false, progressive: false, optimiseCoding: false })
    .toBuffer();
  _cached = { buffer, contentType: 'image/jpeg', ext: 'jpg' };
  return _cached;
}
