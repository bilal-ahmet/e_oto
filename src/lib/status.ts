import type { PipelineStatus } from '@/types';

// Pipeline durumları için Türkçe etiket + rozet renk sınıfları (Tailwind).
export const STATUS_META: Record<
  PipelineStatus,
  { label: string; className: string }
> = {
  queued: { label: 'Sırada', className: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20' },
  generating_image: {
    label: 'Görsel üretiliyor',
    className: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  },
  awaiting_approval: {
    label: 'Görsel onayı bekliyor',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/30',
  },
  generating_seo: {
    label: 'SEO üretiliyor',
    className: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  },
  awaiting_seo_approval: {
    label: 'SEO onayı bekliyor',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/30',
  },
  processing_files: {
    label: 'Dosyalar işleniyor (ZIP)',
    className: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
  },
  awaiting_publish: {
    label: 'Yayın onayı bekliyor',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/30',
  },
  publishing_etsy: {
    label: 'Etsy yayını',
    className: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  },
  publishing_pinterest: {
    label: 'Pinterest yayını',
    className: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  },
  done: { label: 'Tamamlandı', className: 'bg-green-50 text-green-700 ring-green-600/20' },
  error: { label: 'Hata', className: 'bg-red-50 text-red-700 ring-red-600/20' },
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
