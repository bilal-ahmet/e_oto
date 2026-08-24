'use client';

/**
 * Üretim ekranının paylaşılan sabitleri ve saf yardımcıları.
 * Faz 5'te page.tsx'ten BİREBİR taşındı — içerik değiştirilmedi.
 */

import type { PipelineStatus, ProductType } from '@/types';

export const STAGES = [
  { key: 'image', label: 'Görsel' },
  { key: 'seo', label: 'SEO' },
  { key: 'files', label: 'Dosyalar' },
  { key: 'publish', label: 'Yayın' },
] as const;

// /api/competitor-research/analyze yanıtı
export interface CompetitorAnalysis {
  id: number;
  source: {
    listingId: number;
    title: string;
    tags: string[];
    taxonomyId: number;
    numFavorers: number;
    views: number;
  };
  generated: { title: string; tags: string[]; description: string };
}

export function stageIndexFor(status: PipelineStatus | 'idle'): number {
  switch (status) {
    case 'idle':
    case 'queued':
    case 'generating_image':
    case 'awaiting_approval':
      return 0;
    case 'generating_seo':
    case 'awaiting_seo_approval':
      return 1;
    case 'processing_files':
    case 'awaiting_publish':
      return 2;
    case 'publishing_etsy':
    case 'publishing_pinterest':
      return 3;
    case 'done':
      return 4;
    case 'error':
      return -1;
  }
}

// Sistem çalışıyor (polling sürer); insan-onayı durakları bu listede DEĞİL.
export const WORKING: PipelineStatus[] = [
  'queued',
  'generating_image',
  'generating_seo',
  'processing_files',
  'publishing_etsy',
  'publishing_pinterest',
];

/**
 * Dosyayı base64'e çevirir.
 *
 * FileReader KULLANILIR (elle byte döngüsü DEĞİL): eski hâli her byte için string birleştirme
 * yapıyordu ve 10 MB'lık bir görselde ana iş parçacığını saniyelerce kilitliyordu (sekme donuyor).
 * readAsDataURL aynı işi native tarafta yapar; sonuç "data:<mime>;base64,<veri>" olduğu için
 * yalnızca virgülden sonrası alınır.
 */
export function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve({
        base64: result.slice(result.indexOf(',') + 1),
        mediaType: file.type || 'image/png',
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Yanıtı JSON olarak okur; gövde boş/JSON değilse HTTP durumunu içeren anlaşılır bir hata atar.
 * (Next.js production'da yakalanmamış route hatası GÖVDESİZ 500 döner — düz `res.json()`
 * bunu "Unexpected end of JSON input" diye maskeleyip asıl sebebi gizler.)
 */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) throw new Error(`Sunucu boş yanıt döndü (HTTP ${res.status}). Sunucu loglarına bakın.`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Sunucu JSON olmayan yanıt döndü (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

// Ürün tipi UI etiketleri (server-side productConfig'i client'a import ETMEDEN — o fal/node bağımlılıkları çeker).
export const PRODUCT_OPTIONS: { value: ProductType; label: string }[] = [
  { value: 'print', label: 'Baskı (Dijital Print)' },
  { value: 'tv', label: 'Frame TV (Ekran Sanatı)' },
];

/** Ürün tipine göre varyasyon önizleme oranı (üretilen sanat: print 3:4 dikey, tv 16:9 yatay). */
export function previewAspectClass(pt?: ProductType): string {
  return pt === 'tv' ? 'aspect-video' : 'aspect-[3/4]';
}

/** Mockup kutusu oranı (print sahneleri 4:3, tv sahneleri 16:9). */
export function mockupAspectClass(pt?: ProductType): string {
  return pt === 'tv' ? 'aspect-video' : 'aspect-[4/3]';
}

/** Dijital dosya anahtarını okunur etikete çevirir (print: '2:3', tv: '4K UHD'). */
export function fileLabel(key: string): string {
  if (key === 'screen_4k') return '4K UHD';
  if (key === 'screen_fhd') return 'Full HD';
  return key.replace('ratio_', '').replace('x', ':');
}

/** Gate 3 dosya başlığı ("5 JPG, 300 DPI" / "2 JPG — 4K + Full HD, 300 DPI"). */
export function filesSummary(pt: ProductType | undefined, count: number): string {
  if (pt === 'tv') return `Dijital dosyalar (${count} JPG — 4K + Full HD, 300 DPI)`;
  return `Dijital dosyalar (${count} JPG, 300 DPI)`;
}
