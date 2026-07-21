# CLAUDE.md — Etsy AI Otomasyon Projesi (Kod-Only)

Bu dosya, Claude Code oturumları için proje bağlamıdır. Her oturumda bu dosyayı oku ve güncel kal.

## 1. Proje Özeti

Etsy'de dijital görsel (duvar sanatı/baskı vb.) satan bir mağaza için uçtan uca otomasyon:

1. Kullanıcı bir prompt yazar (opsiyonel: referans görsel yükler), **model seçer** (Imagen 4 veya FLUX.1 Kontext [pro]) ve **varyasyon sayısını** (1-4) belirler
2. Seçilen modelle istenen sayıda varyasyon üretilir (önizleme kalitesinde)
3. **Onay kapısı #1:** Kullanıcı varyasyonlardan birini seçer (veya reddeder)
4. Seçilen görsele göre Claude, Etsy SEO alanlarını üretir: hook stratejisinde başlık + **şablonlu açıklama** (hook + PERFECT FOR + sabit gövde) + 13 etiket + 13 materyal + **5 öznitelik** (Orientation/Style/Occasion/Room/Subject)
5. **Onay kapısı #2:** Kullanıcı SEO + öznitelikleri inceler/düzenler/ekler ve onaylar
6. Onay sonrası: görsel **clarity-upscaler ×4** ile büyütülür; sonra (a) **5 JPG** dijital dosya (oran başına en büyük boyut, 300 DPI, <20MB), (b) **8 mockup** (FLUX.1 Kontext i2i), (c) **1 zoom video** (ffmpeg), (d) **1 sabit ölçü görseli** üretilir/eklenir
7. **Onay kapısı #3:** Kullanıcı medyayı (8 mockup + video + ölçü) ve 5 JPG'yi görür; beğenmediği mockup'ı tek tek yeniden üretir; fiyatı girip "Etsy'ye yayınla" der
8. Listing Etsy'de yayınlanır: 9 görsel (8 mockup + ölçü) + 1 video + 5 JPG yüklenir, öznitelikler yazılır, listing `active` yapılır (ham görsel display olarak YÜKLENMEZ)
9. (Kapsam dışı/opsiyonel) Aynı görsel Pinterest'te, Etsy listing linkiyle pinlenir
10. Ayrı bir modül: rakip mağazaları tarayıp tahmini satış/fırsat skoru üretir

**Her adım kullanıcı onayını bekler** — sistem hiçbir adımı kullanıcı görmeden otomatik geçmez.

**Mimari karar: n8n YOK.** Her şey tek bir Next.js (App Router, TypeScript) projesinde — frontend (panel) + backend (API routes) bir arada.

