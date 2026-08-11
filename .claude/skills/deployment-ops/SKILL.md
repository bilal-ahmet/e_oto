---
name: deployment-ops
description: Canlıya alma ve işletim konularında kullan — DigitalOcean App Platform, Dockerfile, migration çalıştırma, Spaces/lokal disk depolama sürücüsü, DB SSL, cron işleri, askıda kalan run kurtarma, health check. Dockerfile, .do/app.yaml, scripts/migrate.ts, src/lib/{storage,db/ssl,env}.ts, src/cron/* ile çalışırken yükle.
---

# Deploy ve işletim

## Depolama sürücüsü

`src/lib/storage/index.ts` — env'e göre iki sürücü, **tek imza**: `putObject`, `readObject`,
`keyFromUrl`. `DO_SPACES_*` beşi de doluysa S3 (Spaces, public-read), değilse `public/uploads/<key>`
(lokal disk, yalnızca dev). **App Platform dosya sistemi ephemeral** — canlıda Spaces zorunlu;
`assertProdEnv` (`src/lib/env.ts`) boot'ta doğrular, eksikleri **adıyla** sayıp fail-fast düşer.
**Tek istisna:** `PUBLIC_BASE_URL` localhost ise (dev'de `next start`) yalnızca uyarır.
`keyFromUrl` hem Spaces hem legacy `/uploads/` URL'ini çözer; eski run'ların URL'leri bozulmasın.

## Veritabanı

- SSL: `src/lib/db/ssl.ts` — `DATABASE_SSL=true` ya da `sslmode=require` → SSL (opsiyonel
  `DATABASE_CA_CERT`). `sslmode` connection string'den **ayıklanır**; bırakılırsa
  pg-connection-string bunu `verify-full` sayıp DO'nun self-signed CA'sıyla
  `SELF_SIGNED_CERT_IN_CHAIN` veriyor.
- Migration: `npm run db:migrate` → `scripts/migrate.ts` (drizzle migrator, kendi SSL'li
  `max: 1` pool'u; drizzle-kit'e bağımlı değil). App Platform'da **PRE_DEPLOY job** olarak koşar,
  yani yeni kod canlıya geçmeden şema hazır olur.
- Yeni migration: `migrations/NNNN_ad.sql` + `migrations/meta/_journal.json` kaydı.
  **Journal'a girmeyen dosya çalışmaz.**

## Docker ve App Platform

- Kök `Dockerfile`: multi-stage, node:22, **tam `node_modules`** (sharp + ffmpeg-static binary'leri
  garanti olsun diye — prune etme, standalone çıktı kullanma). `UV_THREADPOOL_SIZE=8` burada
  sabittir; gerekçesi `.claude/skills/image-pipeline/SKILL.md` madde 5.
- `.do/app.yaml`: web service + migrate job + domain şablonu. Migrate job da **aynı Dockerfile**'ı
  kullanır — node-js buildpack devDependency'leri budayıp `tsx`'i yok ediyor.
- **`instance_count: 1`** — cron ve fire-and-forget adımlar tek süreç varsayar; ölçekleyince
  aynı cron iki kez koşar ve run'lar çakışır.
- **`instance_size_slug: basic-s` (2 GB). 1 GB YETMEZ** — `processing_files` OOM olur
  (ölçüm: `DOCS/mimari.md` §5). Health check: `/api/health`.
- OAuth redirect URI'leri + `PUBLIC_BASE_URL` custom domaine ayarlanır; Etsy ve Pinterest
  developer panellerinde redirect'ler de güncellenir, yoksa callback sessizce kırılır.

## Cron işleri (`src/cron/`, kayıt: `src/instrumentation.ts`)

| Dosya | Ne yapar | Ne zaman |
|---|---|---|
| `recovery.ts` | Askıda kalan run'ları sürdürür (`recoverStalledRuns`) | `*/2 * * * *` + startup; `PIPELINE_RECOVERY_ENABLED=false` ile kapanır |
| `token-refresh.ts` | Etsy + Pinterest token'larını tazeler | `0 4 * * *` + startup |
| `competitor-scan.ts` | Kayıtlı rakip mağazaları yeniden tarar | `0 3 * * *`; **yalnızca** `COMPETITOR_CRON_ENABLED=true` ise kayıtlı, startup koşusu yok |

Token tazeleme eşiği **sağlayıcıya göre farklıdır**: Etsy kaydı 3 günden, Pinterest 7 günden
eskiyse yenilenir (pencereler 90 / 60 gün). Tek eşik varsayma. Hepsi `withAdvisoryLock` altında
çalışır (`db/queries.ts`) — kilit onu alan bağlantıya aittir, farklı client'la unlock sessizce
başarısız olur. Key'ler çakışmaz: recovery 728401, tarama 728402, token 728403.

## Kurtarma davranışı

Sweeper "askıda"yı `updated_at`e bakarak belirler (15 dk) ama önce `isRunActive`'i kontrol eder;
uzun adımlar `withRunLease` + 60 sn heartbeat ile kendini canlı işaretler (yoksa çalışan run'ın
ikinci kopyası başlayıp bellek ikiye katlanıyordu). 5 denemeden sonra run `error`'a çekilir.
`publishToEtsy` `publish_progress` checkpoint'iyle çift listing/çift upload üretmeden sürer —
yeni yayın adımı eklersen checkpoint'ini de ekle.

## Env

Liste `.env.example`'da, doğrulama `src/lib/env.ts` (zod); `.env.local` asla commit edilmez. Yeni
değişkende **üç yeri** güncelle: `.env.example`, `env.ts` şeması, `.do/app.yaml`.
**İstisna — bilinçli:** cron anahtarları (`PIPELINE_RECOVERY_ENABLED`, `COMPETITOR_CRON_ENABLED`)
ve DB SSL anahtarları şemaya girmez, `process.env`'den okunur — şemaya bir erişim TÜM secret'ları
zorunlu kıldığı için dışarıda tutuldular.
