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

## Referans görsel: önce prompt, sonra (isteğe bağlı) image-to-image

İki ayrı kullanım, panelde ayrı kontrol edilir:

1. **Prompt üretici** (her zaman): `generateThemePrompts` (`src/lib/claude/vision.ts`,
   `api/instruction/generate`) referansı Claude Vision'a (`claude-opus-5-5`, effort high, sunucu
   tarafı ret yedeği `claude-opus-4-8`) okutur ve yapılandırılmış çıktı döner:
   - `referencePrompt`: tek başına kullanılabilir sahne tarifi. Sıra: teknik → özne/duruş → mekân →
     konumlu yardımcı öğeler → ön/arka plan → ışık → palet → doku/duygu → format satırı →
     "No text, no signatures, no watermarks."
   - 2 tema varyantı: özne, duruş, kompozisyon ve teknik KORUNUR; ışık/günün saati, palet, eşlik eden
     öğe ve atmosfer DEĞİŞİR. Sistem promptundaki örnek çift kullanıcının sohbette iyi sonuç aldığı
     akıştan alındı; yapı ve değişim derecesi içindir, konu için değil.
   - Logo/marka/imza/sanatçı adı yazılmaz. Görsel üretmez; yalnız Claude çağrısıdır.
2. **Referansı üretime dahil et** (kutu, varsayılan KAPALI — kullanıcı kararı): yalnız açıkken
   görsel depodan okunur, `fal.storage`'a yüklenir ve `fal-ai/flux-pro/kontext`'e `image_url` olarak
   verilir (`generateVariations`, `pipeline/run.ts`). Kapalıyken referans üretime GİTMEZ; seçili model
   metinden üretir (kopya riski en düşük — rakipten otomatik yüklenen referansta önemli).
   - Imagen görsel girdisi kabul etmediğinden i2i modunda otomatik FLUX'a düşülür ve run'a
     `imageModel:'flux'` yazılır. Bu modda `FAL_KEY` **zorunlu** — yoksa net hata verilir.

## Taslaklar (drafts)

`POST /api/drafts` iki modda taslak kaydeder: mevcut bir varyasyonu kopyalar (`variationUrl`) ya da
dışarıdan yüklenen görseli alır (`upload.base64` + `mediaType`); her ikisi de `drafts/<uuid>.<ext>`
altına yazılır ve run'dan bağımsız yaşar (`image_drafts` tablosu).

`POST /api/pipeline/from-draft` taslaktan run başlatır: **kapı 1 atlanır**, taslak seçilmiş görsel
sayılıp doğrudan `selectImageForRun` ile SEO üretimine (kapı 2) geçilir.
