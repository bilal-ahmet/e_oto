/**
 * Paylaşılan arayüz primitifleri — panelin tasarım dili burada tanımlanır.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ SARSILMAZ KURAL: BU DOSYAYA `'use client'`, HOOK veya kendi state'i olan  ║
 * ║ bir davranış EKLENMEZ.                                                    ║
 * ║ `EtsyConnection` ve `PinterestConnection` SERVER component'tir ve buradan ║
 * ║ `Card`/`Alert` kullanır; bir hook eklenirse o iki dosya derlenmez.        ║
 * ║ Açılır/kapanır bölüm gerekiyorsa native <details>/<summary> kullanın —    ║
 * ║ server-safe ve klavye/ekran okuyucu desteği bedava gelir.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Görsel dil: marka sitesinin (src/app/(marketing)/) kâğıt paleti. Renk token'ları
 * ve kontrast kuralları `src/app/globals.css` içindedir. Kısaca:
 *   · yüzey  = paper (sayfa) / sheet (kart) / shade (girinti, ikincil bant)
 *   · çizgi  = sand
 *   · metin  = ink > ink-body > ink-muted > ink-faint
 *   · altın  = gold yalnızca ÇİZGİ/ODAK/İŞARET; metin gerekiyorsa gold-deep
 *   · şekil  = hap (rounded-full) veya düz kâğıt kenarı (rounded-xs). Ara form yok.
 *   · gölge  = yalnızca `Framed`. Kartlarda gölge yok, yüzey ayrımı 1px kenarlıkla.
 */

import Link from 'next/link';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentProps,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

