/**
 * Rakip analizi algoritması (CLAUDE.md §9).
 * Sonuçlar TAHMİNİdir, kesin satış değildir — bir sıralama/önceliklendirme aracıdır.
 *
 * Akış:
 *  1. getShop → transaction_sold_count, review_count, create_date
 *  2. review_ratio = toplam_yorum / toplam_satış (mağazaya özgü kalibrasyon)
 *  3. findActiveListingsByShop → tüm ürünler + original_creation
 *  4. her ürün için getListingReviewCount
 *  5. estimated_sales = yorum_sayısı / review_ratio
 *  6. monthly_velocity = estimated_sales / yayında_olduğu_ay_sayısı
 *  7. opportunity_score = ağırlıklı(monthly_velocity, num_favorers, rekabet_düşüklüğü)
 *  8. competitor_shops / competitor_listings'e yaz
 */

import {
  findActiveListingsByShop,
  findShopByName,
  getListingReviewCount,
  getShop,
  type EtsyListing,
} from '@/lib/etsy/listings';
import { upsertCompetitorListing, upsertCompetitorShop } from '@/lib/db/queries';
import type { CompetitorListing, CompetitorShop } from '@/types';

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

function priceToNumber(price: EtsyListing['price']): number {
  if (typeof price === 'number') return price;
  if (price && typeof price === 'object' && 'amount' in price) {
    return price.amount / (price.divisor || 100);
  }
  return 0;
}

function monthsSince(epochSeconds: number): number {
  const months = (Date.now() - epochSeconds * 1000) / MS_PER_MONTH;
  return Math.max(months, 1); // en az 1 ay (yeni ürünlerde 0'a bölmeyi önler)
}

export interface ScanResult {
  shop: CompetitorShop;
  listings: CompetitorListing[];
}

/**
 * Bir mağazayı (id veya ada göre) tarar, skorları hesaplar ve DB'ye yazar.
 */
export async function scanCompetitor(input: {
  shopId?: number;
  shopName?: string;
  maxListings?: number;
}): Promise<ScanResult> {
  const etsyShop = input.shopId
    ? await getShop(input.shopId)
    : input.shopName
      ? await findShopByName(input.shopName)
      : (() => {
          throw new Error('shopId veya shopName gerekli.');
        })();

  const totalSales = etsyShop.transaction_sold_count ?? 0;
  const totalReviews = etsyShop.review_count ?? 0;
  // Mağazaya özgü kalibrasyon: yorum bırakma oranı. Satış yoksa makul varsayılan (0.1).
  const reviewRatio = totalSales > 0 ? totalReviews / totalSales : 0.1;
  const effectiveRatio = reviewRatio > 0 ? reviewRatio : 0.1;

  const shop: CompetitorShop = {
    shopId: etsyShop.shop_id,
    shopName: etsyShop.shop_name,
    totalSales,
    totalReviews,
    reviewRatio: effectiveRatio,
    lastScannedAt: new Date().toISOString(),
  };
  await upsertCompetitorShop(shop);

  const etsyListings = await findActiveListingsByShop(etsyShop.shop_id, input.maxListings ?? 100);

  const listings: CompetitorListing[] = [];
  let maxVelocity = 0;
  const partials: Array<Omit<CompetitorListing, 'opportunityScore'>> = [];

  for (const l of etsyListings) {
    const reviewCount = await getListingReviewCount(l.listing_id);
    const estimatedSales = reviewCount / effectiveRatio;
    const months = monthsSince(l.original_creation_timestamp);
    const monthlyVelocity = estimatedSales / months;
    if (monthlyVelocity > maxVelocity) maxVelocity = monthlyVelocity;

    partials.push({
      listingId: l.listing_id,
      shopId: etsyShop.shop_id,
      title: l.title,
      tags: l.tags ?? [],
      price: priceToNumber(l.price),
      numFavorers: l.num_favorers ?? 0,
      reviewCount,
      creationDate: new Date(l.original_creation_timestamp * 1000).toISOString(),
      estimatedSales,
      monthlyVelocity,
    });
  }

  const maxFavorers = Math.max(1, ...partials.map((p) => p.numFavorers));

  for (const p of partials) {
    // Normalize edilmiş ağırlıklı skor (0-100). monthly_velocity baskın faktör.
    const velocityScore = maxVelocity > 0 ? p.monthlyVelocity / maxVelocity : 0;
    const favScore = p.numFavorers / maxFavorers;
    const opportunityScore = Math.round((velocityScore * 0.7 + favScore * 0.3) * 100 * 10) / 10;

    const listing: CompetitorListing = { ...p, opportunityScore };
    await upsertCompetitorListing(listing);
    listings.push(listing);
  }

  listings.sort((a, b) => b.opportunityScore - a.opportunityScore);
  return { shop, listings };
}
