# Plan A — Çoklu Mağaza (Multi-Account) Desteği

> ⚠️ **DURUM: UYGULANMADI — bu bir öneridir, mevcut mimari DEĞİLDİR.**
> Kodda çoklu mağaza yapısı yok: `accounts` tablosu yok, `oauth_tokens.provider` hâlâ UNIQUE
> (tek Etsy + tek Pinterest hesabı), `pipeline_runs`'ta `account_id` kolonu yok.
> Bu dosyaya dayanarak kod yazma; önce bu planın uygulanmasına karar verilmesi gerekir.

> Amaç: Sistemin tek Etsy mağazası + tek Pinterest hesabı varsayımını kaldırıp, panelden
> mağaza (hesap) seçerek birden fazla Etsy mağazasına ürün yükleyebilmek ve her mağazaya
> ayrı bir Pinterest hesabı/board'u bağlayabilmek.
>
> Mevcut engeller (kod referanslı):
> - `src/lib/db/schema.ts:26` — `oauth_tokens.provider` UNIQUE: ikinci hesap bağlanınca
>   birincinin token'ı ezilir.
> - `src/lib/etsy/listings.ts:20-36` — `_shopId` süreç ömrü boyunca modül değişkeninde
>   cache'li; mağaza değişse bile eski shop_id'ye yayın yapılır.
> - `pipeline_runs`'ta hesap kolonu yok — recovery sweeper askıda kalan run'ı "o anda
>   bağlı olan" mağazaya yayınlar (yanlış mağazaya listing riski).
> - `ETSY_SHOP_NAME` env'de — mağaza başına değişemez, redeploy gerektirir.
> - `app_settings.pinterest_board_id` / `pinterest_token_env` global tek satır.

## 0. Kavram ve temel kararlar

**"Hesap" = mağaza profili:** Bir Etsy mağazası + ona eşlik eden Pinterest hesabı/board'u
tek kayıtta yaşar. Kullanıcı `/generate`'te run başlatırken hesap seçer; run o hesaba
mühürlenir.

Baştan verilen üç karar (planın geri kalanı bunlara dayanır):

1. **Global "aktif mağaza" anahtarı YOK — hesap run'a yazılır.** Recovery sweeper'ı
   (`src/lib/pipeline/recovery.ts:61`) askıda kalan run'ı saatler sonra sürdürebildiği
   için "o anda seçili mağaza" kavramı güvensiz; `publishToEtsy` hesabı her zaman
   `run.accountId`'den okur.
2. **Parametre açıkça taşınır (explicit threading), AsyncLocalStorage yok.**
   `src/lib/etsy/listings.ts` fonksiyonları zaten `shopId`'yi parametre olarak taşıyor;
   `accountId` eklemek mekanik ve kod tabanının idiyomuna uygun.
3. **Developer app'ler tek kalır.** Aynı `ETSY_CLIENT_ID` ve `PINTEREST_CLIENT_ID` ile
   birden fazla kullanıcı hesabı yetkilendirilebilir; yeni app açılmaz. (Not: bir Etsy
   hesabı = bir mağaza olduğundan ikinci mağaza ayrı bir Etsy kullanıcı hesabı demektir.)

## 1. Veri modeli — migration `0011_multi_account`

```sql
CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,                 -- panelde görünen ad ("Velora", "Yeni Mağaza")
  etsy_shop_name TEXT NOT NULL,        -- açıklama TERMS/© satırı (env'den buraya taşınır)
  pinterest_board_id TEXT,             -- app_settings'ten buraya taşınır
  pinterest_token_env TEXT,            -- sandbox/production uyuşmazlık takibi, hesap başına
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Backfill: mevcut kurulum "hesap 1" olur; Pinterest ayarları app_settings'ten kopyalanır
INSERT INTO accounts (id, label, etsy_shop_name, pinterest_board_id, pinterest_token_env)
VALUES (1, 'Varsayılan mağaza', 'VeloraArtDesigns',
  (SELECT value FROM app_settings WHERE key = 'pinterest_board_id'),
  (SELECT value FROM app_settings WHERE key = 'pinterest_token_env'));
SELECT setval('accounts_id_seq', 1);

ALTER TABLE oauth_tokens ADD COLUMN account_id INTEGER;
UPDATE oauth_tokens SET account_id = 1;
ALTER TABLE oauth_tokens ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE oauth_tokens DROP CONSTRAINT oauth_tokens_provider_unique;
ALTER TABLE oauth_tokens ADD CONSTRAINT oauth_tokens_provider_account_unique UNIQUE (provider, account_id);
ALTER TABLE oauth_tokens ADD CONSTRAINT oauth_tokens_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id);

ALTER TABLE pipeline_runs ADD COLUMN account_id INTEGER;
UPDATE pipeline_runs SET account_id = 1;
ALTER TABLE pipeline_runs ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id);
```