// ── Yüzeyler ────────────────────────────────────────────────────────────────

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  /** false → iç boşluk yok (liste/tablo kartları kendi ritmini kurar). */
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-xs border border-sand bg-sheet ${padded ? 'p-5' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: string;
  /** Mono hap — sayfanın ne olduğunu tek kelimeyle söyler. */
  eyebrow?: string;
  /** Sağa yaslı birincil eylem (genelde bir LinkButton). */
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <div className="mb-3 inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-3 py-1 font-mono text-label uppercase tracking-label text-gold-deep">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-display text-3xl tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Bölüm başlığı. `no` YALNIZCA gerçek bir sıra varsa verilir — pipeline'ın 4 onay
 * kapısı böyledir. Rastgele listelerde numara kullanmayın; numara bir bilgi taşımalı.
 */
export function SectionHeading({
  no,
  title,
  description,
  action,
}: {
  no?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-sand pb-2">
      <div>
        {no ? (
          <span className="mr-2 font-mono text-label uppercase tracking-label text-gold-deep">
            No. {no}
          </span>
        ) : null}
        <h2 className="inline font-display text-xl tracking-tight text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ── Butonlar ────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

/**
 * `danger` YALNIZCA geri alınamaz, veri silen işler içindir (geçmişi temizle, taslak
 * sil, board sil). "İptal / vazgeç" gibi zararsız çıkışlar `ghost` kullanır — eskiden
 * aynı `reject()` çağrısı bir kapıda danger, diğerinde ghost görünüyordu.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/85 disabled:bg-ink/30',
  secondary:
    'border border-ink text-ink hover:bg-ink hover:text-paper disabled:border-sand disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint',
  ghost: 'border border-sand bg-sheet text-ink-body hover:border-ink hover:text-ink disabled:text-ink-faint',
  danger:
    'border border-state-error-ink/40 bg-state-error text-state-error-ink hover:border-state-error-ink disabled:opacity-60',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2 text-sm',
};

/**
 * Buton sınıflarını string olarak döndürür — `<a>` / `<label>` gibi buton OLMAYAN
 * öğelere buton görünümü vermek için.
 *
 * NEDEN `asChild` DEĞİL: `cloneElement` React Compiler'ın (next.config → reactCompiler)
 * memoizasyon varsayımlarıyla en sürtünmeli kalıp; ayrıca `disabled` semantiğini yalan
 * söyler (bir anchor `disabled` olamaz). Düz bir fonksiyon çağrısı runtime sihri
 * gerektirmez ve `Button`'ı dürüst bir `<button>` olarak bırakır.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className = '',
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return `inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClasses({ variant, size, className })} {...props} />;
}

/**
 * Buton görünümlü `next/link`. `ComponentProps<typeof Link>`'i genişletir; böylece
 * `prefetch={false}` (OAuth start route'u prefetch EDİLMEMELİ) ve `scroll={false}`
 * (sayfalama listede kalmalı) gibi görünmez ama gerekli prop'lar tip düzeyinde geçer.
 */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}

/** Buton görünümlü dış bağlantı (`target="_blank"` gerektiren yerler). */
export function ExternalLinkButton({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <a className={buttonClasses({ variant, size, className })} {...props} />;
}

// ── Form ────────────────────────────────────────────────────────────────────

/**
 * Tüm form girdilerinin ortak iskeleti.
 * Odak stili BİLEREK yok — `globals.css`'teki tek `:focus-visible` kuralından gelir.
 * Elle yazıldığı dönemde 18 girdinin 4'ünde unutulmuştu.
 */
const FIELD_BASE =
  'w-full rounded-xs border border-sand bg-sheet px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors hover:border-ink/40 disabled:bg-shade disabled:text-ink-faint';

const INVALID = 'border-state-error-ink/50';

export function Input({
  className = '',
  invalid = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={`${FIELD_BASE} ${invalid ? INVALID : ''} ${className}`} {...props} />;
}

export function Textarea({
  className = '',
  invalid = false,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={`${FIELD_BASE} ${invalid ? INVALID : ''} ${className}`} {...props} />;
}

export function Select({
  className = '',
  invalid = false,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select className={`${FIELD_BASE} ${invalid ? INVALID : ''} ${className}`} {...props} />;
}

/**
 * Etiketli alan sarmalayıcısı — label + ipucu + karakter sayacı + hata.
 * Sayaç `maxLength` olan her alanda kullanılmalı: sınır vardı ama kullanıcı ona ne
 * kadar yaklaştığını göremiyordu (13 etiketin hiçbirinde sayaç yoktu).
 */
export function Field({
  label,
  htmlFor,
  hint,
  counter,
  error,
  optional = false,
  children,
  className = '',
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  counter?: { value: number; max: number };
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ratio = counter ? counter.value / counter.max : 0;
  const counterTone =
    counter && counter.value >= counter.max
      ? 'text-state-error-ink'
      : ratio > 0.9
        ? 'text-gold-deep'
        : 'text-ink-faint';

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
          {optional ? (
            <span className="ml-2 font-mono text-label uppercase tracking-label text-ink-faint">
              opsiyonel
            </span>
          ) : null}
        </label>
        {counter ? (
          <span className={`font-mono text-label tabular-nums ${counterTone}`}>
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 font-mono text-label uppercase tracking-label text-state-error-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ── Rozet ───────────────────────────────────────────────────────────────────

export type BadgeTone = 'neutral' | 'gold' | 'success' | 'danger';
/** Renkten BAĞIMSIZ ikinci kanal — renk körlüğünde de ayırt edilebilsin diye. */
export type BadgeMarker = 'dot' | 'diamond' | 'check' | 'bang';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-shade text-ink-muted ring-ink/15',
  gold: 'bg-state-turn text-state-turn-ink ring-state-turn-ink/45',
  success: 'bg-state-done text-state-done-ink ring-state-done-ink/20',
  danger: 'bg-state-error text-state-error-ink ring-state-error-ink/20',
};

function Marker({ marker }: { marker: BadgeMarker }) {
  if (marker === 'check') return <span aria-hidden>✓</span>;
  if (marker === 'bang') return <span aria-hidden>!</span>;
  return (
    <span
      aria-hidden
      className={
        marker === 'diamond'
          ? 'size-1.5 rotate-45 bg-current' // "sıra sende" — göz burada dursun
          : 'size-1.5 rounded-full bg-current motion-safe:animate-pulse' // çalışıyor
      }
    />
  );
}

export function Badge({
  tone = 'neutral',
  marker,
  className = '',
  children,
}: {
  tone?: BadgeTone;
  marker?: BadgeMarker;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-label uppercase tracking-label ring-1 ring-inset ${BADGE_TONES[tone]} ${className}`}
    >
      {marker ? <Marker marker={marker} /> : null}
      {children}
    </span>
  );
}

// ── Uyarı / bildirim ────────────────────────────────────────────────────────

export type AlertTone = 'info' | 'warning' | 'danger' | 'success';

const ALERT_TONES: Record<AlertTone, string> = {
  info: 'border-l-ink/25 bg-shade text-ink-body',
  warning: 'border-l-gold bg-state-turn text-state-turn-ink',
  danger: 'border-l-state-error-ink bg-state-error text-state-error-ink',
  success: 'border-l-state-done-ink bg-state-done text-state-done-ink',
};

/**
 * Tek bir uyarı kabı. Panelde eskiden aynı görünüm iki farklı yolla (Card+className ve
 * düz div) üretiliyor, üç ayrı hata kanalı üç farklı biçimde görünüyordu.
 */
export function Alert({
  tone = 'info',
  title,
  action,
  compact = false,
  className = '',
  children,
}: {
  tone?: AlertTone;
  title?: string;
  /** Sağa yaslı eylem (genelde bir LinkButton — "Etsy'ye bağlan" gibi). */
  action?: ReactNode;
  /** Bir kontrolün hemen altındaki satır içi hata için. */
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xs border-l-2 ${
        compact ? 'px-3 py-2' : 'px-4 py-3'
      } ${ALERT_TONES[tone]} ${className}`}
    >
      <div className="min-w-0 flex-1">
        {title ? <p className="text-sm font-medium">{title}</p> : null}
        {children ? (
          <div className={`text-sm leading-relaxed ${title ? 'mt-1' : ''}`}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ── Boş durum ───────────────────────────────────────────────────────────────

/** Boş ekran bir davettir: ne olduğunu söyle, ne yapılacağını göster. */
export function EmptyState({
  title,
  description,
  action,
  className = '',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-6 py-10 text-center ${className}`}>
      {/* Boş bir paspartu — "burada bir eser olacak" */}
      <div
        aria-hidden
        className="mx-auto mb-4 h-16 w-12 border-[6px] border-paper bg-shade outline outline-1 -outline-offset-1 outline-ink/25"
      />
      <p className="font-mono text-label uppercase tracking-label text-ink-muted">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-sm text-sm text-ink-faint">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// ── İmza öğesi: paspartulu çerçeve ──────────────────────────────────────────

/**
 * Çerçeve içindeki `<Image>`'a verilecek sınıf.
 * `object-contain` ŞART: taslak kayıtlarında ürün tipi tutulmuyor, bu yüzden 16:9 bir
 * Frame TV eseri 3:4 kutuda `object-cover` ile kırpılıyordu. Paspartuda artan boşluk
 * doğal görünür — gerçek bir paspartunun yaptığı işin aynısı.
 */
export const FRAMED_IMG = 'h-full w-full object-contain';

/**
 * Paspartulu çerçeve — panelin imza öğesi.
 *
 * Panelde görünen her görsel bir BASKI ESERİDİR; dosya küçük resmi gibi değil, duvara
 * asılmış bir iş gibi gösterilir. Marka sitesinin galerisiyle aynı çerçeve dili.
 *
 * `<Image>` BİLEREK sarmalanmaz, children olarak alınır: `unoptimized` ve boyut
 * prop'ları çağrı yerinde kalır. (next.config'de `images` bloğu yok; `unoptimized`
 * düşen bir görsel prodüksiyonda kırılır — bu kural onu yapısal olarak korur.)
 */
export function Framed({
  ratio = 'aspect-[3/4]',
  mat = 'md',
  selected = false,
  caption,
  className = '',
  children,
}: {
  /** Ürün tipine göre değişir — çağıran `previewAspectClass()` sonucunu geçer. */
  ratio?: string;
  mat?: 'sm' | 'md';
  /** Seçili eser: paspartu çerçevesi altına döner. */
  selected?: boolean;
  caption?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={className}>
      <div
        className={`${ratio} relative overflow-hidden bg-shade shadow-frame outline outline-1 -outline-offset-1 transition-[outline-color] ${
          mat === 'sm' ? 'border-4' : 'border-[6px] sm:border-[10px]'
        } border-paper ${selected ? 'outline-2 outline-gold' : 'outline-ink/70'}`}
      >
        {children}
      </div>
      {caption ? (
        <figcaption className="mt-2 font-mono text-label uppercase tracking-label text-ink-muted">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

// ── Yükleniyor ──────────────────────────────────────────────────────────────

/**
 * Rengi `border-current`'tan alır. `motion-reduce` ile DURDURULMAZ: donmuş bir spinner
 * "sayfa çöktü" diye okunur. Yanında daima bir metin bulunmalı — bilgi oradan gelir.
 */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}
