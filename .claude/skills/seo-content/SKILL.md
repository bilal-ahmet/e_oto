---
name: seo-content
description: Etsy listing metinleri üretilirken/değiştirilirken kullan — başlık, hook, PERFECT FOR, 13 tag, 13 materyal, açıklama şablonu, öznitelik seçimi, dil kuralı. src/lib/claude/{seo,vision,competitor-seo}.ts veya src/lib/listing/description.ts dosyalarına dokunulduğunda yükle.
---

# SEO içeriği

Üretim: `generateSeo` (`src/lib/claude/seo.ts`) · Açıklama birleştirme:
`src/lib/listing/description.ts` · Şema: `SeoData` (`src/types/index.ts`).

## Dil

Etsy içerikleri (title, hook, description, tags, materials) **İngilizce** üretilir — ana pazar
İngilizce. Kod yorumları/UI Türkçe. Varsayım değişirse CLAUDE.md'deki kuralı da güncelle.

## Alan kuralları (kodda zorlanır — prompt'a güvenilmez)

Zorlama `generateSeo`'nun dönüş nesnesinde uygulanır; Claude kaçırsa da Etsy'ye giden veri uyar.

| Alan | Kural | Zorlama |
|---|---|---|
| `title` | Ana anahtar kelimeyle BAŞLAR, ~140 karaktere kadar, ` \| ` ile keyword öbekleri ayrılır; ilk iki harfi büyük kelime (TV, HD, JPG) **≤3** (Etsy `all_caps`) | `fixTitleCaps` + `slice(0, 140)` |
| `hook` | 2-3 cümle açılış; açıklamanın ilk paragrafı olur | — (yalnızca prompt) |
| `perfectFor` | 3-5 stil/mekân/vesile kelimesi | `exactly()` ile 3-5 aralığına kırpılır/doldurulur |
| `tags` | **TAM 13**, her biri **≤20 karakter**; yalnızca harf/rakam/boşluk/`- ' ™ © ®` | `sanitizeTag` + tekilleştir → `exactly(..., 13)` |
| `materials` | **TAM 13**, her biri teslim edilen **dijital** ürünü doğru tanımlar (dosya türü, teslim, renk modu, çözünürlük, oran); fiziksel malzeme (canvas, paper, ink, frame, PDF…) YASAK; yalnızca harf/rakam/boşluk (Etsy `invalid_characters`) | `sanitizeMaterial` + `isPhysicalMaterial` filtresi → `accurateMaterials`: eksik kalan ürün tipinin `productConfig().materialPool`'undan (kullanılmamışlarla) tamamlanır — aynı terim tekrarlanmaz |
| `categoryId` | Üretimde BOŞ bırakılır | Yayında Digital Prints taksonomi id'siyle doldurulur |
| `attributes` | Orientation/Style/Occasion/Room/Subject | Taksonomi eşlemesi Etsy tarafında |

Etsy karakter/büyük harf kuralları `src/lib/etsy/text-rules.ts`'te tek yerde; `createDraftListing`
`toEtsySafe` ile yayında tekrar uygular (gate 2 elle düzenleme için güvenlik ağı).
Başlıkta `% : & +` her biri **en fazla bir kez** (Etsy OAS); fazlası `fixTitleSymbols` ile çevrilir.
**Düzeltilemeyen** ihlaller (başlık >140, >13 etiket/materyal, fiziksel materyal, AI beyanı eksik)
`validateListingSeo` ile alan+sebep döner ve **onayı engeller**: `SeoEditor` butonu kapatır,
`approve-seo` 422 döner, `publishToEtsy` Etsy'ye istek atmadan durur. Sessizce kırpma/üstüne yazma YOK.
`exactly()` eksikse doldurur, fazlaysa keser. Bu sayıları değiştirirken hem prompt'u hem `exactly`
çağrısını güncelle.

## Açıklama = Claude + sabit gövde

Claude yalnızca **HOOK** ve **PERFECT FOR** üretir; gerisi koddan birleştirilir —
`buildPrintDescription` / `buildTvDescription`, seçim `buildDescriptionFor` (`description.ts`).
Boyut listesi `PRINT_RATIOS`'tan türetilir (`sizeLines`) — elle yazma. Dosya **adedi ve pikselleri**
de `productConfig().files`'tan gelir (sabit "5 dosya / 4K" yazma); ekran dosyalarında DPI yazılmaz.
**AI beyanı (`AI_DISCLOSURE_TEXT`) iki şablonda da "HOW THIS WAS MADE" altında zorunludur.**

Sabit bölümler **ürün tipine göre farklıdır**, ortak olanları varsayma:

| print | tv (Frame TV) |
|---|---|
| WHAT YOU'LL RECEIVE (5 dosya + 300 DPI + oran/alt boyut listesi) | WHAT YOU'LL RECEIVE (4K + Full HD) + "SCREEN USE ONLY" uyarısı |
| HOW TO DOWNLOAD | HOW TO DOWNLOAD |
| **HOW TO PRINT** | **HOW TO DISPLAY ON YOUR FRAME TV** (SmartThings adımları) |
| PLEASE NOTE · **HOW THIS WAS MADE** (AI) · TERMS (© `ETSY_SHOP_NAME`) | PLEASE NOTE (all sales final) · **HOW THIS WAS MADE** (AI) · TERMS |

Ürün tipi ayrıntısı: `.claude/skills/image-pipeline/SKILL.md`.

## Öznitelikler

Style/Occasion/Room/Subject'i Claude seçer; izinli değer listesi verilmişse oradan **tam yazımla**
seçmesi istenir. Orientation'ı Claude da yazar ama **görselin gerçek oranı kazanır**:
`approveSeoAndProcess` master metadata'sından hesaplayıp üzerine yazar (resume'da da aynı sonuç).
Yayında değerler taksonomiye eşlenir: **önce tam ad, tutmazsa substring**; eşleşmeyen atlanır ve
yayın düşmez — bkz. `.claude/skills/etsy-publishing/SKILL.md`.

## Rakip referansı (opsiyonel)

Run bir rakip analizine bağlıysa `generateSeo` `competitorRef` alır (`competitorInstruction`):
Claude'a "aynı arama niyetini hedefle, başlığın keyword yerleşimini taklit et, ama **ÖZGÜN** ifade
üret — kopyalama; keyword'leri yalnızca gerçekten görseldeki işe uyduğu yerde kullan" denir.
Görsele sadakat rakip keyword'lerinin önündedir. Taksonomi yine default Digital Prints.
Analiz tarafı: `.claude/skills/competitor-research/SKILL.md`.

## Onay kapısı

SEO çıktısı doğrudan yayına gitmez — kullanıcı gate 2'de düzenler/ekler ve onaylar
(`api/pipeline/approve-seo`). Buraya "otomatik onayla" kısayolu ekleme.
