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

export interface ProductConfig {
  type: ProductType;
  label: string; // UI select etiketi
  genAspect: FluxAspectRatio; // görsel üretim oranı
  previewAspectClass: string; // UI önizleme kutusu (tailwind aspect sınıfı)
  files: DigitalFileSpec[]; // packaging → dijital dosyalar
  density: number; // JPG DPI metadata
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
    density: 300,
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
    density: 72, // ekran; DPI pratikte önemsiz
    video: { width: 1920, height: 1080 }, // 16:9 yatay
    usesSizeGuide: false,
    mockupScenes: TV_MOCKUP_SCENES,
  },
};

/** Ürün tipi config'ini döner; tanımsızsa 'print' (geriye dönük uyumluluk). */
export function productConfig(type?: ProductType): ProductConfig {
  return PRODUCT_CONFIGS[type ?? 'print'] ?? PRODUCT_CONFIGS.print;
}
