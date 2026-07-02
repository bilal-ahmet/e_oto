/**
 * Etsy listing oluşturma/yayınlama ve rakip tarama uçları (CLAUDE.md §8, §9).
 * Yayın sırası: createDraftListing → uploadListingImage → uploadListingFile (5×) → activateListing.
 */

import { etsyFetch, etsyPublicFetch } from './client';
import type { ListingAttributes, SeoData } from '@/types';

// En güncel "made recently" tarih aralığı; Etsy reddederse createDraftListing fallback dener.
const WHEN_MADE_PREFERRED = '2020_2026';
const WHEN_MADE_FALLBACK = '2020_2025';

// ── Kimlik ────────────────────────────────────────────────────────────────

interface MeResponse {
  user_id: number;
  shop_id: number | null;
}

let _shopId: number | undefined;

/** Yetkili kullanıcının user_id + shop_id'sini döner. */
export async function getMe(): Promise<MeResponse> {
  return etsyFetch<MeResponse>('/users/me');
}

/** Yayın için shop_id'yi döner (bir kez getMe ile alınır, cache'lenir). */
export async function getShopId(): Promise<number> {
  if (_shopId != null) return _shopId;
  const me = await getMe();
  if (me.shop_id == null) {
    throw new Error('Etsy hesabına bağlı bir mağaza (shop) bulunamadı.');
  }
  _shopId = me.shop_id;
  return _shopId;
}

// ── Taksonomi (Digital Prints) ──────────────────────────────────────────────

interface TaxonomyNode {
  id: number;
  name: string;
  children?: TaxonomyNode[];
}

let _digitalPrintsId: number | undefined;

