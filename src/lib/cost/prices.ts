/**
 * Ücretli çağrıların LİSTE fiyatları — panelde gösterilen maliyet bunlardan hesaplanan TAHMİNDİR.
 * Gerçek tutar fal faturalama API'sindedir (`scripts/fal-usage.ts`); ikisi karşılaştırılarak
 * sapma görülür. Fiyat değişirse yalnız burası güncellenir. Saf modül (panel de kullanır).
 *
 * Kaynaklar (2026-11-03):
 *  - https://fal.ai/models/fal-ai/clarity-upscaler/llms.txt — "$0.03 per megapixels"
 *  - https://fal.ai/models/fal-ai/flux-pro/kontext/llms.txt — "$0.04 per images"
 */

import type { UsageEntry } from '@/types';

export const FAL_PRICES = {
  /** clarity-upscaler — ÇIKTI megapikseli başına. */
  upscalePerMp: 0.03,
  /** flux-pro/kontext (text-to-image, image-to-image, mockup) — görsel başına. */
  kontextPerImage: 0.04,
} as const;

/** Upscale çıktı MP tavanının varsayılanı (env `UPSCALE_MAX_OUTPUT_MP`). */
export const DEFAULT_UPSCALE_MAX_MP = 17;

/** Mockup partisi sahne sayısı (print ve tv'de 8 — lib/mockup/scenes.ts). */
const MOCKUP_SCENE_COUNT = 8;

/** Gate 2 onayının fal maliyet ÜST SINIRI: tavanlı upscale + mockup partisi (liste fiyatı). */
export function approveCostCeiling(maxMp = DEFAULT_UPSCALE_MAX_MP): { upscale: number; mockups: number; total: number } {
  const upscale = maxMp * FAL_PRICES.upscalePerMp;
  const mockups = MOCKUP_SCENE_COUNT * FAL_PRICES.kontextPerImage;
  return { upscale, mockups, total: upscale + mockups };
}

/** Bir kullanım satırının liste fiyatından tahmini tutarı. */
export function estimateUsd(e: Pick<UsageEntry, 'units' | 'unitPriceUsd'>): number {
  return e.units * e.unitPriceUsd;
}

export function sumUsd(entries: UsageEntry[] | undefined): number {
  return (entries ?? []).reduce((s, e) => s + estimateUsd(e), 0);
}

/** "$0.82" — panel gösterimi. */
export function formatUsd(v: number): string {
  return `$${v.toFixed(2)}`;
}
