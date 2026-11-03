/**
 * Upscale planı — clarity-upscaler ÇIKTI megapikseli başına ücretlendirir ($0.03/MP), bu yüzden
 * büyütme oranı körlemesine ×4 değil, ihtiyaca ve bir MP tavanına göre seçilir.
 *
 * Kural:
 *  - Gereken oran = en büyük dosyanın kısa kenarı / girdinin kısa kenarı (yukarı yuvarla).
 *  - Tavan oranı = floor(√(maxOutputMp / girdiMp)) — çıktı tavanı aşmasın.
 *  - factor = min(4, gereken, tavan). factor < 2 ise AI upscale ATLANIR (sıfır maliyet):
 *    ya girdi zaten yeterince büyüktür ya da tavan ×2'ye bile izin vermez (büyük taslak).
 *    Kalan büyütmeyi paketleme sharp ile yapar (bedava, ama detay eklemez).
 *
 * Örnekler (tavan 17 MP): FLUX baskı 880×1184 → ×4 (16.7 MP, $0.50); FLUX TV 1392×784 → ×3;
 * Imagen 896×1280 → ×3; 2048×2730 ve 4000×5333 taslak → atlanır.
 * Saf modül — scripts/check-rules.ts çevrimdışı doğrular.
 */

export interface UpscaleTarget {
  width: number;
  height: number;
}

export interface UpscalePlan {
  factor: number; // 0 = atla
  outWidth: number;
  outHeight: number;
  outMp: number;
  skipReason?: string;
}

const MAX_FACTOR = 4; // clarity-upscaler üst sınırı

export function planUpscale(
  width: number,
  height: number,
  targets: UpscaleTarget[],
  maxOutputMp: number,
): UpscalePlan {
  const inShort = Math.min(width, height);
  const inMp = (width * height) / 1e6;
  const needShort = Math.max(...targets.map((t) => Math.min(t.width, t.height)));
  const needed = Math.ceil(needShort / inShort);
  const capped = Math.floor(Math.sqrt(maxOutputMp / inMp));
  const factor = Math.min(MAX_FACTOR, needed, capped);

  if (needed <= 1) {
    return { factor: 0, outWidth: width, outHeight: height, outMp: inMp, skipReason: `girdi (${width}×${height}) zaten hedef boyutta` };
  }
  if (factor < 2) {
    return {
      factor: 0,
      outWidth: width,
      outHeight: height,
      outMp: inMp,
      skipReason: `girdi ${width}×${height} (${inMp.toFixed(1)} MP); ×2 bile ${maxOutputMp} MP tavanını aşar`,
    };
  }
  const outWidth = width * factor;
  const outHeight = height * factor;
  return { factor, outWidth, outHeight, outMp: (outWidth * outHeight) / 1e6 };
}
