# Mimari Tarihçesi ve Durum

Bu dosya **olmuş bitmiş** şeyleri tutar: hangi karar neden alındı, hangi sorun nasıl ölçüldü,
proje hangi noktada. Uyulması gereken kurallar burada DEĞİL — onlar `CLAUDE.md` (her zaman
geçerli) ve `.claude/skills/` (alan bazlı) altında yaşar.

Son güncelleme: 2026-08-12 (CLAUDE.md'nin bölünmesi sırasında yazıldı).

---

## 1. Eski CLAUDE.md bölüm numaralarının karşılığı

Kod tabanında 28 yorum satırı `CLAUDE.md §N` diye atıf yapıyor (ör.
`src/lib/etsy/client.ts:2` → "§8, §10"). CLAUDE.md bölündüğü için o numaralar artık
CLAUDE.md'de yok; karşılıkları:

| Eski § | Konu | Yeni yer |
|---|---|---|
| §1 | Proje özeti, 3 onay kapısı | `CLAUDE.md` (Ne yapar / Değişmez mimari kararlar) |
| §2 | Teknoloji yığını | `package.json` + ilgili skill |
| §3 | Klasör ağacı | Silindi — kod tabanı (`src/`) |
| §4 | DB şeması | Silindi — `src/lib/db/schema.ts` + `migrations/` |
| §5 | Env listesi | Silindi — `.env.example` + `src/lib/env.ts` |
| §6 | Tipler | Silindi — `src/types/index.ts` |
| §7 | Pipeline akışı | `CLAUDE.md` (kararlar) + `.claude/skills/image-pipeline/` |
| §8 | Etsy & Pinterest entegrasyonu | `.claude/skills/etsy-publishing/`, `.claude/skills/pinterest-publishing/` |
| §9 | Rakip analizi algoritması | `.claude/skills/competitor-research/` |
| §10 | Önemli kurallar | Parçalandı: kalıcı olanlar `CLAUDE.md`, alan bazlı olanlar ilgili skill |
| §11 | Sprint 0 + canlıya alma + kaynak sınırları | Bu dosya (tarihçe) + `.claude/skills/deployment-ops/` + `.claude/skills/image-pipeline/` |
| §12 | `Etsy_AI_Otomasyon_Raporu_v3_KodOnly.docx` | Silindi — dosya repo'da yok |

---

## 2. Mevcut durum (canlı doğrulandı)

- **Çalışıyor:** Imagen + FLUX görsel üretimi, Claude SEO, 5 JPG paketleme, Etsy OAuth + yayın.
- **Upscale:** fal kredisi yoksa pass-through (run düşmez, master orijinal çözünürlükte kalır).
- **Pinterest:** kod tarafı TAMAM (OAuth + board seçimi/yaratma + Claude pin metni + pin atma).
  Trial access'te `PINTEREST_API_ENV=sandbox` ile çalışıyordu (pinler yalnızca hesap sahibine
  görünürdü).
