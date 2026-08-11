---
name: image-pipeline
description: Görsel üretim ve işleme hattında çalışırken kullan — varyasyon üretimi (Imagen/FLUX), referans görselle image-to-image, taslak, upscale, JPG paketleme, mockup, zoom video. processing_files adımının bellek/kaynak sözleşmesini içerir. src/lib/{pipeline,packaging,image,mockup,video,upscale,flux,imagen,image-gen,product}/* dosyalarına dokunulduğunda yükle.
---

# Görsel hattı

Orkestrasyon: `src/lib/pipeline/run.ts` · Ürün farkları: `src/lib/product/config.ts`
Varyasyon üretimi, referans görsel ve taslaklar: **`variations-and-drafts.md`** (aynı klasör).

## processing_files — bozulmaması gereken kaynak sözleşmesi

Bu adım canlıda OOM'a ve bitmeyen run döngüsüne yol açmıştı; nedenler **ölçülerek** giderildi
(rakamlar: `DOCS/mimari.md` §5). Değiştirmeden önce oraya bak.

1. **Yerel görsel işleri (sharp/ffmpeg) SIRAYLA çalışır.** `packageJpegs` oranları `Promise.all`
   ile işliyordu: 5 × ~77 MP → tepe RSS 1823 MB (instance 1 GB) → OOM. Seri hâlde 204 MB.
2. **Kuralın sınırı: 1. madde yalnızca BU süreçte bellek tutan işler içindir.** Uzak API çağrıları
   paralel kalır — `generateAllMockups` (`mockup/client.ts`) 8 fal sahnesini `Promise.all` ile atar;
   oradaki maliyet fal tarafında, bizde yalnızca inen JPEG'ler. Seri hale getirmek adımı ~8 kat
   uzatır ve hiç bellek kazandırmaz. İki gerekçe farklı; birini diğerine bakarak "düzeltme".
3. **mozjpeg KULLANILMAZ** (`resize-and-export.ts:69` `mozjpeg: false`) — tüm görüntünün katsayı
   tablosunu bellekte tutar (611 MB ↔ baseline 173 MB). 20 MB tavanının çok altındayız;
   `{ mozjpeg:false, progressive:false, optimiseCoding:false }` kalmalı.
4. **sharp DAİMA `@/lib/image/sharp`'tan import edilir**, `import sharp from 'sharp'` değil.
   Orada `concurrency` (`SHARP_CONCURRENCY`, varsayılan 1) + `cache(false)` uygulanır; libvips
   varsayılanı konteynerde HOST çekirdek sayısını görür.
5. **`UV_THREADPOOL_SIZE=8`** Dockerfile'da sabittir. sharp libuv havuzunu tutar ve `dns.lookup`
   de aynı havuzdadır — havuz doluyken DNS 4 ms yerine 28.6 s sürdü ve her yeni DB/Spaces/fal/Etsy
   bağlantısı, dolayısıyla status endpoint'i kilitlendi.
6. **Üretilen dosyalar biriktirilmez** — `packageJpegs(master, specs, jpeg, onFile)` her JPG'yi
   üretir üretmez `onFile` ile dışarı verir; aynı anda bellekte tek çıktı bulunur.
7. **Her dış çağrının timeout'u vardır** (`src/lib/async/timeout.ts` → `TIMEOUTS`). fal `subscribe`
   timeout'suzken asılı kalıp adımı sonsuza kadar bekletiyordu.
8. **Uzun adımlar `withRunLease` altında** (`pipeline/run.ts`). Sweeper "askıda"yı `updated_at`e
   bakarak belirlediğinden çalışan run'ın ikinci kopyasını başlatıp belleği ikiye katlıyordu; kira
   + 60 sn heartbeat bunu keser. `regenerateMockup` **bilerek kirasızdır** — run `awaiting_publish`
   te kalır, sweeper dokunmaz.
9. **Advisory lock `withAdvisoryLock` ile alınır** (`src/lib/db/queries.ts`) — kilit onu alan
   bağlantıya aittir; farklı bir client'la unlock sessizce başarısız olup kilidi sızdırır.

## Ürün tipi — tek kaynak `productConfig()`

`productConfig(run.productType)` (`product/config.ts`) `print` | `tv` arasındaki TÜM farkı verir:
üretim oranı, dosya listesi, JPG ayarları, video boyutu, ölçü görseli, mockup sahneleri.
**Ürün-tipi dallanmasını koda saçma** — yeni tip = buraya bir kayıt.

| | print | tv (Frame TV) |
|---|---|---|
| Üretim oranı | 3:4 | 16:9 |
| Dosyalar | 5 JPG, `PRINT_RATIOS` en büyük boyutlar (7200×10800 vb.) | 2 JPG: 3840×2160 + 1920×1080 |
| JPG | 300 DPI, **q90, 4:2:0** | 300 DPI, **q97, 4:4:4** |
| Ölçü görseli | var | yok |

- **DPI her tipte 300**: ekran ürününde teknik olarak önemsiz ama dosya özelliklerinde "72 DPI"
  görünmesi alıcıda düşük kalite izlenimi yaratıyor.
- Print'teki q90/4:2:0 **ölçülmüş bellek sözleşmesinin parçası** (77 MP dosyalar) — yükseltmeden
  önce 1. ve 3. maddeleri oku. TV dosyaları 8.3 MP olduğu için kalite yukarı çekilebildi.
- Her JPG <20 MB; aşarsa kalite %5'er düşer, zemin %60 (`resize-and-export.ts`). ZIP YOK.

## Medya üretimi

`approveSeoAndProcess` (`pipeline/run.ts`): upscale (fal clarity-upscaler ×4, creativity 0.3) →
master; sonra 8 mockup (`generateAllMockups`, flux-kontext i2i), 1 zoom video (`makeZoomVideo`,
ffmpeg-static — sistem ffmpeg gerektirmez), 1 sabit ölçü görseli (`getSizeGuide`:
`public/templates/size-guide.*`, 2000px JPEG'e normalize edilip süreç boyunca cache'lenir).
**fal kredisi yoksa run DÜŞMEZ**: upscale pass-through (`upscale/client.ts`), mockup'lar boş slot
kalır ve gate 3'te tek tek yeniden üretilir. Ham sanat görseli Etsy'ye display olarak yüklenmez.
