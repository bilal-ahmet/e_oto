/**
 * Etsy listing metin kuralları — Etsy API'nin 400 ile reddettiği durumlar tek yerde.
 * Import'suz/saf: hem sunucu (SEO üretimi, yayın) hem panel (SeoEditor uyarısı) kullanır.
 *
 * - title `all_caps`: ilk iki harfi büyük olan kelime (TV, HD, JPG) en fazla 3 olabilir.
 *   Title Case serbesttir; "4K" rakamla başladığı için sayılmaz.
 * - materials `invalid_characters`: yalnızca harf, rakam, boşluk.
 * - tags: harf, rakam, boşluk ve - ' ™ © ®.
 * - title (Etsy OAS, createDraftListing): yalnız harf, rakam, noktalama, matematik sembolü,
 *   boşluk, ™ © ®; `% : & +` her biri EN FAZLA BİR KEZ. En fazla 140 karakter.
 * - materials: teslim edilen DİJİTAL ürünü tanımlar — fiziksel malzeme (canvas, paper, ink,
 *   frame…) teslim edilmeyen bir şeyi vaat eder, yasaktır (`PHYSICAL_MATERIAL`).
 *
 * `toEtsySafe` deterministik düzeltmeleri SESSİZCE yapar (caps, karakter, fazla sembol);
 * düzeltilemeyenleri (uzunluk, adet, fiziksel materyal, AI beyanı) `validateListingSeo`
 * kullanıcıya alan + sebep olarak döner — kırpılmaz, üstüne yazılmaz.
 */

import type { SeoData } from '@/types';

export const MAX_CAPS_WORDS = 3;

const WORD = /[\p{L}\p{N}]+/gu;
const CAPS_START = /^\p{Lu}{2}/u;
const MATERIAL_INVALID = /[^\p{L}\p{Nd}\p{Zs}]/gu;
const TAG_INVALID = /[^\p{L}\p{Nd}\p{Zs}\-'™©®]/gu;
const TITLE_INVALID = /[^\p{L}\p{Nd}\p{P}\p{Sm}\p{Zs}™©®]/gu;
/** Başlıkta en fazla bir kez kullanılabilen karakterler ve fazlasının yerine yazılan. */
const TITLE_ONCE: Record<string, string> = { '%': ' percent', ':': ' -', '&': 'and', '+': 'and' };

export const MAX_TITLE_LEN = 140;
export const MAX_TAGS = 13;
export const MAX_TAG_LEN = 20;
export const MAX_MATERIALS = 13;

/**
 * Teslim edilmeyen fiziksel ürünü ima eden materyal terimleri. Dükkân yalnız dijital JPG teslim
 * eder; PDF de teslim edilmez. "Frame TV" bir ekran adıdır, çerçeve vaadi değil — hariç tutulur.
 */
const PHYSICAL_MATERIAL =
  /\b(canvas|paper|cardstock|card stock|ink|inks|toner|frame|frames|framed|wood|wooden|metal|aluminum|aluminium|acrylic|glass|vinyl|fabric|linen|cotton|poster board|pdf)\b/i;

export function isPhysicalMaterial(s: string): boolean {
  return PHYSICAL_MATERIAL.test(s.replace(/\bframe tv\b/gi, ''));
}

/** Açıklama şablonlarındaki AI üretim beyanı (description.ts) — panel de eksikse tek tıkla ekler. */
export const AI_DISCLOSURE_TEXT =
  'This artwork was created using AI tools, based on my own original prompts and creative direction, then curated and refined by me.';

/** Açıklamada AI üretim beyanı var mı (Etsy: AI ile üretilen ürün açıklamada belirtilmeli). */
const AI_DISCLOSURE = /\b(created|made|generated|produced)\b[^.\n]{0,40}\bAI\b|\bAI[- ](generated|image-generation|tools?)\b/i;

export function hasAiDisclosure(description: string): boolean {
  return AI_DISCLOSURE.test(description);
}

/** `% : & +` ikinci ve sonraki kullanımları güvenli karşılığına çevrilir; geçersiz karakter atılır. */
export function fixTitleSymbols(title: string): string {
  const seen = new Set<string>();
  const once = title.replace(/[%:&+]/g, (ch) => {
    if (!seen.has(ch)) {
      seen.add(ch);
      return ch;
    }
    return TITLE_ONCE[ch];
  });
  return once.replace(TITLE_INVALID, ' ');
}

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
    title: collapse(fixTitleCaps(fixTitleSymbols(collapse(seo.title)))),
    tags: cleanList(seo.tags, sanitizeTag),
    materials: cleanList(seo.materials, sanitizeMaterial),
  };
}

