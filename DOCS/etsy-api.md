# Etsy Open API v3 — neye erişebiliriz?

Kaynak: Etsy'nin resmî OpenAPI şeması (`https://www.etsy.com/openapi/generated/oas/3.0.0.json`),
2026-11-03'te baştan sona tarandı. Politika bilgisi Etsy Yardım Merkezi'nden.

**Bugünkü izinler** (`ETSY_SCOPES`, `src/lib/etsy/oauth.ts`): `listings_r`, `listings_w`, `listings_d`,
`shops_r`. Yeni bir izin eklemek **yeniden yetkilendirme** ister: eski token yeni izni taşımaz.

İşaretler: ✅ kullanılıyor · ◻ erişilebilir, kullanılmıyor · 🔒 ek izin gerekir

## İlanlar

| İşlem | Uç | İzin | Durum |
|---|---|---|---|
| Taslak oluştur | `POST /shops/{shop_id}/listings` | listings_w | ✅ |
| Güncelle (başlık, etiket, açıklama, fiyat, `state`, `shop_section_id`, `who_made`…) | `PATCH /shops/{shop_id}/listings/{id}` | listings_w | ◻ Bilerek kullanılmıyor: mevcut ilanlara yazılmaz |
| Sil | `DELETE /listings/{id}` | listings_d | ◻ İzin var, kullanılmıyor |
| Tekil oku (OAuth ile taslak da okunur) | `GET /listings/{id}` | api_key / listings_r | ✅ Durum geri okuma |
| Toplu oku | `GET /listings/batch` | api_key | ◻ |
| Mağaza ilanları (`state` filtresi: active/draft/inactive/expired…) | `GET /shops/{shop_id}/listings` | listings_r | ◻ |
| Aktif ilanlar (mağaza / genel arama) | `GET /shops/{id}/listings/active`, `GET /listings/active` | api_key | ✅ Rakip tarama |
| Öne çıkanlar | `GET /shops/{id}/listings/featured` | api_key | ◻ |
| Bölümdeki ilanlar | `GET /shops/{id}/shop-sections/listings` | api_key | ◻ |

İlan nesnesinde okunabilen metrikler: `views`, `num_favorers`, oluşturma/güncelleme zamanları.
Başka istatistik yok.

## Medya ve dijital dosya

| İşlem | Uç | İzin | Durum |
|---|---|---|---|
| Görsel yükle / sil / listele | `…/listings/{id}/images` | listings_w | ✅ Yükleme |
| Video yükle / sil / listele | `…/listings/{id}/videos` | listings_w | ✅ Yükleme |
| Dijital dosya yükle / sil / listele / oku | `…/listings/{id}/files` | listings_w / listings_r | ✅ Yükleme |
| Varyasyon görselleri | `…/variation-images` | listings_w | ◻ |

## Envanter, öznitelik, çeviri, kişiselleştirme

| İşlem | Uç | İzin | Durum |
|---|---|---|---|
| Öznitelik yaz / sil / oku | `…/properties/{property_id}` | listings_w | ✅ Yazma |
| Envanter (fiyat, stok, SKU, varyasyon) | `GET/PUT /listings/{id}/inventory` | listings_r / listings_w | ◻ |
| Çeviri oluştur / güncelle / oku | `…/translations/{language}` | listings_w | ◻ Fırsat: DE/FR/ES ilan metni |
| Kişiselleştirme soruları | `…/personalization` | listings_w | ◻ |

## Mağaza

| İşlem | Uç | İzin | Durum |
|---|---|---|---|
| Mağaza bilgisi / güncelle | `GET/PUT /shops/{id}` | api_key / 🔒 shops_w | ✅ Okuma |
| **Bölümler (section)** listele / oku | `GET /shops/{id}/sections` | api_key | ✅ Gate 3 seçimi |
| Bölüm oluştur / güncelle / sil | `POST/PUT/DELETE /shops/{id}/sections…` | 🔒 shops_w | ◻ Etsy panelinden yapılır |
| Üretim ortakları | `GET /shops/{id}/production-partners` | shops_r | ◻ |
| İade politikaları | `…/policies/return` | shops_w | ◻ |
| Kargo / işleme profilleri | `…/shipping-profiles`, `…/readiness-state-definitions` | shops_r/w | ◻ Dijitalde gereksiz |
| Tatil tercihleri | `…/holiday-preferences` | shops_r/w | ◻ |
| AB ekonomik operatör (GPSR) | `…/economic-operators` | listings_r/w | ◻ AB satışında değerlendirilebilir |

