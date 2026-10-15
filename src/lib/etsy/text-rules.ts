/**
 * Etsy listing metin kuralları — Etsy API'nin 400 ile reddettiği durumlar tek yerde.
 * Import'suz/saf: hem sunucu (SEO üretimi, yayın) hem panel (SeoEditor uyarısı) kullanır.
 *
 * - title `all_caps`: ilk iki harfi büyük olan kelime (TV, HD, JPG) en fazla 3 olabilir.
 *   Title Case serbesttir; "4K" rakamla başladığı için sayılmaz.
 * - materials `invalid_characters`: yalnızca harf, rakam, boşluk.
 * - tags: harf, rakam, boşluk ve - ' ™ © ®.
 */

import type { SeoData } from '@/types';

export const MAX_CAPS_WORDS = 3;

const WORD = /[\p{L}\p{N}]+/gu;
const CAPS_START = /^\p{Lu}{2}/u;
const MATERIAL_INVALID = /[^\p{L}\p{Nd}\p{Zs}]/gu;
const TAG_INVALID = /[^\p{L}\p{Nd}\p{Zs}\-'™©®]/gu;

/** Başlıkta ilk iki harfi büyük olan kelime sayısı (Etsy `all_caps` kuralı). */
export function countCapsWords(title: string): number {
  return (title.match(WORD) ?? []).filter((w) => CAPS_START.test(w)).length;
}

/** İlk `max` çift-büyük-harfli kelime korunur; fazlası Title Case'e çevrilir (TV → Tv). */
export function fixTitleCaps(title: string, max = MAX_CAPS_WORDS): string {
  let seen = 0;
  return title.replace(WORD, (w) => {
    if (!CAPS_START.test(w)) return w;
    seen++;
    return seen <= max ? w : w[0] + w.slice(1).toLowerCase();
  });
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function hasInvalidMaterialChars(s: string): boolean {
  return new RegExp(MATERIAL_INVALID.source, 'u').test(s);
}

/** Materyal: harf/rakam/boşluk dışındaki her karakter boşluğa çevrilir ("Hi-res JPG" → "Hi res JPG"). */
export function sanitizeMaterial(s: string): string {
  return collapse(s.replace(MATERIAL_INVALID, ' '));
}

/** Tag: izinli karakter dışı boşluğa çevrilir, 20 karaktere kırpılır. */
export function sanitizeTag(s: string): string {
  return collapse(s.replace(TAG_INVALID, ' ')).slice(0, 20).trim();
}

/** Temizler, boşları atar, büyük/küçük harf duyarsız tekilleştirir (sıra korunur). */
export function cleanList(arr: string[], fn: (s: string) => string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const v = fn(raw);
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** title/tags/materials'ı Etsy'nin kabul edeceği hâle getirir; diğer alanlara dokunmaz. */
export function toEtsySafe(seo: SeoData): SeoData {
  return {
    ...seo,
    title: fixTitleCaps(collapse(seo.title)),
    tags: cleanList(seo.tags, sanitizeTag),
    materials: cleanList(seo.materials, sanitizeMaterial),
  };
}