export type SeoField = 'title' | 'tags' | 'materials' | 'description';

export interface SeoIssue {
  field: SeoField;
  message: string; // Türkçe, panelde alanın yanında gösterilir
}

/**
 * Etsy'ye gönderilmeden ÖNCE düzeltilemeyen kural ihlallerini döner (boş dizi = gönderilebilir).
 * `toEtsySafe` uygulanmış veri üzerinde çağrılır: otomatik düzelenler burada sorun sayılmaz.
 * Gate 2 (approve-seo), panel (SeoEditor) ve yayın (publishToEtsy) aynı fonksiyonu kullanır.
 */
export function validateListingSeo(seo: SeoData): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const title = seo.title.trim();
  if (!title) issues.push({ field: 'title', message: 'Başlık boş.' });
  if (title.length > MAX_TITLE_LEN) {
    issues.push({ field: 'title', message: `Başlık ${title.length} karakter — Etsy en fazla ${MAX_TITLE_LEN} kabul eder.` });
  }
  if (countCapsWords(title) > MAX_CAPS_WORDS) {
    issues.push({ field: 'title', message: `İki büyük harfle başlayan kelime en fazla ${MAX_CAPS_WORDS} olabilir (Etsy all_caps).` });
  }
  for (const ch of Object.keys(TITLE_ONCE)) {
    if (title.split(ch).length - 1 > 1) issues.push({ field: 'title', message: `"${ch}" başlıkta yalnızca bir kez kullanılabilir.` });
  }
  if (new RegExp(TITLE_INVALID.source, 'u').test(title)) {
    issues.push({ field: 'title', message: "Başlıkta Etsy'nin kabul etmediği karakter var (emoji vb.)." });
  }

  const tags = seo.tags.map((t) => t.trim()).filter(Boolean);
  if (tags.length > MAX_TAGS) issues.push({ field: 'tags', message: `${tags.length} etiket var — en fazla ${MAX_TAGS}.` });
  for (const t of tags) {
    if (t.length > MAX_TAG_LEN) issues.push({ field: 'tags', message: `"${t}" ${t.length} karakter — en fazla ${MAX_TAG_LEN}.` });
    if (new RegExp(TAG_INVALID.source, 'u').test(t)) issues.push({ field: 'tags', message: `"${t}" geçersiz karakter içeriyor.` });
  }

  const materials = seo.materials.map((m) => m.trim()).filter(Boolean);
  if (materials.length > MAX_MATERIALS) {
    issues.push({ field: 'materials', message: `${materials.length} materyal var — en fazla ${MAX_MATERIALS}.` });
  }
  for (const m of materials) {
    if (hasInvalidMaterialChars(m)) issues.push({ field: 'materials', message: `"${m}" yalnız harf/rakam/boşluk içerebilir.` });
    if (isPhysicalMaterial(m)) {
      issues.push({ field: 'materials', message: `"${m}" teslim edilmeyen fiziksel bir malzemeyi ima ediyor — dijital ürünü tanımlayan bir terim yaz.` });
    }
  }

  if (!seo.description.trim()) issues.push({ field: 'description', message: 'Açıklama boş.' });
  else if (!hasAiDisclosure(seo.description)) {
    issues.push({
      field: 'description',
      message: 'Açıklamada AI üretim beyanı yok (ör. "This artwork was created using AI tools.") — Etsy AI ile üretilen ürünlerde bunu ister.',
    });
  }
  return issues;
}
