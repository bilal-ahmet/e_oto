---
name: etsy-publishing
description: Etsy Open API v3 ile çalışırken kullan — listing oluşturma/yayınlama, OAuth2+PKCE, token tazeleme, Digital Prints taksonomisi, öznitelik (property) yazma, görsel/dosya/video yükleme, rate limit. src/lib/etsy/* veya api/auth/etsy/* dosyalarına dokunulduğunda yükle.
---

# Etsy yayını

Kod: `src/lib/etsy/{client,oauth,listings}.ts` · Orkestrasyon: `publishToEtsy` (`pipeline/run.ts`)
· Komşular: `image-pipeline` (medya) · `seo-content` (metin) · `pinterest-publishing` (pin).

## OAuth ve token

- OAuth2 + **PKCE** (Pinterest'ten farkı budur): `buildAuthUrl` → `exchangeCode` (`oauth.ts`);
  token `oauth_tokens`'a AES-256-GCM ile şifreli yazılır.
- Scope'lar `ETSY_SCOPES` (`oauth.ts`): `listings_r`, `listings_w`, `listings_d`, `shops_r`.
  **Scope değişikliği yeniden yetkilendirme gerektirir** — eski token yeni scope'u taşımaz.
- Kimlikli çağrılar `getValidEtsyToken()` (`client.ts`) üzerinden geçer; bitmesine 60 sn'den az
  kalmışsa yeniler. `etsyPublicFetch` bu yoldan GEÇMEZ, token istemez.
- **Ömür:** access 1 saat, refresh ~90 gün ama her kullanımda yenilenir. Etsy yalnızca yayın anında
  çağrıldığı için `src/cron/token-refresh.ts` tazeler (Etsy kaydı **3 günden** eskiyse) — yoksa
  pencere dolar ve bağlantı sessizce ölür. Durum: `/admin` kartı + `/api/auth/etsy/status`
  (`?probe=1` gerçek Etsy çağrısı yapar).

- **refresh_token korunur:** Etsy yenileme yanıtında `refresh_token` döndürmeyebilir; gelen
  undefined'ı yazmak sütunu NULL yapar ve bağlantıyı sessizce öldürür (kullanıcı ancak bir sonraki
  yayında görür). `persistEtsyTokens` (`client.ts`) `refreshToken ?? previousRefreshToken` uygular.
  **Yenileme yolunda `upsertOAuthToken`'ı doğrudan çağırma** — korumayı atlarsın. İlk yetkilendirme
  callback'i istisnadır: korunacak eski token yoktur.

## x-api-key ve rate limit

- Etsy `x-api-key` header'ında **`keystring:shared_secret`** ister (2026-02-09'dan beri), yalnızca
  keystring değil. `etsyFetch` bunu `ETSY_CLIENT_ID:ETSY_CLIENT_SECRET` olarak gönderir; secret
  tanımsızsa net hata atar.
- `etsyPublicFetch` yalnızca x-api-key gönderir — Bearer gerekmez, token yokken de çalışır
  (rakip analizi bunu kullanır).
- `pThrottle({ limit: 10, interval: 1000 })` (`client.ts`) — Etsy ~10 req/s. Yeni çağrıyı
  `etsyFetch`/`etsyPublicFetch` üzerinden geçir; doğrudan `fetch` throttle'ı atlar.

## Kategori ve öznitelikler

- Kategori sabit: Art & Collectibles > Prints > **Digital Prints**. `getDigitalPrintsTaxonomyId()`
  (`listings.ts`) `/seller-taxonomy/nodes`'tan bulur (cache'li); **çağrı patlarsa sabit `2078`'e
  düşer** — "taksonomi/öznitelik yanlış" teşhisinde ilk bakılacak yer burasıdır.
- Listing sabitleri: `who_made: 'i_did'`, `type: 'download'`, `when_made` en güncel aralık
  (`2020_2026`; Etsy reddederse `2020_2025`).
- İzinli değerler `getPropertiesByTaxonomyId()` / `getAttributeOptions()` ile alınır. Claude'un
  seçtiği Orientation/Style/Occasion/Room/Subject `setListingAttributes` ile yazılır: **önce tam ad
  eşleşmesi, tutmazsa substring eşleşmesi**. Değer virgülle çoklu verilebilir ve property'nin
  `max_values_allowed` sınırına kırpılır. Eşleşmeyen atlanır — yayın düşmez.

## Yayın sırası — bu sıra bozulmaz

1. `createDraftListing` (`listings.ts`) → `state: 'draft'` listing
2. `setListingAttributes` → öznitelikler
3. `uploadListingImage` → mockup'lar: seçilen thumbnail **rank 1'e** alınır, kalanlar sırayla
   (ham sanat görseli display olarak YÜKLENMEZ). Etsy tavanı: 10 görsel.
4. `uploadListingImage` → ölçü görseli, **en son rank** — yalnızca `usesSizeGuide` olan ürün
   tipinde (print var, tv yok).
5. `uploadListingVideo` → zoom mp4 (1 video sınırı). **Best-effort**: başarısız olursa yayın devam
   eder, sebep `publish_progress.warnings`'e yazılır ve gate 3 / "Yayınlandı" ekranında gösterilir.
6. `uploadListingFile` → dijital JPG'ler (print 5, tv 2). Dosya adı **3-70 karakter**.

**Listing AKTİVE EDİLMEZ.** Son adımdan sonra run `done` olur, listing Etsy'de **taslak** kalır;
yayın kararı kullanıcınındır. `activateListing` kodda duruyor ama **hiçbir yerden çağrılmıyor** —
Pinterest pin'inin otomatik zincirlenmemesinin sebebi de budur (taslağa pin = ölü link).

`publishToEtsy` her adımdan sonra `publish_progress` checkpoint'i yazar; yarıda kalan yayın çift
listing/çift upload üretmeden kaldığı yerden sürer. Yeni adım eklerken checkpoint'ini de ekle.
