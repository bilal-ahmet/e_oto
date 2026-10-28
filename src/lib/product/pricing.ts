/**
 * Ürün tipine göre varsayılan Etsy fiyatı (USD) — mağaza kuralı: dikey Printable 6, yatay Frame TV 9.99.
 *
 * Ayrı dosyada çünkü panel (client) de okur; `config.ts` client'a import edilemez (fal/node bağımlılıkları).
 * Tek kaynak burası — `productConfig().defaultPrice` de buradan gelir.
 */

import type { ProductType } from '@/types';

export const DEFAULT_PRICE: Record<ProductType, number> = {
  print: 6,
  tv: 9.99,
};

export function defaultPrice(type?: ProductType): number {
  return DEFAULT_PRICE[type ?? 'print'] ?? DEFAULT_PRICE.print;
}