- **Pinterest Standard access:** **onaylandı** (2026-10-13). `.do/app.yaml`'da
  `PINTEREST_API_ENV=production` yapıldı. Deploy sonrası **yeniden yetkilendirme + board yeniden
  seçimi** gerekir (sandbox ve production token'ları geçişsiz) — canlıda yapıldı mı, bu satırı
  güncelle. Ayrıntı: `.claude/skills/pinterest-publishing/SKILL.md`.

## 3. Sprint 0 — tamamlandı

Planlanan sıra şuydu ve bu sırayla yürüdü: (1) Next.js + `types/index.ts` + mock'lu UI,
(2) DO Managed PostgreSQL + Spaces + şema migration'ları, (3) Imagen ile minimal
`/api/pipeline/generate`, (4) `lib/claude/seo.ts`, (5) Etsy + Pinterest developer app'leri ve
OAuth akışlarının yerelde testi, (6) adım route'larında birleştirme.

"Önce tipleri ve mock data'yı yaz, UI'yi onunla geliştir, sonra gerçek API'lere bağla"
alışkanlığı buradan geliyor — `src/types/index.ts` hâlâ tek domain kaynağı.

## 4. Canlıya alma (DigitalOcean) — neler eklendi

- **Depolama** (`src/lib/storage/index.ts`): env-seçmeli sürücü. `DO_SPACES_*` tamsa S3
  (Spaces, public-read), değilse lokal disk (dev). İmzalar sabit tutuldu ki çağıran kod
  değişmesin. `keyFromUrl` hem Spaces hem legacy `/uploads/` URL'ini çözer.
- **DB SSL** (`src/lib/db/ssl.ts`): `DATABASE_SSL=true` ya da `sslmode=require` → SSL.
  `sslmode` connection string'den ayıklanır, aksi halde pg-connection-string bunu `verify-full`
  sayıp DO'nun self-signed CA'sıyla `SELF_SIGNED_CERT_IN_CHAIN` veriyordu.
- **Migration runner** (`scripts/migrate.ts`): App Platform PRE_DEPLOY job'ı çalıştırır.
- **Pipeline dayanıklılığı**: adımlar idempotent/resume edilebilir; `publishToEtsy`
  `publish_progress` checkpoint'i ile çift-listing/çift-upload olmadan sürdürülür.
  `src/lib/pipeline/recovery.ts` + `src/cron/recovery.ts` (her 2 dk + startup) askıda kalan
  run'ları PG advisory lock ile devralır. `src/instrumentation.ts` boot'ta env fail-fast yapar.
- **Docker**: kök `Dockerfile` (multi-stage, node:22, tam `node_modules` → sharp/ffmpeg-static
  garanti), `.dockerignore`, `/api/health`. `.do/app.yaml` app spec şablonu.

---

## 5. `processing_files` çöküşü — kök neden ölçümleri

Canlıda `/api/pipeline/status` 504/524 veriyordu ve run hiç bitmeyen bir döngüye giriyordu.
Kök nedenler ölçülerek bulundu. **Kuralların kendisi
`.claude/skills/image-pipeline/SKILL.md`'de**; buradaki rakamlar o kuralların *neden* pazarlık
konusu olmadığını gösterir.

| Bulgu | Ölçüm |
|---|---|
| `packageJpegs` 5 oranı `Promise.all` ile paralel işliyordu | 5 × ~77 MP pipeline → tepe RSS **1823 MB** (instance 1 GB) → OOM. Seri hâlde **204 MB**. |
| mozjpeg tüm görüntünün katsayı tablosunu bellekte tutuyor | 7200×10800: mozjpeg 6.0 MB / 12.5 s / **611 MB RSS** ↔ baseline libjpeg 7.1 MB / 5.1 s / **173 MB RSS**. 20 MB tavanının çok altında olduğumuz için baseline seçildi. |
| libvips varsayılan concurrency konteynerde HOST çekirdek sayısını görüyor | `src/lib/image/sharp.ts` `concurrency` (varsayılan 1) + `cache(false)` uygular. |
| sharp libuv havuzunu doldurunca `dns.lookup` de aynı havuzda bekliyor | DNS çözümü 4 ms yerine **28.6 s** sürdü → her yeni DB/Spaces/fal/Etsy bağlantısı, dolayısıyla status endpoint'i kilitlendi. Çözüm: `UV_THREADPOOL_SIZE=8` (Dockerfile'da sabit). |
| fal `subscribe` timeout'suzdu | Asılı kalan çağrı adımı sonsuza kadar bekletiyordu → `src/lib/async/timeout.ts` `TIMEOUTS`. |
| Kurtarma sweeper'ı "askıda"yı yalnızca `updated_at`e bakarak belirliyordu | Hâlâ çalışan bir run'ın İKİNCİ kopyasını başlatıp belleği ikiye katlıyordu → `withRunLease` + 60 sn heartbeat, `recovery.ts` `isRunActive` kontrolü. |
| Advisory lock havuzdan farklı bir client'la unlock ediliyordu | Unlock sessizce başarısız olup kilidi sızdırıyordu → `withAdvisoryLock` (`src/lib/db/queries.ts:328`) kilidi alan bağlantıda tutar. |

