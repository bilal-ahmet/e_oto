import type { PipelineStatus } from '@/types';

/**
 * Durum sınıfı — kullanıcının tek soruya cevap alması için: "sıra kimde?"
 *  - `working`  → sistem çalışıyor, beklemek dışında yapacak bir şey yok
 *  - `waiting`  → sıra kullanıcıda (3 insan-onay kapısı)
 *  - `final`    → iş bitti (başarıyla ya da hatayla)
 */
export type StatusKind = 'working' | 'waiting' | 'final';

/**
 * Rozet renk reçetesi — token çiftleri `src/app/globals.css` içinde tanımlı ve her birinin
 * metin kontrastı ölçülü (5.76–7.55, hepsi WCAG AA üstü).
 *
 * ÜÇ ONAY KAPISI BİLEREK AYNI `turn` TONUNU PAYLAŞIR: "sıra sende" tek bir anlamdır ve
 * altın markanın dikkat rengidir. Hangi kapıda olunduğunu renk değil, kapı numarası ve
 * aşağıdaki `description` cümlesi söyler — o cümleler bu yüzden değiştirilmemeli.
 *
 * ⚠ SINIFLAR TAM VE LİTERAL YAZILIR — `bg-state-${tone}` gibi birleştirme YAPILMAZ.
 * Tailwind sınıf adlarını kaynak METİNDEN tarar; çalışma anında kurulan bir string'i
 * göremez ve o rozet sessizce renksiz kalır (tsc ve lint bunu yakalamaz).
 * Onay kapılarının halkası bilerek daha koyu (/45): göz orada dursun.
 */

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
    className: 'bg-state-idle text-state-idle-ink ring-state-idle-ink/20',
  },
  generating_image: {
    label: 'Görsel üretiliyor',
    description: 'Yapay zekâ görsel seçeneklerini çiziyor.',
    kind: 'working',
    className: 'bg-state-work text-state-work-ink ring-state-work-ink/20',
  },
  awaiting_approval: {
    label: 'Görsel onayı bekliyor',
    description: 'Sıra sende: üretilen görsellerden birini seçmen gerekiyor.',
    kind: 'waiting',
    className: 'bg-state-turn text-state-turn-ink ring-state-turn-ink/45',
  },
  generating_seo: {
    label: 'Metinler yazılıyor',
    description: 'Seçtiğin görsel için başlık, etiket ve açıklama hazırlanıyor.',
    kind: 'working',
    className: 'bg-state-write text-state-write-ink ring-state-write-ink/20',
  },
  awaiting_seo_approval: {
    label: 'Metin onayı bekliyor',
    description: 'Sıra sende: başlık, etiket ve açıklamayı kontrol edip onaylaman gerekiyor.',
    kind: 'waiting',
    className: 'bg-state-turn text-state-turn-ink ring-state-turn-ink/45',
  },
  processing_files: {
    label: 'Dosyalar hazırlanıyor',
    description: 'Görsel büyütülüyor; baskı dosyaları, mockuplar ve video üretiliyor. En uzun adım.',
    kind: 'working',
    className: 'bg-state-files text-state-files-ink ring-state-files-ink/20',
  },
  awaiting_publish: {
    label: 'Yayın onayı bekliyor',
    description: 'Sıra sende: her şey hazır, sadece yayınla demen kaldı.',
    kind: 'waiting',
    className: 'bg-state-turn text-state-turn-ink ring-state-turn-ink/45',
  },
  publishing_etsy: {
    label: 'Etsy’ye yükleniyor',
    description: 'İlan oluşturuluyor; görseller ve satılacak dosyalar Etsy’ye aktarılıyor.',
    kind: 'working',
    className: 'bg-state-ship text-state-ship-ink ring-state-ship-ink/20',
  },
  publishing_pinterest: {
    label: 'Pinterest’e pinleniyor',
    description: 'Etsy ilanı yayında; şimdi Pinterest’e pin atılıyor.',
    kind: 'working',
    className: 'bg-state-pin text-state-pin-ink ring-state-pin-ink/20',
  },
  done: {
    label: 'Etsy’ye aktarıldı',
    // DİKKAT: pipeline listing'i BİLEREK taslak bırakır (lib/pipeline/run.ts — activate çağrılmaz).
    // "Yayınlandı / satışta" demek kullanıcıya ilanın canlı olduğunu sandırıyordu.
    description: 'İlan Etsy’de taslak olarak hazır — satışa açmak için Etsy panelinden yayına al.',
    kind: 'final',
    className: 'bg-state-done text-state-done-ink ring-state-done-ink/20',
  },
  error: {
    label: 'Hata',
    description: 'İşlem yarıda durdu. Sebebi aşağıda yazıyor.',
    kind: 'final',
    className: 'bg-state-error text-state-error-ink ring-state-error-ink/20',
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
