# Varyasyon üretimi, referans görsel ve taslaklar

`image-pipeline` skill'inin devamı — kapı 1 öncesi/sırasındaki üretim. Bellek ve kaynak
sözleşmesi için `SKILL.md`'ye bak.

## Model seçimi ve varyasyon sayısı

- Model UI'da seçilir (`imagen` | `flux`); dispatcher `generateImages` (`src/lib/image-gen/index.ts`).
  `POST /api/pipeline/generate` model gelmezse **`flux`** varsayar, `variations` değerini **1-4**
  aralığına kırpar. Mockup + upscale her zaman fal.
- **Varyasyonların ayrı ayrı mı yoksa tek çağrıda mı üretildiği MODA bağlıdır:**

  | Mod | Nasıl | Neden |
  |---|---|---|
  | Referanssız (t2i) | **Tek çağrı**: FLUX `num_images`, Imagen `numberOfImages` | Batch yeterince çeşitli çıkıyor, çağrı başına maliyet düşük |
  | Referanslı (i2i) | **Her varyasyon ayrı çağrı**, her biri kendi rastgele seed'iyle (`generateFromReference`, `flux/client.ts`) | Kontext'te tek seed'li batch neredeyse aynı çıktıyı verir; ayrıca `Promise.allSettled` ile biri patlarsa diğerleri korunur |

  Bu ayrımı silme: "hepsi ayrı çağrı" diye genellemek t2i'yi 4 kat pahalılaştırır.

## Referans görsel = gerçek image-to-image

- Görsel depodan okunur, `fal.storage`'a yüklenir ve `fal-ai/flux-pro/kontext`'e `image_url`
  olarak verilir (`generateVariations`, `pipeline/run.ts`).
- Imagen görsel girdisi kabul etmediğinden referans modunda otomatik FLUX'a düşülür ve run'a
  `imageModel:'flux'` yazılır (UI'da gerçekte kullanılan model görünsün diye).
- Referans varken `FAL_KEY` **zorunlu** — yoksa net hata verilir, sessizce metin moduna düşülmez.
- **Telif riski prompt'la yönetilir**: `generateTransformationInstruction`
  (`src/lib/claude/vision.ts`) referansı Claude Vision'a okutup kompozisyonu koruyan ama
  şekil/renk/bakış açısını somut biçimde DEĞİŞTİREN bir düzenleme talimatı yazar; logo/imza/marka
  öğelerinin çıkarılmasını şart koşar. Model olarak Sonnet kullanılır (SEO Opus'tadır).

## Taslaklar (drafts)

`POST /api/drafts` iki modda taslak kaydeder: mevcut bir varyasyonu kopyalar (`variationUrl`) ya da
dışarıdan yüklenen görseli alır (`upload.base64` + `mediaType`); her ikisi de `drafts/<uuid>.<ext>`
altına yazılır ve run'dan bağımsız yaşar (`image_drafts` tablosu).

`POST /api/pipeline/from-draft` taslaktan run başlatır: **kapı 1 atlanır**, taslak seçilmiş görsel
sayılıp doğrudan `selectImageForRun` ile SEO üretimine (kapı 2) geçilir.
