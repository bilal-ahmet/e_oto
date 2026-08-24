import type { PipelineStatus } from '@/types';
import { STATUS_META } from '@/lib/status';

/**
 * `kind` → görsel işaret. Renk tek başına yeterli bir kanal değil (renk körlüğü,
 * düşük kontrastlı ekran, hızlı tarama): rozetin solundaki şekil aynı bilgiyi
 * renkten bağımsız taşır.
 */
const MARKERS: Record<string, 'dot' | 'diamond' | undefined> = {
  working: 'dot', // nabız atan daire — sistem çalışıyor
  waiting: 'diamond', // eşkenar dörtgen — sıra sende
  final: undefined, // bitmiş işin işareti yok; ayrımı ✓ / ! yapar
};

export function StatusBadge({ status }: { status: PipelineStatus }) {
  const { label, className, kind } = STATUS_META[status];
  const marker = MARKERS[kind];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-label uppercase tracking-label ring-1 ring-inset ${
        kind === 'waiting' ? 'font-semibold' : ''
      } ${className}`}
    >
      {status === 'done' ? <span aria-hidden>✓</span> : null}
      {status === 'error' ? <span aria-hidden>!</span> : null}
      {marker === 'dot' ? (
        <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
      ) : null}
      {marker === 'diamond' ? <span aria-hidden className="size-1.5 rotate-45 bg-current" /> : null}
      {label}
    </span>
  );
}