## Sipariş ve ödeme (🔒 `transactions_r` / `transactions_w`)

| İşlem | Uç | Not |
|---|---|---|
| Siparişler (receipt) | `GET /shops/{id}/receipts` | Hangi ilan ne zaman satıldı |
| Satış satırları (transaction) | `GET /shops/{id}/transactions`, `…/listings/{id}/transactions` | **Fırsat:** satış ↔ run eşlemesi, hangi tarz satıyor |
| Ödemeler, hesap hareketleri | `…/payments`, `…/payment-account/ledger-entries` | Gerçek gelir/ücret |
| Kargo takibi | `POST …/receipts/{id}/tracking` | Dijitalde gereksiz |

## Yorumlar, taksonomi, kullanıcı

| İşlem | Uç | İzin | Durum |
|---|---|---|---|
| İlan / mağaza yorumları | `GET /listings/{id}/reviews`, `GET /shops/{id}/reviews` | api_key | ✅ Rakip analizi |
| Satıcı/alıcı taksonomisi + öznitelikler | `GET /seller-taxonomy/…`, `GET /buyer-taxonomy/…` | api_key | ✅ |
| Ben / kullanıcı / adres | `GET /users/me`, `/users/{id}`, `/user/addresses` | shops_r / 🔒 email_r / 🔒 address_r | ✅ `getMe` |
| Token izinleri | `POST /scopes` | — | ◻ Teşhis için |

## API'nin VERMEDİKLERİ

- **AI / üretim yöntemi alanı yok.** "With an AI generator" seçimi yalnız Etsy arayüzünden yapılır.
  Etsy politikası beyanın **ilan açıklamasında** olmasını istiyor; hat bunu zorunlu tutuyor
  (`text-rules.validateListingSeo`).
- Trafik kaynakları, arama terimleri, dönüşüm oranı (Etsy Stats) yok.
- Etsy Ads (kampanya, bütçe, tıklama) yok.
- Mesajlaşma (conversations) yok.
- Favori ekleyen kullanıcıların listesi yok; yalnız sayı (`num_favorers`) var.

## İlgili Etsy politikası (2026-10/11)

- AI ile üretilen ürünlerde AI kullanımı **açıklamada** belirtilmeli.
  Kaynak: [What Can I Sell on Etsy](https://help.etsy.com/hc/en-us/articles/360024112614-What-Can-I-Sell-on-Etsy).
- Görsel içerikli dijital ürünlerde "alıcının alacağı gerçek içeriğin önizlemesi" ilanda olmalı;
  temsilî/AI görseller yanıltıcı olmamalı. Kaynak:
  [Listing Image Requirements](https://help.etsy.com/hc/en-us/articles/44297885802647-How-Do-Etsy-s-Listing-Image-Requirements-Apply-to-My-Listings).
  Hat bunun için eserin düz önizlemesini rank 2'ye yükler.
- 22 Eki 2026 "Creativity and Trust in the Age of AI" duyurusu: ek AI destekli görseller alınacak
  ürünü doğru temsil etmeli, uygulama "önümüzdeki aylarda" sıkılaşacak.

## Önerilen sonraki adımlar (kodlanmadı)

1. **`transactions_r`**: satışları run'larla eşleyip hangi stil/ürün tipinin sattığını ölçmek.
   Yeniden yetkilendirme gerekir.
2. **Görsel alt metni**: yükleme uçlarında `alt_text` desteği şemadan ayrıca doğrulanmalı.
   Pin metnindeki alt metin yeniden kullanılabilir.
3. **Çeviriler**: Almanca/Fransızca ilan metni (`createListingTranslation`).
4. **Yorum takibi**: mağaza yorumlarını panelde göstermek.