- Drizzle şeması (`src/lib/db/schema.ts`) güncellenir, `drizzle-kit generate` sonrası
  backfill INSERT/UPDATE'leri migration dosyasına elle eklenir (mevcut migration akışı
  PRE_DEPLOY job ile çalıştığı için deploy'da otomatik uygulanır).
- `app_settings`'e yeni anahtar: `default_account_id` (UI'da ön-seçim; pipeline doğruluğu
  buna bağlı DEĞİL). Eski `pinterest_board_id` / `pinterest_token_env` anahtarları koddan
  sökülür (satırlar DB'de kalabilir, zararsız).

## 2. Katman katman değişiklikler

### 2a. DB / tipler

| Dosya | Değişiklik |
|---|---|
| `src/lib/db/schema.ts` | `accounts` tablosu; `oauthTokens.accountId` + `unique(provider, accountId)`; `pipelineRuns.accountId` |
| `src/lib/db/queries.ts` | `upsertOAuthToken(provider, accountId, ...)` → `ON CONFLICT (provider, account_id)`; `getOAuthToken(provider, accountId)`, `getOAuthTokenMeta(provider, accountId)`; yeni: `listAccounts()`, `getAccount(id)`, `createAccount()`, `updateAccount()`; `createPipelineRun` opts'a `accountId` (zorunlu); `rowToPipelineRun`'a `accountId` |
| `src/types/index.ts` | `Account` arayüzü; `PipelineRun.accountId: number` |

### 2b. Etsy katmanı

| Dosya | Değişiklik |
|---|---|
| `src/lib/etsy/client.ts` | `getValidEtsyToken(accountId)`, `refreshEtsyTokenNow(accountId)`, `etsyFetch<T>(accountId, path, opts)`. `etsyPublicFetch` **değişmez** (OAuth'suz — rakip analizi hesap-bağımsız kalır) |
| `src/lib/etsy/listings.ts` | Kritik: `_shopId` modül cache'i (satır 20) → `Map<accountId, shopId>`; `getMe(accountId)`, `getShopId(accountId)`. Diğer tüm fonksiyonlara (`createDraftListing`, `uploadListingImage/File/Video`, `setListingAttributes`, `activateListing`, `getAttributeOptions`…) `accountId` parametresi eklenir (içerideki `etsyFetch` çağrıları için). Taksonomi cache'i global kalır (tüm hesaplarda aynı) ama ilk çağrı token istediğinden `getDigitalPrintsTaxonomyId(accountId)` olur |
| `src/lib/listing/description.ts` | `buildPrintDescription/buildTvDescription/buildDescriptionFor` artık `shopName` parametresi alır — `getEnv().ETSY_SHOP_NAME` yerine hesabın `etsy_shop_name`'i. Tek çağıran `src/lib/claude/seo.ts:132` → `generateSeo`'ya `shopName` eklenir |
| `src/lib/env.ts` | `ETSY_SHOP_NAME` kalır ama rolü daralır: yalnızca `publicBranding` (marka sitesi `/`, `/privacy`) ve migration backfill değeri. Listing açıklaması artık hesaptan gelir |

### 2c. Pinterest katmanı

| Dosya | Değişiklik |
|---|---|
| `src/lib/pinterest/client.ts` | `getValidPinterestToken(accountId)`, `refreshPinterestTokenNow(accountId)`, `pinterestFetch(accountId, ...)`; `persistTokens` token env'ini `app_settings` yerine **hesap satırına** yazar |
| `src/lib/pinterest/pins.ts` | `resolveBoardId(account)` → `accounts.pinterest_board_id`; boşsa mevcut eylemli hata mesajı korunur ("/admin'deki X hesabı kartından board seçin"). `PINTEREST_BOARD_ID` env fallback'i sökülür (artık panelden seçiliyor) |
| `src/lib/pinterest/boards.ts` | `listBoards(accountId)`, `createBoard(accountId, ...)` |
| `src/lib/pinterest/hosts.ts` | Değişmez — sandbox/production **app seviyesinde** globaldir; ikinci Pinterest hesabı da Trial bitene kadar sandbox'tadır |

### 2d. OAuth route'ları (hesap bağlamı)

- `start` route'ları `?account=N` alır; mevcut PKCE/state cookie'lerinin yanına
  `etsy_oauth_account` / `pinterest_oauth_account` cookie'si yazılır.
- `callback` route'ları (örn. `src/app/api/auth/etsy/callback/route.ts`) cookie'den
  `accountId` okuyup `upsertOAuthToken(provider, accountId, ...)` çağırır; redirect
  `/admin?etsy=connected&account=N`.
- `status` route'ları `?account=N` alır; `pinterest/status` `tokenEnv`/`selectedBoardId`'yi
  artık hesap satırından okur.
- `pinterest/boards` route'u GET/POST `?account=N` — board seçimi hesabın kolonuna yazılır.
- **Yeni:** `src/app/api/accounts/route.ts` (GET liste + POST oluştur: `{label, etsyShopName}`)
  ve `src/app/api/accounts/[id]/route.ts` (PATCH: yeniden adlandır / shop name / board;
  DELETE yalnızca hiç run'ı yoksa).

### 2e. Pipeline

| Dosya | Değişiklik |
|---|---|
| `src/app/api/pipeline/generate/route.ts` | Body'ye `accountId` (zorunlu, `getAccount` ile doğrulanır) → `createPipelineRun`'a geçer |
| `src/lib/pipeline/run.ts` | `publishToEtsyInner` (satır ~431): `getShopId(run.accountId)`, tüm listings çağrılarına `run.accountId`. `publishToPinterestInner` (satır ~553): `createPin`'e hesap. `selectVariation` → `generateSeo`'ya hesabın `etsyShopName`'i. Kritik nokta: **hesap her seferinde run satırından okunur**, hiçbir yerde süreç-global tutulmaz |
| `src/lib/pipeline/recovery.ts` | Değişiklik gerekmez — step fonksiyonları hesabı run'dan aldığı için sweeper otomatik doğru mağazaya sürdürür (planın asıl güvenlik kazancı burası) |
| `pipeline/status/[id]`, `pipeline/runs` | Yanıta `accountId` + `accountLabel` eklenir (UI rozetleri için) |
| `pin-copy`, `publish-pinterest`, `resume`, `reject`, `regenerate-mockup` | Route imzaları değişmez (runId'den hesaba ulaşılır) |

### 2f. Cron'lar

- `src/cron/token-refresh.ts`: `keepAlive` artık `listAccounts()` × 2 provider döner —
  her hesabın Etsy 90 gün / Pinterest 60 gün penceresi ayrı ayrı canlı tutulur. Hata
  izolasyonu hesap+provider bazına iner (bir hesabın ölü token'ı diğerlerini durdurmaz —
  mevcut try/catch deseni korunur).
- `src/cron/competitor-scan.ts` + `src/lib/scoring/competitor-algorithm.ts`: rakip tarama
  authed `etsyFetch` kullanıyor ama veri hesap-bağımsız → **`default_account_id`'nin
  token'ı** ile çağrılır (tek satırlık yönlendirme).

### 2g. UI

| Dosya | Değişiklik |
|---|---|
| `src/app/admin/page.tsx` | Üste "Mağazalar" yönetim kartı (listele/ekle/yeniden adlandır). Sayfa hesap başına bir bölüm render eder |
| `src/components/EtsyConnection.tsx`, `src/components/PinterestConnection.tsx`, `src/components/PinterestBoardPicker.tsx` | `accountId` prop'u; status/boards çağrıları `?account=N`; "Bağlan" linki `start?account=N`. PinterestConnection'daki doğrudan `getSetting(...)` çağrıları hesap satırından okumaya döner |
| `src/app/admin/generate/page.tsx` | Form üstüne hesap seçici (default: `default_account_id`); seçim `POST generate`'e gider. Run listesi/durum ekranlarında hesap rozeti |

## 3. Geçiş stratejisi ve riskler

1. **Sıfır kesinti:** Migration backfill'i mevcut token + run'ları hesap 1'e bağlar;
   deploy sonrası davranış bugünküyle birebir aynıdır (tek hesap, her şey ona akıyor).
   İkinci mağaza tamamen opsiyonel bir ekleme olur.
2. **Askıdaki run'lar:** `publishing_etsy`'de yarım kalmış bir run migration sonrası
   hesap 1 olarak işaretlenir → recovery doğru mağazaya devam eder. Yine de deploy'u
   aktif run yokken yapmak temiz olur.
3. **İkinci hesabı yetkilendirme (operasyonel):** OAuth authorize ekranı tarayıcıda
   **o an login olan** Etsy/Pinterest hesabını bağlar. İkinci hesabı bağlarken gizli
   pencere kullanmak ya da önce siteden çıkış yapmak gerekir — `/admin` bağlantı kartına
   bir satır uyarı eklenmeli.
4. **Pinterest Trial kısıtı hesapla aşılmaz:** İkinci Pinterest hesabı da aynı developer
   app'ten geçtiği için Standard access onaylanana dek sandbox'tadır; board'u yine
   `POST /v5/boards` ile yaratılır.
5. **`getShopId` Map cache'i:** Hesap silinirse/yeniden yetkilendirilirse cache'i
   temizleyen küçük bir invalidation (`clearShopIdCache(accountId)`, callback'te
   çağrılır) eklenmeli — yoksa eski shop_id'ye yayın riski geri gelir.
6. **Kapsam dışı bırakılanlar (bilinçli):** marka sitesi (`publicBranding`) tek marka
   kalır; `competitor_*` tabloları hesap-bağımsız kalır; storage yolları (`runs/{id}/…`)
   değişmez.

## 4. İş sırası

| Faz | İçerik | Boyut |
|---|---|---|
| 1 | Migration 0011 + schema + queries + tipler (`Account` CRUD dahil) | ~4 dosya, yarım gün |
| 2 | Etsy/Pinterest token+client katmanı, listings/pins/boards imzaları, OAuth route'ları (`?account=`), token-refresh cron | ~10 dosya, yarım-1 gün — mekanik ama en geniş dokunuş |
| 3 | Pipeline: generate route + run.ts (publish yolları, generateSeo shopName) + status yanıtları + competitor default hesap | ~6 dosya, yarım gün |
| 4 | UI: Mağazalar kartı, bağlantı kartlarına accountId, generate seçici, run rozetleri | ~5 dosya, yarım gün |
| 5 | Uçtan uca test + `.env.example`/CLAUDE.md güncellemesi | yarım gün |

**Toplam: ~2-2,5 gün, ~25 dosya + 1 migration.** TypeScript burada güvenlik ağı: imza
değişiklikleri (`etsyFetch(accountId, …)`) atlanan her çağrı yerini derleme hatasıyla
gösterir.

## 5. Test kontrol listesi (Faz 5)

- [ ] Migration sonrası tek hesapla tam pipeline (üretim → yayın → pin) regresyonu
- [ ] Hesap 2 oluştur + Etsy bağla → hesap 1'in token'ının bozulmadığını doğrula
      (eski UNIQUE ezmesinin gittiğinin kanıtı)
- [ ] Hesap 2 ile yayın → listing doğru mağazada
- [ ] `publishing_etsy`'de süreç öldürüp recovery'nin doğru mağazaya devam ettiğini doğrula
- [ ] Token-refresh logunda iki hesabın da tazelendiğini gör
- [ ] Açıklama TERMS satırında hesap 2'nin mağaza adı
- [ ] Hesap 2'ye Pinterest bağla + sandbox board yarat + pin at → hesap 1'in board
      seçiminin etkilenmediğini doğrula
