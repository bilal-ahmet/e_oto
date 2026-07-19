// Etsy AI Otomasyon — domain tipleri
// CLAUDE.md §6 ile uyumlu. UI mock-first geliştirildiği için backend tipleri de buradan türetilir.

export type PipelineStatus =
  | 'queued'
  | 'generating_image'
  | 'awaiting_approval' // varyasyonlardan görsel seçimi (insan onayı #1)
  | 'generating_seo'
  | 'awaiting_seo_approval' // SEO inceleme/düzenleme (insan onayı #2)
  | 'processing_files' // upscale + 5 JPG + 8 mockup + video + ölçü görseli
  | 'awaiting_publish' // medya + dosyalar hazır, Etsy yayını onayı (insan onayı #3)
  | 'publishing_etsy'
  | 'publishing_pinterest'
  | 'done'
  | 'error';

/** Görsel üretim modeli — UI'da seçilir, ilgili API'ye istek atılır. */
export type ImageModel = 'imagen' | 'flux';

/**
 * Dijital ürün dosyaları (CLAUDE.md §1, §7, §10): oran başına TEK JPG, o oranın EN BÜYÜK boyutunda,
 * 300 DPI. Müşteri açıklamadaki alt boyutları baskıcıda küçülterek alır. 5 oran = 5 JPG (Etsy 5-dosya).
 * Boyutlar 300 DPI piksel (inç × 300). `key` aynı zamanda digitalFileUrls anahtarıdır.
 * Açıklamada listelenen alt boyutlar `subSizes` (yalnızca metin amaçlı).
 */
export const PRINT_RATIOS = [
  { key: 'ratio_2x3', label: '2:3', fileName: 'ratio-2x3-24x36.jpg', width: 7200, height: 10800,
    subSizes: ['4x6', '8x12', '12x18', '16x24', '20x30', '24x36'] },
  { key: 'ratio_3x4', label: '3:4', fileName: 'ratio-3x4-24x32.jpg', width: 7200, height: 9600,
    subSizes: ['6x8', '9x12', '12x16', '15x20', '18x24', '24x32'] },
  { key: 'ratio_4x5', label: '4:5', fileName: 'ratio-4x5-24x30.jpg', width: 7200, height: 9000,
    subSizes: ['4x5', '8x10', '12x15', '16x20', '24x30'] },
  { key: 'ratio_11x14', label: '11:14', fileName: 'ratio-11x14-22x28.jpg', width: 6600, height: 8400,
    subSizes: ['11x14', '22x28'] },
  { key: 'ratio_5x7', label: '5:7', fileName: 'ratio-5x7-25x35.jpg', width: 7500, height: 10500,
    subSizes: ['5x7', '10x14', '15x21', '20x28', '25x35', 'A1', 'A2', 'A3', 'A4', 'A5'] },
] as const;

export type RatioKey = (typeof PRINT_RATIOS)[number]['key'];

/** processing_files çıktısı: her oran için JPG'nin public URL'i. */
export type DigitalFileUrls = Partial<Record<RatioKey, string>>;

/** Etsy'ye yüklenecek tanıtım medyası (8 mockup + 1 video + 1 ölçü görseli). */
export interface MediaUrls {
  mockups: string[]; // 8 sahne mockup'ı (fal flux-kontext); boş slot olabilir
  video?: string; // zoom mp4 (ffmpeg)
  sizeGuide?: string; // sabit ölçü görseli
}

/** Etsy listing öznitelikleri (taksonomi property'lerinden seçilir). */
export interface ListingAttributes {
  orientation: string; // Vertical | Horizontal | Square (oran'dan kesin)
  style: string; // Home/Decor style
  occasion: string;
  room: string;
  subject: string;
}

export interface SeoData {
  title: string; // hook stratejisi: ana anahtar kelimeyle başlar, ~140 karakter
  hook: string; // 2-3 cümle ürün-özel açılış (açıklamanın başı)
  perfectFor: string[]; // 3-5 stil/mekân/vesile anahtar kelimesi
  tags: string[]; // tam 13 adet, her biri <=20 karakter
  description: string; // koddan birleştirilir: hook + perfectFor + sabit şablon gövdesi
  materials: string[]; // 13 alan
  categoryId: string; // Etsy taksonomi ID (Digital Prints)
  attributes: ListingAttributes;
}