## 2. Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Uygulama | Next.js (App Router) + TypeScript |
| Veritabanı | PostgreSQL (DO Managed Database) |
| Dosya depolama | DigitalOcean Spaces (S3 uyumlu) — şu an lokal disk sürücüsü (`lib/storage`, ileride S3'e geçer) |
| Görsel üretim | **Seçilebilir:** Imagen 4 (Google AI Studio key) **veya** FLUX.1 Kontext [pro] (fal.ai, `FAL_KEY`) — UI'da model seçilir |
| Görsel analiz + SEO | Claude — Anthropic API (vision) |
| Upscale | fal.ai `clarity-upscaler` ×4 (creativity 0.3) — fal kredisi yoksa pass-through |
| Mockup | fal.ai FLUX.1 Kontext [pro] image-to-image (`fal-ai/flux-pro/kontext`) — 8 sahne |
| Tanıtım videosu | `ffmpeg-static` — ~8 sn zoom mp4 (sistem ffmpeg gerektirmez) |
| Görsel işleme (kırpma/oran/DPI) | `sharp` |
| Dijital dosyalar | **5 JPG** (oran başına en büyük boyut, 300 DPI, <20MB; ZIP yok) |
| Etsy | Etsy Open API v3 — OAuth2 + PKCE |
| Pinterest | Pinterest API v5 — OAuth2 (Standard access aktif, pinler public) |
| Zamanlanmış görevler | `node-cron` (uygulama içinde) |
| Barındırma | DigitalOcean App Platform (Web Service) |
| Token şifreleme | AES-256-GCM (Node `crypto`) |
| Rate limit yönetimi | `p-throttle` (Etsy: ~10 req/s) |

## 3. Proje Yapısı

```
app/
  page.tsx                       → dashboard
  generate/page.tsx              → üretim & onay paneli
  competitors/page.tsx           → rakip analizi paneli
  api/
    auth/etsy/start/route.ts
    auth/etsy/callback/route.ts
    competitor-research/analyze/route.ts → rakip listing URL'inden özgün SEO üret (ön-adım, senkron)
    pipeline/generate/route.ts      → model+varyasyon ile üretim başlat (arka plan; opsiyonel competitorResearchId)
    pipeline/select-image/route.ts  → kapı #1: varyasyon seç → SEO üret (rakip varsa o nişe yönlendirilir)
    pipeline/approve-seo/route.ts   → kapı #2: SEO onayla → upscale + 5 JPG + 8 mockup + video + ölçü
    pipeline/regenerate-mockup/route.ts → gate 3: tek mockup yeniden üret
    pipeline/publish/route.ts       → kapı #3: Etsy'ye yayınla (medya + öznitelik dahil)
    pipeline/reject/route.ts        → run'ı iptal et
    pipeline/status/[id]/route.ts   → durum sorgulama (polling)
    pipeline/runs/route.ts          → run listesi
    competitors/route.ts            → rakip verisi (GET)
    competitors/scan/route.ts       → rakip tarama tetikleyici
lib/
  etsy/      (client.ts, oauth.ts, listings.ts) → taksonomi(Digital Prints)+properties+video+attributes; etsyPublicFetch + getListingById (public, OAuth'suz rakip analizi)
  fal/       (index.ts)            → paylaşılan fal client + storage upload (image_url için)
  imagen/    (client.ts)            → generateImagesImagen (çoklu varyasyon)
  flux/      (client.ts)            → generateImagesFlux (fal.ai FLUX.1 Kontext pro, text-to-image)
  image-gen/ (index.ts)            → model dispatcher ('imagen' | 'flux')
  claude/    (client.ts, vision.ts, seo.ts, competitor-seo.ts) → seo.ts: generateSeo(competitorRef ile augment); competitor-seo.ts: analyzeCompetitorSeo (rakip metninden özgün SEO)
  upscale/   (client.ts)            → fal clarity-upscaler ×4 (fallback pass-through)
  mockup/    (scenes.ts, client.ts) → 8 sahne flux-kontext image-to-image
  video/     (zoom.ts)             → ffmpeg-static zoom mp4
  listing/   (description.ts, size-guide.ts) → açıklama şablonu + sabit ölçü görseli
  packaging/ (resize-and-export.ts) → packageJpegs: 5 JPG (sharp, 300 DPI, <20MB)
  pipeline/  (run.ts)              → adım adım orkestrasyon (generateVariations/selectVariation/approveSeoAndProcess/regenerateMockup/publishToEtsy)
  storage/   (index.ts)            → lokal disk sürücüsü (putObject/readObject/keyFromUrl)
  scoring/   (competitor-algorithm.ts)
  db/        (schema.ts, queries.ts, crypto.ts)
public/templates/size-guide.png    → kullanıcının sağladığı sabit ölçü görseli (her listing'e eklenir)
cron/
  competitor-scan.ts             → node-cron kaydı
types/
  index.ts                       → tüm domain tipleri (bkz. Bölüm 6)
```

## 4. Veritabanı Şeması (PostgreSQL)

```sql
CREATE TABLE oauth_tokens (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('etsy', 'pinterest')),
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'queued',
  -- queued | generating_image | awaiting_approval | generating_seo
  -- | awaiting_seo_approval | processing_files | awaiting_publish
  -- | publishing_etsy | publishing_pinterest | done | error
  prompt TEXT NOT NULL,
  image_model TEXT,                    -- 'imagen' | 'flux' (UI'da seçilen model)
  reference_image_url TEXT,
  variation_urls JSONB,                -- üretilen tüm varyasyonların URL'leri (string[])
  generated_image_url TEXT,            -- seçilen varyasyon (master kaynağı/önizleme)
  upscaled_image_url TEXT,             -- processing_files: clarity-upscaler ×4 (master)
  digital_file_urls JSONB,             -- processing_files: oran→JPG url:
                                       -- { ratio_2x3, ratio_3x4, ratio_4x5, ratio_11x14, ratio_5x7 }
  media_urls JSONB,                    -- { mockups: string[8], video?, sizeGuide? }
  seo_json JSONB,                   -- { title, hook, perfectFor[], tags[13], description, materials[13], categoryId, attributes{} }
  competitor_research_id INTEGER,   -- hangi rakip analizinden beslendi (mantıksal FK → competitor_research.id)
  etsy_listing_id BIGINT,
  pinterest_pin_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Rakip SEO analizi: kullanıcının girdiği Etsy URL'inden çekilen veriler + üretilen özgün SEO.
CREATE TABLE competitor_research (
  id SERIAL PRIMARY KEY,
  pipeline_run_id UUID REFERENCES pipeline_runs(id),  -- analiz anında NULL; run oluşunca bağlanır
  source_listing_id BIGINT NOT NULL,
  source_url TEXT NOT NULL,
  source_title TEXT,
  source_tags JSONB,
  source_taxonomy_id BIGINT,        -- izleme amaçlı (yayında default Digital Prints kullanılır)
  source_num_favorers BIGINT,
  source_views BIGINT,
  generated_title TEXT,
  generated_tags JSONB,
  generated_description TEXT,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE competitor_shops (
  shop_id BIGINT PRIMARY KEY,
  shop_name TEXT NOT NULL,
  total_sales INT,
  total_reviews INT,
  review_ratio NUMERIC,             -- total_reviews / total_sales
  last_scanned_at TIMESTAMPTZ
);

CREATE TABLE competitor_listings (
  listing_id BIGINT PRIMARY KEY,
  shop_id BIGINT REFERENCES competitor_shops(shop_id),
  title TEXT,
  tags JSONB,
  price NUMERIC,
  num_favorers INT,
  review_count INT,
  creation_date TIMESTAMPTZ,
  estimated_sales NUMERIC,
  monthly_velocity NUMERIC,
  opportunity_score NUMERIC,
  scanned_at TIMESTAMPTZ DEFAULT now()
);
```

## 5. Ortam Değişkenleri (.env)

```
DATABASE_URL=
ETSY_CLIENT_ID=
ETSY_CLIENT_SECRET=
ETSY_REDIRECT_URI=
PINTEREST_CLIENT_ID=
PINTEREST_CLIENT_SECRET=
PINTEREST_REDIRECT_URI=
GOOGLE_API_KEY=            # Imagen / Gemini Developer API
FAL_KEY=                  # fal.ai — FLUX.1 Kontext [pro] + clarity-upscaler + mockup
ETSY_SHOP_NAME=           # açıklama TERMS/telif satırı (default VeloraArtDesigns)
ANTHROPIC_API_KEY=
PUBLIC_BASE_URL=          # lokal disk depolama public URL tabanı (örn. http://localhost:3000)
# UPSCALE_API_KEY artık kullanılmıyor (upscale fal clarity-upscaler'a taşındı)
DO_SPACES_KEY=
DO_SPACES_SECRET=
DO_SPACES_BUCKET=
DO_SPACES_REGION=
DO_SPACES_ENDPOINT=
TOKEN_ENCRYPTION_KEY=
```

`.env.example` repo'da tutulur (değerler boş), `.env.local` asla commit edilmez.

## 6. Temel Tipler (types/index.ts) — Geliştirmeye Buradan Başla

Bizim alışkanlığımız: önce tipleri ve mock data'yı yazıp UI'yi onunla geliştirmek, sonra gerçek API'lere bağlamak. İlk iş bu dosyayı oluşturmak:

```ts
export type PipelineStatus =
  | 'queued' | 'generating_image' | 'awaiting_approval'      // kapı #1: görsel seç
  | 'generating_seo' | 'awaiting_seo_approval'                // kapı #2: SEO onayı
  | 'processing_files' | 'awaiting_publish'                   // kapı #3: yayın onayı
  | 'publishing_etsy' | 'publishing_pinterest'
  | 'done' | 'error';

export type ImageModel = 'imagen' | 'flux';

// Oran başına TEK JPG (en büyük boyut, 300 DPI). packaging/resize-and-export burayı kullanır.
export const PRINT_RATIOS = [
  { key: 'ratio_2x3',  label: '2:3',   width: 7200, height: 10800, subSizes: [...] }, // en büyük 24x36
  { key: 'ratio_3x4',  label: '3:4',   width: 7200, height: 9600,  subSizes: [...] }, // 24x32
  { key: 'ratio_4x5',  label: '4:5',   width: 7200, height: 9000,  subSizes: [...] }, // 24x30
  { key: 'ratio_11x14',label: '11:14', width: 6600, height: 8400,  subSizes: [...] }, // 22x28
  { key: 'ratio_5x7',  label: '5:7',   width: 7500, height: 10500, subSizes: [...] }, // 25x35
] as const;
export type RatioKey = (typeof PRINT_RATIOS)[number]['key'];
export type DigitalFileUrls = Partial<Record<RatioKey, string>>;   // değer = JPG url
export interface MediaUrls { mockups: string[]; video?: string; sizeGuide?: string; }
export interface ListingAttributes { orientation; style; occasion; room; subject; } // string

export interface SeoData {
  title: string;          // hook stratejisi: ana anahtar kelimeyle başlar
  hook: string;           // 2-3 cümle açılış (açıklamanın başı)
  perfectFor: string[];   // 3-5 stil/mekân/vesile
  tags: string[];         // tam 13, her biri <=20 karakter
  description: string;    // koddan birleştirilir (hook + perfectFor + sabit şablon)
  materials: string[];    // 13
  categoryId: string;     // yayında Digital Prints taksonomi id
  attributes: ListingAttributes;
}

export interface PipelineRun {
  id; status; prompt;
  imageModel?; referenceImageUrl?;
  variationUrls?: string[];            // kapı #1'de gösterilir
  generatedImageUrl?: string;          // seçilen varyasyon
  upscaledImageUrl?: string;           // clarity ×4 master
  digitalFileUrls?: DigitalFileUrls;   // 5 JPG
  mediaUrls?: MediaUrls;               // 8 mockup + video + ölçü
  seo?: SeoData; etsyListingId?; pinterestPinId?; errorMessage?; createdAt; updatedAt;
}

export interface CompetitorListing {
  listingId: number;
  shopId: number;
  title: string;
  tags: string[];
  price: number;
  numFavorers: number;
  reviewCount: number;
  creationDate: string;
  estimatedSales: number;
  monthlyVelocity: number;
  opportunityScore: number;
}
```

## 7. Pipeline Akışı (Özet)

```
queued → generating_image → awaiting_approval ──(kapı #1: görsel seç)──┐
                                                                        ↓
   generating_seo → awaiting_seo_approval ──(kapı #2: SEO onayla/düzenle)──┐
                                                                           ↓
   processing_files (upscale ×4 + 5 JPG + 8 mockup + video + ölçü) → awaiting_publish ──(kapı #3: yayınla)──┐
                                                                                       ↓
   publishing_etsy → done                                          ↘ error (herhangi bir adımda)
```

- **Rakip SEO analizi (opsiyonel ön-adım):** `/generate` üstündeki panelden bir Etsy listing URL'i girilir → `competitor-research/analyze` public Etsy GET ile veriyi çekip Claude ile özgün SEO üretir ve `competitor_research`'e yazar. Bağlanırsa run `competitor_research_id` ile işaretlenir; gate 2'de `generateSeo`, görsele sadık kalarak o nişe/keyword'lere yönlendirilir (`competitorRef`). Taksonomi yine default Digital Prints.
- **3 insan-onayı kapısı** var; sistem hiçbir kapıyı kullanıcı görmeden otomatik geçmez (kullanıcı her adımda ekleme/düzenleme yapabilir).
- `processing_files` SADECE seçilen görsel için çalışır — reddedilenler için upscale/medya maliyeti harcanmaz.
- **Dijital dosyalar = 5 JPG** (oran başına en büyük boyut, `sharp`, 300 DPI, mozjpeg q90). Her JPG <20MB; aşarsa kalite %5 düşürülür (zemin %60).
- **Medya** (`processing_files`): clarity-upscaler ×4 → master; sonra 8 mockup (flux-kontext i2i), 1 zoom video (ffmpeg), 1 sabit ölçü görseli. **fal kredisi yoksa**: upscale pass-through, mockup'lar boş slot (run düşmez), gate 3'te tek tek yeniden üretilebilir.
- `regenerate-mockup`: gate 3'te tek mockup'ı yeniden üretir (status kısa süre `processing_files` → `awaiting_publish`).
- Her adım `pipeline_runs.status` ve ilgili alanları günceller. Uzun adımlar arka planda (await edilmeden) çalışır; frontend `pipeline/status/[id]`'i polling eder. Onay kapıları (`awaiting_*`) polling'i durdurur.
- Ayrı kuyruk sistemi (BullMQ/Redis) YOK — App Platform Web Service kalıcı süreç, uzun `await` zincirleri sorun değil.

## 8. Etsy & Pinterest Entegrasyon Notları

- **Etsy**: OAuth2 + PKCE. `/api/auth/etsy/start` → code_verifier üret + sakla → authorize URL'e yönlendir. `/api/auth/etsy/callback` → token al → `oauth_tokens`'a şifreli yaz. Gerekli scope'lar: `listings_r`, `listings_w`, `listings_d`, `shops_r`.
- **Pinterest**: standart OAuth2. `/api/auth/pinterest/start` ve `/callback`. Hesap zaten Standard access'te (pinler public) — ek onay süreci yok.
- Tüm Etsy çağrıları `getValidEtsyToken()` üzerinden geçer (gerekirse refresh eder).
- **x-api-key formatı (2026-02-09'dan beri):** Etsy artık `x-api-key` header'ında `keystring:shared_secret` ister (sadece keystring değil). `lib/etsy/client.ts` bunu `ETSY_CLIENT_ID:ETSY_CLIENT_SECRET` olarak gönderir.
- **Kategori**: Art & Collectibles > Prints > Digital Prints. taxonomy_id `getDigitalPrintsTaxonomyId()` ile `/seller-taxonomy/nodes`'tan bulunur (cache). `when_made` = en güncel aralık (`2020_2026`, Etsy reddederse `2020_2025`), `who_made:'i_did'`, `type:'download'`.
- **Öznitelikler**: `getPropertiesByTaxonomyId(taxId)` ile izinli değerler alınır; Claude'un seçtiği Orientation/Style/Occasion/Room/Subject ada göre value_id'ye eşlenir, `PUT listings/{id}/properties/{property_id}` ile yazılır (eşleşmeyen atlanır).
- Listing oluşturma sırası: `POST listings` (taslak) → öznitelikler → `POST listings/{id}/images` (**8 mockup + ölçü görseli**, ham görsel DEĞİL) → `POST listings/{id}/videos` (zoom mp4) → `POST listings/{id}/files` (**5 JPG**) → durumu `active` yap. Etsy: max 10 görsel + 1 video; dosya adı 3-70 karakter; image_url isteyen fal modelleri için master `fal.storage.upload` ile yüklenir (lokal URL çalışmaz).
- Pinterest pin: `POST /v5/pins` — `link` alanına Etsy listing URL'i, görsel Spaces URL'i.

## 9. Rakip Analizi Algoritması (lib/scoring/competitor-algorithm.ts)

1. `getShop` → `transaction_sold_count`, toplam yorum, `create_date`
2. `review_ratio = toplam_yorum / toplam_satış` (mağazaya özgü kalibrasyon)
3. `findAllActiveListingsByShop` → tüm ürünler + `original_creation`
4. Her ürün için `getReviewsByListing` → yorum sayısı
5. `estimated_sales = yorum_sayısı / review_ratio`
6. `monthly_velocity = estimated_sales / yayında_olduğu_ay_sayısı`
7. Son 90 gün yorum hızı → momentum bonusu
8. `opportunity_score = ağırlıklı(monthly_velocity, momentum, num_favorers, rekabet_düşüklüğü)`
9. Sonuçları `competitor_listings`'e yaz

Sonuçlar tahminidir, kesin satış rakamı değildir — bir sıralama/önceliklendirme aracıdır.

## 10. Önemli Kurallar

- **Dosya formatı**: Dijital ürün dosyaları **5 JPG** (oran başına en büyük boyut): `ratio_2x3` 24x36, `ratio_3x4` 24x32, `ratio_4x5` 24x30, `ratio_11x14` 22x28, `ratio_5x7` 25x35 — hepsi **300 DPI, mozjpeg q90**, her biri <20MB (aşarsa kalite %5'er düşer, zemin %60). Müşteri açıklamadaki alt boyutları baskıcıda küçülterek alır. ZIP YOK.
- **Açıklama şablonu** (`lib/listing/description.ts`): Claude HOOK (ana anahtar kelimeyle başlayan 2-3 cümle) + PERFECT FOR (3-5 kelime) üretir; "WHAT YOU'LL RECEIVE (5 JPG, 300 DPI + oran/alt boyut listesi) / HOW TO DOWNLOAD / HOW TO PRINT / PLEASE NOTE / HOW THIS WAS MADE (AI açıklaması) / TERMS (© `ETSY_SHOP_NAME`)" sabit gövdesi koddan eklenir.
- **Tanıtım medyası**: Listing'e 8 mockup (fal flux-kontext) + 1 zoom video (ffmpeg) + 1 sabit ölçü görseli (`public/templates/size-guide.png`, kullanıcı sağlar) yüklenir. Ham görsel display olarak YÜKLENMEZ.
- **Öznitelikler**: Orientation (oran'dan kesin) + Style/Occasion/Room/Subject (Claude seçer, taksonomi değerine eşlenir).
- **Görsel modeli**: UI'da `imagen` (Google) veya `flux` (fal.ai FLUX.1 Kontext [pro]) seçilir; `lib/image-gen` dispatcher ilgili API'ye yönlendirir. Varyasyon 1-4, varsayılan `flux`. Mockup + upscale hep fal'dır.
- **Dil**: Etsy SEO içerikleri (title, hook, description, tags) varsayılan olarak **İngilizce** üretilir (Etsy'nin ana pazarı İngilizce konuşan alıcılar). Bu varsayım değişirse burayı güncelle.
- **Telif**: Referans görsel modunda, görsel doğrudan modele referans olarak verilmeden önce Claude ile tarif edilip prompt zenginleştirilir — birebir kopya üretilmez.
- **Token güvenliği**: `oauth_tokens` içindeki token'lar AES-256-GCM ile şifreli saklanır (Passora'daki yaklaşımla aynı). Anahtarlar asla repoya commit edilmez.
- **Rate limit**: Etsy ~10 req/s, Pinterest yazma ~100 req/dk. `lib/etsy/client.ts` içinde throttle uygulanır.

## 11. Geliştirme Sırası (Sprint 0)

1. Next.js (App Router, TS) projesini oluştur, `types/index.ts` ile başla, mock data ile `generate` ve `competitors` sayfalarının UI'sini kur.
2. DO Managed PostgreSQL + Spaces kaynaklarını oluştur, Bölüm 4'teki şemayı migration olarak yaz/çalıştır.
3. Imagen API key ile minimal bir `/api/pipeline/generate` test endpoint'i — prompt al, görsel üret, Spaces'e yaz.
4. Claude API ile `lib/claude/seo.ts` — görsel + prompt al, Bölüm 6'daki `SeoData` şemasında JSON döndür.
5. Etsy ve Pinterest developer app'lerini oluştur, redirect URI'leri yerel URL'e göre kaydet, OAuth akışlarını (`/api/auth/.../start` ve `/callback`) yerelde test et.
6. Tüm parçalar tek tek doğrulandıktan sonra `pipeline/generate` + adım route'larında (`select-image`, `approve-seo`, `publish`) birleştir.

**Mevcut durum (canlı doğrulandı):** Imagen + FLUX, Claude SEO, 5 JPG paketleme, ve Etsy OAuth + yayın çalışıyor. Pinterest kapsam dışı; upscale pass-through (fal kredisi yoksa).

**Canlıya alma (DigitalOcean) altyapısı eklendi:**
- **Depolama** (`lib/storage`): env-seçmeli sürücü — `DO_SPACES_*` doluysa **S3 (Spaces, public-read)**, değilse lokal disk (dev). İmzalar sabit. `keyFromUrl` hem Spaces hem legacy `/uploads/` URL'ini çözer.
- **DB SSL** (`lib/db/ssl.ts`): `DATABASE_SSL=true` ya da `sslmode=require` → SSL (opsiyonel `DATABASE_CA_CERT`). Managed PG için.
- **Migration runner** (`scripts/migrate.ts`, `npm run db:migrate`, tsx): App Platform **PRE_DEPLOY job** çalıştırır. Migration `0008_add_resilience_columns` = `attempts` + `publish_progress`.
- **Pipeline dayanıklılığı**: adımlar idempotent/resume; `publishToEtsy` `publish_progress` checkpoint'i ile çift-listing/çift-upload olmadan sürdürülür. `lib/pipeline/recovery.ts` + `cron/recovery.ts` (her 2 dk + startup) askıda kalan run'ları PG advisory lock ile sürdürür. `instrumentation.ts` boot'ta env fail-fast (`assertProdEnv`: prod'da Spaces zorunlu).
- **Docker**: kök `Dockerfile` (multi-stage, node:22, tam node_modules → sharp/ffmpeg-static garanti), `.dockerignore`, `/api/health`. `.do/app.yaml` app spec template (web service + migrate job + domain).
- **Deploy**: `instance_count:1` (cron + fire-and-forget), `instance_size_slug: basic-s` (2 GB — 1 GB YETMEZ, aşağıya bak). OAuth redirect + `PUBLIC_BASE_URL` custom domaine ayarlanır; Etsy panelinde redirect güncellenir.

### Kaynak sınırları — `processing_files` adımı (bozulmaması gereken kurallar)

Canlıda `/api/pipeline/status` 504/524 veren ve run'ı bitmeyen döngüye sokan sorun buradaydı; kök nedenler ölçülerek giderildi. Bu adımı değiştirirken:

1. **Görsel işleri SIRAYLA çalışır.** `packageJpegs` 5 oranı `Promise.all` ile paralel işliyordu: 5 × ~77 megapiksel pipeline → tepe RSS **1823 MB** (instance 1 GB) → OOM. Seri hâlde **204 MB**. Paralelleştirmeyin.
2. **mozjpeg kullanılmaz.** Tüm görüntünün katsayı tablosunu bellekte tutar. 7200×10800 ölçümü: mozjpeg 6.0 MB / 12.5 s / 611 MB ↔ baseline libjpeg 7.1 MB / 5.1 s / 173 MB. 20 MB tavanının çok altındayız; `{ mozjpeg:false, progressive:false, optimiseCoding:false }` kalmalı.
3. **sharp her zaman `@/lib/image/sharp`'tan import edilir** (`import sharp from 'sharp'` DEĞİL). Orada `concurrency` (`SHARP_CONCURRENCY`, varsayılan 1) ve `cache(false)` uygulanır; libvips varsayılanı konteynerde HOST çekirdek sayısını görür.
4. **`UV_THREADPOOL_SIZE=8`** Dockerfile'da sabittir. sharp libuv havuzunu tutar ve `dns.lookup` de aynı havuzdadır: havuz doluyken DNS ölçümde 4 ms yerine **28.6 s** sürdü → yeni her DB/Spaces/fal/Etsy bağlantısı ve dolayısıyla status endpoint'i kilitlendi.
5. **Üretilen dosyalar biriktirilmez** — `packageJpegs(master, onFile)` her JPG'yi üretir üretmez depoya yazdırır.
6. **Her dış çağrının timeout'u vardır** (`lib/async/timeout.ts` → `TIMEOUTS`). fal `subscribe` timeout'suzken asılı kalıp adımı sonsuza kadar bekletiyordu.
7. **Uzun adımlar `withRunLease` altında çalışır** (`lib/pipeline/run.ts`). Kurtarma sweeper'ı "askıda"yı yalnızca `updated_at`e bakarak belirlediğinden, hâlâ çalışan bir run'ın İKİNCİ kopyasını başlatıp belleği ikiye katlıyordu. Kira + 60 sn heartbeat bunu engeller; `recovery.ts` `isRunActive`'i kontrol eder. `regenerateMockup` bilerek kirasızdır (run `awaiting_publish`te kalır, sweeper dokunmaz).
8. **Advisory lock `withAdvisoryLock` ile alınır** — kilit onu alan bağlantıya aittir; havuzdan farklı bir client'la `unlock` çağırmak sessizce başarısız olup kilidi sızdırır.

## 12. Referans Doküman

Detaylı mimari, maliyet ve zaman planı için: `Etsy_AI_Otomasyon_Raporu_v3_KodOnly.docx` (Sürüm 3).
