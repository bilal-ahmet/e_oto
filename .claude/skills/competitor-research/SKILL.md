---
name: competitor-research
description: Rakip analizi modülünde çalışırken kullan — rakip Etsy listing URL'inden özgün SEO üretme (ön-adım) ve rakip mağaza tarayıp tahmini satış / fırsat skoru hesaplama. src/lib/scoring/competitor-algorithm.ts, src/lib/claude/competitor-seo.ts, api/competitor*/* veya /admin/competitors ile çalışırken yükle.
---

# Rakip analizi

İki ayrı iş var; karıştırma.

## A) Rakip listing SEO analizi (pipeline'ın opsiyonel ön-adımı)

`/generate` üstündeki panelden bir Etsy listing URL'i girilir →
`POST /api/competitor-research/analyze` (senkron):

1. `getListingById` (`src/lib/etsy/listings.ts`) ile veri çekilir — `etsyPublicFetch` kullanır,
   yani **OAuth gerekmez**, yalnızca x-api-key.
2. `analyzeCompetitorSeo` (`src/lib/claude/competitor-seo.ts`) rakip metninden **özgün** SEO
   üretir (başlık 130-140 karakter + tam 13 tag + açıklama).
3. Sonuç `competitor_research` tablosuna yazılır (`createCompetitorResearch`).

Run oluşturulurken `competitorResearchId` verilirse run bu analize bağlanır
(`linkCompetitorResearchToRun`). Gate 2'de `generateSeo` `competitorRef` ile beslenir ve o nişe
yönlendirilir — **görsele sadakat rakip keyword'lerinin önündedir**. Taksonomi yine default
Digital Prints; rakibin `source_taxonomy_id`'si yalnızca izleme amaçlı saklanır.

## B) Mağaza tarama ve fırsat skoru

`scanCompetitor` (`src/lib/scoring/competitor-algorithm.ts`); tetikleyici
`POST /api/competitors/scan`, zamanlanmışı `src/cron/competitor-scan.ts` (her gün 03:00, advisory
lock ile — iki instance aynı taramayı yapmasın; yalnızca `COMPETITOR_CRON_ENABLED=true` ise kayıtlı).

1. `getShop` → `transaction_sold_count`, toplam yorum, `create_date`
2. `review_ratio = toplam_yorum / toplam_satış` — **mağazaya özgü kalibrasyon**; genel bir sabit
   kullanma, mağazalar arasında çok değişiyor. Satış 0 ise / oran 0 çıkarsa **0.1**'e düşülür.
3. Mağazanın aktif listing'leri + `original_creation` (`findActiveListingsByShop`); tarama başına
   varsayılan tavan **100 listing** (`maxListings` ile değişir).
4. Listing başına yorum sayısı (`getListingReviewCount`)
5. `estimated_sales = yorum_sayısı / review_ratio`
6. `monthly_velocity = estimated_sales / yayında_olduğu_ay_sayısı` (ay en az 1 — 0'a bölme yok)
7. Skor, taramanın KENDİ içinde normalize edilir: `velocityScore = monthly_velocity / o taramadaki
   maks. velocity`, `favScore = num_favorers / maks. favorers`
8. `opportunity_score = (velocityScore × 0.7 + favScore × 0.3) × 100`, 1 ondalığa yuvarlanır.
   **Skoru oluşturan tek şey budur** — momentum/yorum hızı, rekabet yoğunluğu, fiyat gibi bir
   faktör YOK. Eklenirse bu maddeyi güncelle.
9. Sonuçlar `competitor_listings` / `competitor_shops`'a yazılır, skora göre sıralı döner

Skor **görecelidir**: aynı taramadaki en hızlı ürün 70 puanı alır, farklı taramaların skorları
birbiriyle kıyaslanamaz.

**Sonuçlar tahmindir, kesin satış rakamı değildir** — bir sıralama/önceliklendirme aracıdır.
UI'da veya açıklamada "gerçek satış" gibi sunma.

Etsy tarafı ~10 req/s throttle altında (`src/lib/etsy/client.ts`); tarama listing başına ayrı bir
yorum çağrısı yaptığı için yeni çağrıları mutlaka `etsyFetch` üzerinden yap.
