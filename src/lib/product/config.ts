/**
 * Ürün tipi config registry — 'print' ve 'tv' arasındaki TÜM farklar tek yerde toplanır.
 * Pipeline adımları `productConfig(run.productType)` ile ilgili ayarları okur; böylece ürün-tipi
 * dallanması koda saçılmaz. Yeni bir ürün tipi eklemek = buraya bir kayıt eklemek.
 *
 * Yalnızca server-side veri; UI de `previewAspectClass` gibi salt-okunur alanları kullanabilir.
 */

import { PRINT_RATIOS, type ProductType } from '@/types';
import { MOCKUP_SCENES, TV_MOCKUP_SCENES, type MockupScene } from '@/lib/mockup/scenes';
import type { FluxAspectRatio } from '@/lib/flux/client';

/** Bir dijital ürün dosyasının hedef boyutu (packaging bunu resize eder). */
export interface DigitalFileSpec {
  key: string; // digitalFileUrls anahtarı (print: RatioKey, tv: 'screen_4k' | 'screen_fhd')
  label: string; // UI gösterimi
  fileName: string; // Etsy'ye yüklenecek dosya adı
  width: number;
  height: number;
}

/**
 * JPG export ayarları (packaging/resize-and-export bunu uygular).
 *
 * `density` HER ÜRÜN TİPİNDE 300'dür — ekran ürününde DPI teknik olarak önemsiz olsa da
 * dosyanın özelliklerinde "72 DPI" görünmesi alıcıya düşük kalite izlenimi verir.
 *
 * `quality`/`chromaSubsampling` ürün tipine göre ayrılır: baskı dosyaları ~77 megapiksel
 * olduğundan ölçülmüş bellek/süre sözleşmesine sadık kalır (q90, 4:2:0 — bkz. packaging başlığı);
 * TV dosyaları en fazla 8.3 MP olduğundan 20 MB tavanının çok altında kalır ve tam kroma
 * (4:4:4) + yüksek kalite ile export edilir.
 */
export interface JpegExportSettings {
  density: number; // JPG DPI metadata
  quality: number; // başlangıç kalitesi (20MB'ı aşarsa packaging %5'er düşürür)
  chromaSubsampling: '4:4:4' | '4:2:0';
}

export interface ProductConfig {
  type: ProductType;
  label: string; // UI select etiketi
  genAspect: FluxAspectRatio; // görsel üretim oranı
  previewAspectClass: string; // UI önizleme kutusu (tailwind aspect sınıfı)
  files: DigitalFileSpec[]; // packaging → dijital dosyalar
  jpeg: JpegExportSettings; // JPG export ayarları (DPI + kalite)
  video: { width: number; height: number }; // zoom video çıktı boyutu
  usesSizeGuide: boolean; // sabit ölçü görseli eklenir mi
  mockupScenes: MockupScene[]; // mockup sahneleri
}

// Print dosya spec'i mevcut PRINT_RATIOS'tan türetilir (tek kaynak; açıklama boyut listesi de oradan).
const PRINT_FILES: DigitalFileSpec[] = PRINT_RATIOS.map((r) => ({
  key: r.key,
  label: r.label,
  fileName: r.fileName,
  width: r.width,
  height: r.height,
}));

// Frame TV: 2 JPG — 4K UHD + Full HD, ikisi de 16:9. Ekran kullanımı olduğundan boyutlar küçük.
const TV_FILES: DigitalFileSpec[] = [
  { key: 'screen_4k', label: '4K UHD (3840×2160)', fileName: 'frame-tv-4k-3840x2160.jpg', width: 3840, height: 2160 },
  { key: 'screen_fhd', label: 'Full HD (1920×1080)', fileName: 'frame-tv-fullhd-1920x1080.jpg', width: 1920, height: 1080 },
];

export const PRODUCT_CONFIGS: Record<ProductType, ProductConfig> = {
  print: {
    type: 'print',
    label: 'Baskı (Dijital Print)',
    genAspect: '3:4',
    previewAspectClass: 'aspect-[3/4]',
    files: PRINT_FILES,
    // 7200×10800 = 77 MP: kalite/kroma ölçülmüş bellek sözleşmesine göre sabit (packaging başlığı).
    jpeg: { density: 300, quality: 90, chromaSubsampling: '4:2:0' },
    video: { width: 1080, height: 1350 }, // 4:5 dikey
    usesSizeGuide: true,
    mockupScenes: MOCKUP_SCENES,
  },
  tv: {
    type: 'tv',
    label: 'Frame TV (Ekran Sanatı)',
    genAspect: '16:9',
    previewAspectClass: 'aspect-video',
    files: TV_FILES,
    // 4K = 8.3 MP → 20 MB tavanının çok altında; kalite/kroma yukarı çekilebilir.
    // 300 DPI: ekranda anlamsız ama dosya özelliklerinde "72 DPI" görünmesi alıcıda kalite şüphesi yaratıyor.
    jpeg: { density: 300, quality: 97, chromaSubsampling: '4:4:4' },
    video: { width: 1920, height: 1080 }, // 16:9 yatay
    usesSizeGuide: false,
    mockupScenes: TV_MOCKUP_SCENES,
  },
};

/** Ürün tipi config'ini döner; tanımsızsa 'print' (geriye dönük uyumluluk). */
export function productConfig(type?: ProductType): ProductConfig {
  return PRODUCT_CONFIGS[type ?? 'print'] ?? PRODUCT_CONFIGS.print;
}
