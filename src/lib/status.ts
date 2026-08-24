import type { PipelineStatus } from '@/types';

/**
 * Durum sınıfı — kullanıcının tek soruya cevap alması için: "sıra kimde?"
 *  - `working`  → sistem çalışıyor, beklemek dışında yapacak bir şey yok
 *  - `waiting`  → sıra kullanıcıda (3 insan-onay kapısı)
 *  - `final`    → iş bitti (başarıyla ya da hatayla)
 */
export type StatusKind = 'working' | 'waiting' | 'final';

// Pipeline durumları için Türkçe etiket + tek cümlelik açıklama + rozet renk sınıfları (Tailwind).
// AÇIKLAMA KURALI: tek cümle, jargonsuz, "ne oluyor / sıra kimde" sorusuna cevap versin.
// Panelde rozetin yanında birebir bu metin gösterilir (bkz. app/admin/page.tsx).
export const STATUS_META: Record<
  PipelineStatus,
  { label: string; description: string; kind: StatusKind; className: string }
> = {
  queued: {
    label: 'Sırada',
    description: 'Kayıt açıldı, üretim birazdan başlayacak.',
    kind: 'working',
    className: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20',
  },
  generating_image: {
    label: 'Görsel üretiliyor',
    description: 'Yapay zekâ görsel seçeneklerini çiziyor.',
    kind: 'working',
    className: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  },
  awaiting_approval: {
    label: 'Görsel onayı bekliyor',
    description: 'Sıra sende: üretilen görsellerden birini seçmen gerekiyor.',
    kind: 'waiting',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/30',
  },
  generating_seo: {
    label: 'Metinler yazılıyor',
    description: 'Seçtiğin görsel için başlık, etiket ve açıklama hazırlanıyor.',
    kind: 'working',
    className: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  },
  awaiting_seo_approval: {
    label: 'Metin onayı bekliyor',
    description: 'Sıra sende: başlık, etiket ve açıklamayı kontrol edip onaylaman gerekiyor.',
    kind: 'waiting',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/30',
  },
  processing_files: {
    label: 'Dosyalar hazırlanıyor',
    description: 'Görsel büyütülüyor; baskı dosyaları, mockuplar ve video üretiliyor. En uzun adım.',
    kind: 'working',
    className: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
  },
  awaiting_publish: {
    label: 'Yayın onayı bekliyor',
    description: 'Sıra sende: her şey hazır, sadece yayınla demen kaldı.',
    kind: 'waiting',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/30',
  },
  publishing_etsy: {
    label: 'Etsy’ye yükleniyor',
    description: 'İlan oluşturuluyor; görseller ve satılacak dosyalar Etsy’ye aktarılıyor.',
    kind: 'working',
    className: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  },
  publishing_pinterest: {
    label: 'Pinterest’e pinleniyor',
    description: 'Etsy ilanı yayında; şimdi Pinterest’e pin atılıyor.',
    kind: 'working',
    className: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  },
  done: {
    label: 'Yayınlandı',
    description: 'Bitti — ürün Etsy’de satışta.',
    kind: 'final',
    className: 'bg-green-50 text-green-700 ring-green-600/20',
  },
  error: {
    label: 'Hata',
    description: 'İşlem yarıda durdu. Sebebi aşağıda yazıyor.',
    kind: 'final',
    className: 'bg-red-50 text-red-700 ring-red-600/20',
  },
};

// Pipeline'ın sıralı adımları (ilerleme göstergesi için; insan-onayı duraklarını da içerir).
export const PIPELINE_ORDER: PipelineStatus[] = [
  'queued',
  'generating_image',
  'awaiting_approval',
  'generating_seo',
  'awaiting_seo_approval',
  'processing_files',
  'awaiting_publish',
  'publishing_etsy',
  'done',
  'publishing_pinterest',
];