function findNode(nodes: TaxonomyNode[], name: string): TaxonomyNode | undefined {
  for (const n of nodes) {
    if (n.name.toLowerCase() === name.toLowerCase()) return n;
    if (n.children) {
      const hit = findNode(n.children, name);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Art & Collectibles > Prints > Digital Prints taksonomi id'sini bulur (cache'li). */
export async function getDigitalPrintsTaxonomyId(): Promise<number> {
  if (_digitalPrintsId != null) return _digitalPrintsId;
  try {
    const res = await etsyFetch<{ results: TaxonomyNode[] }>('/seller-taxonomy/nodes');
    const node = findNode(res.results ?? [], 'Digital Prints');
    if (node) {
      _digitalPrintsId = node.id;
      return node.id;
    }
  } catch {
    // taksonomi çekilemezse bilinen id'ye düş.
  }
  _digitalPrintsId = 2078; // Art & Collectibles > Prints > Digital Prints (doğrulandı)
  return _digitalPrintsId;
}

export interface TaxonomyProperty {
  property_id: number;
  name: string;
  scales?: { scale_id: number; name: string }[];
  possible_values?: { value_id: number; name: string }[];
  supports_attributes?: boolean;
  max_values_allowed?: number | null;
}

const _propsCache = new Map<number, TaxonomyProperty[]>();

/** Bir taksonomi düğümünün öznitelik property'lerini (izinli değerlerle) döner (cache'li). */
export async function getPropertiesByTaxonomyId(taxonomyId: number): Promise<TaxonomyProperty[]> {
  const cached = _propsCache.get(taxonomyId);
  if (cached) return cached;
  const res = await etsyFetch<{ results: TaxonomyProperty[] }>(
    `/seller-taxonomy/nodes/${taxonomyId}/properties`,
  );
  const props = res.results ?? [];
  _propsCache.set(taxonomyId, props);
  return props;
}

/** Hedef öznitelik → property adı anahtar kelimesi (Etsy: Home style, Art subject vb.). */
const ATTR_KEYWORDS = {
  orientation: 'orientation',
  style: 'style',
  occasion: 'occasion',
  room: 'room',
  subject: 'subject',
} as const;
export type AttrKey = keyof typeof ATTR_KEYWORDS;

/**
 * Digital Prints için her öznitelik property'sinin İZİNLİ değer adlarını döner
 * (Claude'un bu listeden tam Etsy değeri seçmesi için). Eşleşmeyen property boş dizi.
 */
export async function getAttributeOptions(
  taxonomyId: number,
): Promise<Record<AttrKey, string[]>> {
  const props = await getPropertiesByTaxonomyId(taxonomyId);
  const out = { orientation: [], style: [], occasion: [], room: [], subject: [] } as Record<AttrKey, string[]>;
  for (const key of Object.keys(ATTR_KEYWORDS) as AttrKey[]) {
    const prop = props.find((p) => p.name.toLowerCase().includes(ATTR_KEYWORDS[key]));
    out[key] = (prop?.possible_values ?? []).map((v) => v.name);
  }
  return out;
}

// ── Yayın ─────────────────────────────────────────────────────────────────

interface ListingResponse {
  listing_id: number;
}

/**
 * Taslak (draft) dijital indirme listing'i oluşturur (Digital Prints taksonomi, en güncel when_made).
 * @param price Fiyat (ör. 5.0). USD varsayılır.
 */
export async function createDraftListing(
  shopId: number,
  seo: SeoData,
  price: number,
): Promise<number> {
  const taxonomyId = Number(seo.categoryId) || (await getDigitalPrintsTaxonomyId());
  const base = {
    quantity: 999,
    title: seo.title,
    description: seo.description,
    price,
    who_made: 'i_did',
    taxonomy_id: taxonomyId,
    type: 'download', // dijital indirme
    tags: seo.tags.join(','),
    materials: seo.materials.join(','),
    state: 'draft',
  };

  try {
    const res = await etsyFetch<ListingResponse>(`/shops/${shopId}/listings`, {
      method: 'POST',
      form: { ...base, when_made: WHEN_MADE_PREFERRED } as unknown as Record<string, string | number>,
    });
    return res.listing_id;
  } catch (err) {
    // when_made değeri geçersizse en güncel kabul edilen değere düş.
    if (err instanceof Error && /when_made/i.test(err.message)) {
      const res = await etsyFetch<ListingResponse>(`/shops/${shopId}/listings`, {
        method: 'POST',
        form: { ...base, when_made: WHEN_MADE_FALLBACK } as unknown as Record<string, string | number>,
      });
      return res.listing_id;
    }
    throw err;
  }
}

/**
 * Listing özniteliklerini (Orientation, Style, Occasion, Room, Subject) taksonomi izinli
 * değerlerine eşleyip yazar. Eşleşmeyen/desteklenmeyen property'ler sessizce atlanır.
 */
export async function setListingAttributes(
  shopId: number,
  listingId: number,
  taxonomyId: number,
  attributes: ListingAttributes,
): Promise<void> {
  const props = await getPropertiesByTaxonomyId(taxonomyId);

  // Hedef → property adı anahtar kelimesi. Değerler virgülle ayrılmış olabilir (çoklu seçim).
  const targets: { keyword: string; value: string }[] = [
    { keyword: 'orientation', value: attributes.orientation },
    { keyword: 'style', value: attributes.style },
    { keyword: 'occasion', value: attributes.occasion },
    { keyword: 'room', value: attributes.room },
    { keyword: 'subject', value: attributes.subject },
  ];

  for (const t of targets) {
    if (!t.value) continue;
    const prop = props.find((p) => p.name.toLowerCase().includes(t.keyword));
    if (!prop || !prop.possible_values?.length) continue;

    // Virgülle ayrılmış istenen değerleri izinli value'lara eşle (dedup).
    const wantedList = t.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const matched: { value_id: number; name: string }[] = [];
    for (const wanted of wantedList) {
      const m =
        prop.possible_values.find((v) => v.name.toLowerCase() === wanted) ??
        prop.possible_values.find(
          (v) => v.name.toLowerCase().includes(wanted) || wanted.includes(v.name.toLowerCase()),
        );
      if (m && !matched.some((x) => x.value_id === m.value_id)) matched.push(m);
    }
    if (matched.length === 0) continue;

    // Etsy'nin property başına izin verdiği maksimuma kadar kırp.
    const cap = prop.max_values_allowed && prop.max_values_allowed > 0 ? prop.max_values_allowed : matched.length;
    const chosen = matched.slice(0, cap);

    try {
      await etsyFetch(`/shops/${shopId}/listings/${listingId}/properties/${prop.property_id}`, {
        method: 'PUT',
        json: { value_ids: chosen.map((v) => v.value_id), values: chosen.map((v) => v.name) },
      });
    } catch {
      // Tek bir property hatası diğerlerini engellemesin (scale_id vb. gereksinimler).
    }
  }
}

/**
 * Listing'e görüntü fotoğrafı (display image) yükler.
 * @param rank 1 = birincil/thumbnail. Etsy görselleri rank sırasına göre gösterir; thumbnail = rank 1.
 */
export async function uploadListingImage(
  shopId: number,
  listingId: number,
  image: Buffer,
  filename = 'preview.png',
  contentType = 'image/png',
  rank?: number,
): Promise<void> {
  const fd = new FormData();
  fd.append('image', new Blob([new Uint8Array(image)], { type: contentType }), filename);
  if (rank != null) fd.append('rank', String(rank));
  await etsyFetch(`/shops/${shopId}/listings/${listingId}/images`, {
    method: 'POST',
    body: fd,
  });
}

/** Listing'e dijital ürün dosyası yükler (5 boyuttan biri). */
export async function uploadListingFile(
  shopId: number,
  listingId: number,
  file: Buffer,
  name: string,
  contentType = 'image/jpeg',
): Promise<void> {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(file)], { type: contentType }), name);
  fd.append('name', name);
  await etsyFetch(`/shops/${shopId}/listings/${listingId}/files`, {
    method: 'POST',
    body: fd,
  });
}

