'use client';

import type { PipelineStatus } from '@/types';
import { STAGES, stageIndexFor } from './shared';

/**
 * Kapı rayı — hattın dört onay kapısı.
 *
 * NUMARALANDIRMA BURADA MEŞRU: bu dört adım gerçek bir sıradır, numara okuyucuya
 * lazım olan bir bilgiyi taşır. (Panelin başka hiçbir yerinde rastgele listelere
 * numara verilmez.)
 *
 * `status` olarak `'idle'` kabul eder ve HER ZAMAN gösterilir — eskiden yalnızca bir
 * üretim başladıktan sonra görünüyordu, bu yüzden kullanıcı "kaç adım var, sırada ne
 * geliyor" bilgisini ilk ekranda hiç göremiyordu.
 */
export function Stepper({ status }: { status: PipelineStatus | 'idle' }) {
  const current = stageIndexFor(status);
  const errored = status === 'error';

  return (
    <div className="rounded-lg border border-sand bg-sheet shadow-card">
      {/* Dar ekranda tüm ray sığmaz: yalnızca bulunulan adım + sayaç gösterilir. */}
      <p className="px-4 py-3 text-sm font-medium text-ink-body md:hidden">
        {errored
          ? 'Durdu'
          : current >= STAGES.length
            ? 'Tamamlandı'
            : `Adım ${current + 1}/${STAGES.length} — ${STAGES[current]?.label}`}
      </p>

      <ol className="hidden items-stretch md:flex">
        {STAGES.map((stage, i) => {
          const done = !errored && current > i;
          const active = !errored && current === i;
          return (
            <li
              key={stage.key}
              aria-current={active ? 'step' : undefined}
              className={`flex flex-1 items-center gap-3 border-b-[3px] px-4 py-3.5 ${
                active ? 'border-gold' : 'border-transparent'
              }`}
            >
              {/* Tamamlanan adım ✓ (altın dolu), bulunulan adım numara (mürekkep dolu),
                  gelecek adım numara (boş halka) — şekil de renk kadar bilgi taşır. */}
              <span
                aria-hidden
                className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums ${
                  done
                    ? 'bg-gold text-sheet'
                    : active
                      ? 'bg-ink text-sheet'
                      : 'border border-field text-ink-faint'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className="sr-only">
                Adım {i + 1}
                {done ? ' (tamamlandı)' : ''}:
              </span>
              <span
                className={`min-w-0 truncate text-sm ${
                  active ? 'font-semibold text-ink' : done ? 'font-medium text-ink-body' : 'text-ink-faint'
                }`}
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