/**
 * Etsy yayın adımının (publishToEtsy) checkpoint'i — restart sonrası dayanıklı, idempotent resume için.
 * Sweeper yarım kalan bir yayını kaldığı yerden sürdürür; çift listing/çift upload olmaz.
 */
export interface PublishProgress {
  price?: number; // resume'da kullanmak üzere kalıcı yayın parametreleri
  thumbnailIndex?: number;
  listingId?: number; // taslak oluşturuldu (etsyListingId ile aynı) → resume'da yeniden oluşturma
  attributesDone?: boolean; // öznitelikler yazıldı
  imagesUploaded?: number; // ordered görsel dizisinden kaç mockup yüklendi (sıralı checkpoint)
  sizeGuideDone?: boolean; // ölçü görseli yüklendi
  videoDone?: boolean; // video yüklendi
  filesUploaded?: string[]; // yüklenen dijital dosya key'leri (ratio_*)
}

export interface PipelineRun {
  id: string;
  status: PipelineStatus;
  prompt: string;
  imageModel?: ImageModel; // hangi modelle üretildi
  competitorResearchId?: number; // rakip SEO analizinden beslendiyse (CompetitorResearch.id)
  referenceImageUrl?: string;
  variationUrls?: string[]; // üretilen tüm varyasyonlar (awaiting_approval'da gösterilir)
  generatedImageUrl?: string; // seçilen varyasyon (önizleme/master kaynağı)
  upscaledImageUrl?: string; // processing_files: clarity-upscaler ×4 sonucu (master)
  digitalFileUrls?: DigitalFileUrls; // processing_files: { ratio_2x3: "...jpg", ... } (5 JPG)
  mediaUrls?: MediaUrls; // processing_files: 8 mockup + video + ölçü görseli
  seo?: SeoData;
  etsyListingId?: number;
  pinterestPinId?: string;
  attempts?: number; // kurtarma sweeper'ının bu run'ı kaç kez yeniden denediği
  publishProgress?: PublishProgress; // publishing_etsy resume checkpoint'i
  errorMessage?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Kaydedilmiş görsel taslağı — beğenilen bir varyasyon ya da dışarıdan yüklenen bir görsel.
 * Taslaklardan "devam et" ile yeni bir run başlatılıp (görsel seçilmiş gibi) yayına gidilebilir.
 */
export interface ImageDraft {
  id: string;
  imageUrl: string;
  source: 'variation' | 'upload';
  prompt?: string; // varyasyon kaynaklıysa üretim prompt'u
  createdAt: string; // ISO 8601
}

/** Rakip mağaza — satış/yorum oranı kalibrasyonu için (CLAUDE.md §9). */
export interface CompetitorShop {
  shopId: number;
  shopName: string;
  totalSales: number;
  totalReviews: number;
  reviewRatio: number; // totalReviews / totalSales
  lastScannedAt?: string;
}

export interface CompetitorListing {
  listingId: number;
  shopId: number;
  title: string;
  tags: string[];
  price: number;
  numFavorers: number;
  reviewCount: number;
  creationDate: string; // ISO 8601
  estimatedSales: number;
  monthlyVelocity: number;
  opportunityScore: number;
}

/**
 * Rakip SEO analizi — kullanıcının girdiği bir Etsy listing URL'inden çekilen referans veriler
 * ve bunlardan üretilen özgün SEO. Bir pipeline run'a bağlanır (pipelineRunId) ve gate 2'deki
 * vision SEO üretimine referans olarak beslenir (generateSeo competitorRef).
 */
export interface CompetitorResearch {
  id: number;
  pipelineRunId?: string; // bağlandığı run (analiz anında henüz yok → undefined)
  sourceListingId: number; // URL'den parse edilen Etsy listing_id
  sourceUrl: string; // kullanıcının girdiği ham URL
  sourceTitle: string;
  sourceTags: string[];
  sourceTaxonomyId?: number; // izleme amaçlı saklanır (yayında default Digital Prints kullanılır)
  sourceNumFavorers: number;
  sourceViews: number;
  generatedTitle: string; // Claude'un ürettiği özgün başlık
  generatedTags: string[]; // 13 özgün etiket
  generatedDescription: string;
  fetchedAt: string; // ISO 8601 — Etsy'den çekildiği an
  createdAt: string; // ISO 8601
}