/** Listing'e tanıtım videosu yükler (mp4). */
export async function uploadListingVideo(
  shopId: number,
  listingId: number,
  video: Buffer,
  name = 'zoom.mp4',
): Promise<void> {
  const fd = new FormData();
  fd.append('video', new Blob([new Uint8Array(video)], { type: 'video/mp4' }), name);
  fd.append('name', name);
  await etsyFetch(`/shops/${shopId}/listings/${listingId}/videos`, {
    method: 'POST',
    body: fd,
  });
}

/** Listing durumunu 'active' yapar (yayınlar). */
export async function activateListing(shopId: number, listingId: number): Promise<void> {
  await etsyFetch(`/shops/${shopId}/listings/${listingId}`, {
    method: 'PATCH',
    form: { state: 'active' },
  });
}

// ── Rakip tarama (CLAUDE.md §9) ─────────────────────────────────────────────

export interface EtsyShop {
  shop_id: number;
  shop_name: string;
  transaction_sold_count: number;
  review_count: number;
  create_date: number; // epoch saniye
}

export interface EtsyListing {
  listing_id: number;
  title: string;
  tags: string[];
  price: { amount: number; divisor: number } | number;
  num_favorers: number;
  original_creation_timestamp: number; // epoch saniye
}

/** Mağaza adından mağaza bulur (ilk eşleşme). */
export async function findShopByName(shopName: string): Promise<EtsyShop> {
  const res = await etsyFetch<{ results: EtsyShop[] }>(
    `/shops?shop_name=${encodeURIComponent(shopName)}`,
  );
  const shop = res.results?.[0];
  if (!shop) throw new Error(`Mağaza bulunamadı: ${shopName}`);
  return shop;
}

export async function getShop(shopId: number): Promise<EtsyShop> {
  return etsyFetch<EtsyShop>(`/shops/${shopId}`);
}

/** Mağazanın tüm aktif ürünlerini (sayfalı) döner. */
export async function findActiveListingsByShop(shopId: number, max = 200): Promise<EtsyListing[]> {
  const out: EtsyListing[] = [];
  let offset = 0;
  const limit = 100;
  while (out.length < max) {
    const res = await etsyFetch<{ count: number; results: EtsyListing[] }>(
      `/shops/${shopId}/listings/active?limit=${limit}&offset=${offset}`,
    );
    out.push(...res.results);
    if (res.results.length < limit || out.length >= res.count) break;
    offset += limit;
  }
  return out.slice(0, max);
}

/** Bir ürünün yorum sayısını döner. */
export async function getListingReviewCount(listingId: number): Promise<number> {
  const res = await etsyFetch<{ count: number }>(`/listings/${listingId}/reviews?limit=1`);
  return res.count ?? 0;
}

// ── Rakip SEO analizi (CLAUDE.md §8 — public listing) ────────────────────────

/** GET /listings/{id} (public) ham yanıtının ilgilendiğimiz alanları. */
export interface EtsyPublicListing {
  listing_id: number;
  title: string;
  description: string;
  tags: string[];
  materials: string[];
  taxonomy_id: number;
  num_favorers: number;
  views: number;
  who_made?: string;
  when_made?: string;
  style?: string[];
}

/**
 * Tek bir Etsy listing'in PUBLIC verisini çeker (yalnız x-api-key; OAuth gerekmez).
 * Rakip SEO analizi için kullanılır. Silinmiş/private listing → Etsy 404 fırlatır.
 */
export async function getListingById(listingId: number): Promise<EtsyPublicListing> {
  const r = await etsyPublicFetch<Partial<EtsyPublicListing>>(`/listings/${listingId}`);
  return {
    listing_id: r.listing_id ?? listingId,
    title: r.title ?? '',
    description: r.description ?? '',
    tags: r.tags ?? [],
    materials: r.materials ?? [],
    taxonomy_id: r.taxonomy_id ?? 0,
    num_favorers: r.num_favorers ?? 0,
    views: r.views ?? 0,
    who_made: r.who_made,
    when_made: r.when_made,
    style: r.style ?? [],
  };
}
