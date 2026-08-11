# CLAUDE.md — Etsy AI Otomasyon

Etsy'de dijital duvar sanatı satan bir mağaza için uçtan uca otomasyon: prompt → görsel
varyasyonlar → SEO → dijital dosyalar + mockup/video → Etsy listing (+ opsiyonel Pinterest pin).
Ayrı modül: rakip mağaza tarama ve fırsat skorlama.

## Bu dosyanın bakım kuralı — yazmadan önce oku

Buraya YALNIZCA koddan okunamayan şeyler yazılır: mimari kararlar, kurallar, gerekçeler.
Klasör yapısı, DB şeması, TypeScript tipleri, env listesi, route listesi ve bağımlılıklar bu
dosyaya **YAZILMAZ** — bunlar kodda yaşar, burada yalnızca *nereye bakılacağı* durur.
Bir alanın ayrıntısı yalnızca o alanda çalışırken gerekiyorsa `.claude/skills/` altına;
olmuş bitmiş bir durum/karar anlatısıysa `DOCS/mimari.md`'ye gider.
Bir bilgiyi iki yere yazma — kopya er ya da geç orijinaliyle çelişir.
Hedef: bu dosya 80 satırı geçmez.

## Değişmez mimari kararlar

- **n8n YOK, ayrı kuyruk (BullMQ/Redis) YOK.** Her şey tek bir Next.js (App Router, TS)
  uygulamasında: panel + API routes bir arada. App Platform Web Service kalıcı süreç olduğu için
  uzun `await` zincirleri sorun değil.
- **3 insan-onay kapısı**: görsel seç → SEO onayla → yayınla. Sistem hiçbir kapıyı kullanıcı
  görmeden geçmez; her kapıda kullanıcı düzenleme/ekleme yapabilir. "Otomatik onayla" kısayolu ekleme.
- **Uzun adımlar arka planda çalışır** (await edilmeden), UI `pipeline/status/[id]`'yi polling eder;
  `awaiting_*` durumları polling'i durdurur.
- **Pahalı işler yalnızca seçilen görsel için**: reddedilen varyasyonlara upscale/medya maliyeti harcanmaz.
- **Ürün tipi farkları (`print` | `tv`) tek yerde**: `src/lib/product/config.ts` → `productConfig()`.
  Ürün-tipi dallanmasını koda saçma; yeni tip = oraya bir kayıt.

## Komutlar

`npm run dev` · `build` · `start` · `lint` · `db:migrate` (`tsx scripts/migrate.ts`, drizzle migrator).
**Test altyapısı yok** — doğrulama lint + gerçek çalıştırma ile yapılır, "testler geçti" deme.
Şema değişikliği: `src/lib/db/schema.ts` + `migrations/NNNN_ad.sql` + `migrations/meta/_journal.json`
kaydı (journal'a girmeyen migration çalışmaz), sonra `npm run db:migrate`.

## Nereye bakılır

**TÜM uygulama kodu `src/` altındadır** (`@/*` → `src/*`).

| Ne | Nerede |
|---|---|
| Domain tipleri, `PRINT_RATIOS`, `PipelineStatus` | `src/types/index.ts` |
| DB şeması / sorgular | `src/lib/db/schema.ts` · `queries.ts` · `migrations/` |
| Env değişkenleri | `.env.example` + `src/lib/env.ts` (doğrulama) |
| API uçları | `src/app/api/**/route.ts` |
| Paneller | `src/app/admin/{generate,drafts,competitors}` |
| Pipeline orkestrasyonu | `src/lib/pipeline/run.ts` |
| Durum etiketleri/sırası | `src/lib/status.ts` |
| Ürün tipi farkları | `src/lib/product/config.ts` |

## Her zaman geçerli kod kuralları

1. **sharp DAİMA `@/lib/image/sharp`'tan** import edilir — `import sharp from 'sharp'` DEĞİL
   (concurrency + cache ayarları orada; libvips varsayılanı konteynerde host çekirdeğini görür).
2. **Büyük görsel işleri sırayla** çalışır; paralelleştirme ölçülmüş OOM demektir.
3. **Her dış çağrı timeout'lu**: `src/lib/async/timeout.ts` → `TIMEOUTS`. Timeout'suz `fetch`/
   `subscribe` bırakma; asılı çağrı adımı sonsuza kadar bekletir.
4. **API route'ları upstream hatası için 502/504 DÖNMEZ → 424.** DigitalOcean/Cloudflare origin'in
   502/504'ünü kendi HTML sayfasıyla değiştirir; JSON gövde kaybolur, panel `Unexpected token '<'`
   verir. (Teşhis: yanıttaki `x-do-orig-status` gerçek kodu taşır.)
5. **Uzun pipeline adımları `withRunLease` altında**; advisory lock daima `withAdvisoryLock` ile
   (kilit onu alan bağlantıya aittir).
6. **Etsy içerikleri İngilizce** üretilir (title/description/tags); kod yorumları ve UI Türkçe.
7. **Token'lar AES-256-GCM ile şifreli** saklanır; anahtar/secret asla commit edilmez.
8. **Next.js sürüm kuralları `AGENTS.md`'de** (üretici tarafından yönetilen blok) — kod yazmadan
   önce oku. O kuralı buraya kopyalama, kopya eskir.

## Alan bilgisi — `.claude/skills/`

| Skill | Ne zaman |
|---|---|
| `etsy-publishing` | Etsy OAuth, taksonomi, öznitelik, listing/medya yükleme |
| `pinterest-publishing` | Pinterest OAuth, sandbox/production, board, pin |
| `image-pipeline` | Varyasyon/referans i2i, taslak, upscale, JPG paketleme, mockup, video, bellek sözleşmesi |
| `seo-content` | Başlık/hook/13 tag/13 materyal, açıklama şablonu, öznitelik seçimi |
| `competitor-research` | Rakip listing SEO analizi + mağaza tarama/skorlama |
| `deployment-ops` | DO App Platform, Docker, migration, depolama sürücüsü, cron/recovery |

## Tarihçe ve planlar

- `DOCS/mimari.md` — proje durumu, alınmış kararların gerekçeleri, `processing_files` çöküşünün
  ölçümleri, **eski CLAUDE.md §N numaralarının karşılık tablosu** (kod yorumlarındaki atıflar için).
- `DOCS/coklu-magaza-plan.md` — çoklu mağaza önerisi. **HENÜZ UYGULANMADI**: kodda `accounts`
  tablosu yok, `oauth_tokens.provider` hâlâ UNIQUE. Buna dayanarak kod yazma.