Deploy sonucu: `instance_size_slug: basic-s` (2 GB). **1 GB yetmiyor.**
`instance_count: 1` — cron ve fire-and-forget adımlar tek süreç varsayıyor.

---

## 6. Güvenilirlik ve ölçülebilirlik turu (Velora notu, 2026-11)

Kaynak: mağaza sahibinin 31 Eki 2026 tarihli iyileştirme notu (panel gözlemlerine dayalı).
Kod incelemesinde zaten var olanlar: iki tarihsel Etsy 400'ü (`all_caps`, `materials
invalid_characters`) 15 Eki'de `text-rules.ts` ile giderilmişti; hat **mevcut ilanları
güncellemez** (yalnız kendi açtığı taslağa yazar), ilanı aktif yapmaz; 400'ler otomatik tekrar
denenmez. Bu turda alınan kararlar:

| Karar | Gerekçe | Nerede |
|---|---|---|
| Kullanıcı reddi = `rejected` durumu (teknik hata değil). Eski kayıtlar (`error` + red mesajı) DB'de **değiştirilmeden** gösterimde/sayaçta `rejected` sayılır | 65 "hata"nın 63'ü red idi; sistem sağlığı yanlış okunuyordu. Geçmişi yeniden yazmamak istendi | `lib/status.ts` `displayStatus`, `queries.pipelineRunStatusCounts` |
| Etsy listing'i olan run reddedilemez | Red, Etsy'deki taslağı panelden görünmez kılıyordu | `api/pipeline/reject` |
| Teknik hata = mesaj + `error_stage` + `error_kind` (validation/auth/rate_limit/transient/internal) | "Ne yapmalıyım" sorusu cevapsızdı; 400 ile zaman aşımı ayırt edilemiyordu | `lib/errors.ts`, `run.ts fail()` |
| "Aktif ilan" sayısı `done`'a değil, Etsy'den **salt okunur** geri okunan duruma dayanır; okunamayan "doğrulanmadı" sayılır | `done` = taslak aktarıldı; panel sayısı canlı envanter sanılıyordu | `lib/pipeline/listing-state.ts`, `api/pipeline/etsy-state` |
| Gönderim öncesi alan doğrulaması: düzeltilebilen sessizce düzeltilir (`toEtsySafe`), düzeltilemeyen (uzunluk, adet, fiziksel materyal, AI beyanı) gate 2'de onayı ve yayını **engeller** | Etsy 400'ü ücretli üretimden sonra geliyordu; aynı içerikle tekrar işe yaramaz | `text-rules.validateListingSeo` |
| Materyaller 13 kalır ama hepsi teslim edilen dijital ürünü tanımlar; boşluk ürün tipinin doğru terim havuzundan doldurulur | Fiziksel kâğıt/tuval/PDF etiketleri teslim edilmeyen şeyi vaat ediyordu | `product/config.materialPool`, `claude/seo.ts` |
| Açıklamada AI beyanı zorunlu (iki şablonda da) | Mağaza sahibi tüm ürünlerin AI ile üretildiğini doğruladı; Etsy politikası. Etsy'nin "With an AI generator" üretim yöntemi alanı **API şemasında bulunamadı** (createDraftListing OAS, 2026-11) — API'den ayarlanmıyor, Etsy panelinden elle seçilir | `listing/description.ts` |
| Paketlenen her dosya piksel/oran (addan değil pikselden), 20 MB ve SHA-256 tekilliği açısından doğrulanır; adet spec ile birebir | Mağazada "5x7" adlı ama 4:5 içerikli (aynı hash) dosya bulundu | `packaging/validate.ts` |
| Pin yalnız Etsy'de **aktif** okunan ilana atılır (fail-closed); `POST /pins` öncesi `pin_attempted_at` yazılır, sonuç belirsizse panoda mutabakat yapılır, kör tekrar yok | Taslak ilana pin = ölü link; Pinterest idempotency'si varsayılmaz | `run.publishToPinterest`, `pinterest/pins.findPinForListing` |
| Bağlantı durumu = son salt okunur API kontrolü (TSİ zamanıyla); refresh `invalid_grant` → `*_reauth_required` bayrağı, tekrar denenmez | Panelde görünen "geçerlilik" 1 saatlik erişim anahtarıydı (arıza değil); "bağlı" tek başına kanıt değildi | `lib/connection/health.ts` |

**P2 olarak bırakılanlar (uygulanmadı):** 429 `Retry-After` ile sınırlı tekrar; `createDraftListing`
zaman aşımında çift taslak mutabakatı (checkpoint + `GET /shops/{id}/listings?state=draft`);
varyasyon sayısı/model/maliyet kaydı (gerçek maliyet API'den alınamıyorsa tahmin yazılmaz).

İzleme: `npm run etsy:snapshot -- <id…>` salt okunur anlık görüntü alır (`snapshots/`, gitignore);
iki görüntü `diff` ile karşılaştırılır. Çevrimdışı kural kontrolü: `npm run check:rules`.

---

## 7. fal.ai maliyet turu (2026-11-03)

Kullanıcı beklentisinden fazla ödeme şüphesiyle incelendi. Liste fiyatları:
- clarity-upscaler: ÇIKTI megapikseli başına $0.03.
- flux-pro/kontext (varyasyon, mockup): görsel başına $0.04.

Yayına giden bir FLUX baskı run'ı tahminen ≈ $0.98 tutar:

| Kalem | Tutar |
|---|---|
| 3 varyasyon | $0.12 |
| ×4 upscale | $0.50 |
| 8 mockup | $0.32 |
| Claude SEO | ~$0.04 |

| Karar | Gerekçe | Nerede |
|---|---|---|
| Upscale oranı hedef dosya boyutuna + `UPSCALE_MAX_OUTPUT_MP` (17) tavanına göre; ×2 bile tavanı aşıyorsa AI upscale atlanır | Her girdi ×4'tü; büyük taslak yüklemesi tek upscale'de $3–10 tutabiliyordu. FLUX baskıda kalite/maliyet değişmedi | `upscale/plan.ts` |
| Master URL'i upscale'den HEMEN sonra kaydedilir | Paketleme (OOM'a yatkın) çökünce kurtarma her denemede upscale'i yeniden ödüyordu | `run.ts approveSeoAndProcess` |
| Mockup'lar tek tek kaydedilir; parti yarıda kaldıysa yalnız boş slotlar üretilir (`mockupsStarted/Complete`) | 8'i topluca yazılıyordu; yarıda çökme 8'ini de yeniden ödetiyordu | `run.ts` |
| Zaman aşımında fal işi `queue.cancel` ile iptal edilir (en iyi çaba) | Beklemeyi bırakmak işi durdurmuyordu; iş faturalanıyor, kullanıcı tekrar tetikliyordu | `lib/fal/index.ts` |
| Mockup yeniden üretiminde slot kilidi + taze okuma | Çift tık iki kez ödeniyordu; eşzamanlı iki slotta biri diğerinin sonucunu siliyordu | `run.ts regenerateMockup` |
| Her fal çağrısı `pipeline_runs.usage`'a yazılır (liste fiyatından TAHMİN, etiketli) | Hangi run'ın ne harcadığı bilinmiyordu | `cost/prices.ts`, migration 0013 |

Gerçek fatura: `npm run fal:usage` (fal kullanım API'si, `FAL_BILLING_KEY` gerekir — üretim `FAL_KEY`'i 403 döner).
Önerilen ama uygulanmayanlar:
- Real-ESRGAN (~1–2 sent/upscale, kalite testi gerekir).
- Mockup sayısını azaltmak.
- Claude'u `claude-opus-5-5`'e geçirmek (run başına birkaç sent).
