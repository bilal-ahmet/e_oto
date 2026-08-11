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
  Uygulama **Trial access**'te olduğu için `PINTEREST_API_ENV=sandbox` ile çalışıyor ve pinler
  yalnızca hesap sahibine görünüyor.
- **Pinterest Standard access:** başvuru bekliyor. Şart, tek kesintisiz demo videosu (OAuth ekranı
  → token alınması → o token'la gerçek pin oluşturma aynı kayıtta). Onaylanınca production'a
  geçilecek ve **yeniden yetkilendirme + board yeniden seçimi** gerekecek (sandbox ve production
  token'ları geçişsiz). Ayrıntı: `.claude/skills/pinterest-publishing/SKILL.md`.

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
