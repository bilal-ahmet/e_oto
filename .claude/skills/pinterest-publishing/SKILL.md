---
name: pinterest-publishing
description: Pinterest API v5 ile çalışırken kullan — OAuth2 (PKCE yok), sandbox/production ayrımı, board listeleme/oluşturma/silme, pin atma, pin metni üretimi, token ömrü. src/lib/pinterest/* veya api/auth/pinterest/* dosyalarına dokunulduğunda ya da "pin atılmıyor / board görünmüyor" tipi hatalarda yükle.
---

# Pinterest yayını

Kod: `src/lib/pinterest/{hosts,oauth,client,boards,pins}.ts` · Akış: `publishToPinterest`
(`src/lib/pipeline/run.ts`). Standard access başvurusu: **`standard-access.md`** (aynı klasör).

## Erişim katmanı — önce bunu oku

Uygulama şu an **Trial access**'te: pin **yalnızca `api-sandbox.pinterest.com`** üzerinde
oluşturulabilir ve **yalnızca hesap sahibine görünür** (Standard'da herkese açık olur). "Pin
atıldı ama Pinterest'te göremiyorum" şikâyetinin normal cevabı budur.

- Host tek kaynaktan: `hosts.ts` → `apiBase()`, `tokenUrl()`, `isSandbox()`; `PINTEREST_API_ENV`
  = `sandbox` | `production`. **Authorize URL iki ortamda da AYNI** (`www.pinterest.com/oauth/`).
- **Sandbox ↔ production token'ları geçişsizdir.** Ortam değişince yeniden yetkilendirme + board
  yeniden seçimi şart. Alındığı ortam `app_settings.pinterest_token_env`'e yazılır; `/admin`
  kartı uyuşmazlıkta uyarır.

## OAuth

- Standart OAuth2, **PKCE YOK** (Etsy'den fark). Client kimlikleri `postToken` (`oauth.ts`) içinde
  **HTTP Basic auth header'ında** gönderilir; `buildAuthUrl`/`exchangeCode` bunu yalnızca kullanır.
- Scope'lar `PINTEREST_SCOPES`: `pins:read`, `pins:write`, `boards:read`, **`boards:write`**
  (sonuncusu sandbox'ta board yaratmak için). **Scope değişikliği yeniden yetkilendirme ister.**
- **Ömür:** access 30 gün, refresh 60 gün ama her kullanımda yenilenir (continuous refresh).
  `src/cron/token-refresh.ts` Etsy ile birlikte tazeler (Pinterest kaydı **7 günden** eskiyse;
  Etsy eşiği 3 gün). Yenileme yanıtı `refresh_token` içermeyebilir — `persistTokens` (`client.ts`)
  `refreshToken ?? previousRefreshToken` ile **eldekini KORUR**; null'a çekmek bağlantıyı sessizce
  öldürür. (Etsy'de de aynı koruma var: `persistEtsyTokens`.)

## Board'lar — sandbox'ın tuzağı

**Sandbox board'ları ayrı bir varlık dünyasındadır.** `pinterest.com` arayüzünde elle açtığın board
`api-sandbox`'ta GÖRÜNMEZ: `GET /boards` **200 + boş liste** döner — hata değildir, teşhiste buna
aldanma. Sandbox'ta board yalnızca API ile yaratılır/silinir: `createBoard`, `deleteBoard`,
`listBoards` (`boards.ts`); `/admin` kartındaki "Board oluştur" alanı ve board çiplerinin `×`'i
bunları çağırır. Seçim `app_settings.pinterest_board_id`'de (panelden değişir, redeploy gerekmez);
`PINTEREST_BOARD_ID` env'i yalnızca fallback.

## Timeout — 30 sn, diğerlerinden kısa

`TIMEOUTS.pinterest = 30_000` (`src/lib/async/timeout.ts`). Sebebi: bu çağrılar panel butonlarının
içinde **senkron** bekletilir ve proxy ~60 sn'de kendi **HTML** 504'ünü basar; istemci onu JSON
sanıp `Unexpected token '<'` verir. Bütçe proxy sınırının altında kalmalı; aynı sebeple
`pinterestFetch` ve `postToken` timeout'suz bırakılmaz.

## Upstream hatasında 502/504 DÖNME

Kural: upstream hatası için **424** (`UPSTREAM_FAILED`); DO/Cloudflare origin'in 502/504'ünü kendi
HTML sayfasıyla değiştirir, JSON gövdemiz kaybolur (teşhis: `x-do-orig-status` gerçek kodu taşır).
Kuralı uygulayan tek Pinterest route'u `api/auth/pinterest/boards` — diğerleri upstream'i senkron
beklemiyor (`publish-pinterest` 202 fire-and-forget, `pin-copy` fallback'le 200). Yeni senkron
route eklersen 424 kullan.

## Pin

`createPin` (`pins.ts`) → `POST /v5/pins`: `link` = Etsy listing URL'i, `media_source` = seçilen
mockup'ın public Spaces URL'i (`thumbnailIndex`, yoksa ilk dolu slot; re-upload yok), `alt_text`
Claude'dan, board `app_settings`'ten. Yazma limiti ~100 req/dk (throttle payıyla 90).
**Pin otomatik zincirlenmez:** Etsy listing'i bilerek taslak bırakıldığı için kullanıcı listing'i
Etsy panelinden aktive ettikten sonra `DoneView`'dan elle tetikler — taslağa pin ölü link üretir.

**Pin metni:** `generatePinCopy` (`src/lib/claude/pin-copy.ts`) Etsy SEO'sundan başlık (≤100) +
açıklama (≤500) + alt metin üretir; kullanıcı `DoneView`'daki kapıda düzenleyip onaylar
(`api/pipeline/pin-copy` üretir ve DÖNER, yazmaz/pinlemez; `publish-pinterest` onaylanmış metinle
pinler). Claude patlarsa `fallbackPinCopy` devreye girer — pin kaybedilmez.
