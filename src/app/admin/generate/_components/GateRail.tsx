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
    <div className="border-y border-sand bg-shade">
      {/* Dar ekranda tüm ray sığmaz: yalnızca bulunulan adım + sayaç gösterilir. */}
      <p className="px-1 py-3 font-mono text-label uppercase tracking-label text-ink-muted md:hidden">
        {errored
          ? 'Durdu'
          : current >= STAGES.length
            ? 'Tamamlandı'
            : `No. 0${current + 1} — ${STAGES[current]?.label} · ${current + 1}/${STAGES.length}`}
      </p>

      <ol className="hidden items-stretch md:flex">
        {STAGES.map((stage, i) => {
          const done = !errored && current > i;
          const active = !errored && current === i;
          return (
            <li
              key={stage.key}
              className={`flex flex-1 items-center gap-2.5 border-b-2 px-4 py-3 ${
                active ? 'border-gold' : 'border-transparent'
              }`}
            >
              {/* Tamamlanan adım altın dolu kare, bulunulan adım mürekkep dolu kare,
                  gelecek adım boş kare — şekil de renk kadar bilgi taşır. */}
              <span
                aria-hidden
                className={`size-2 shrink-0 ${
                  done
                    ? 'bg-gold'
                    : active
                      ? 'bg-ink'
                      : 'border border-sand bg-transparent'
                }`}
              />
              <span className="min-w-0">
                <span
                  className={`block font-mono text-label uppercase tracking-label ${
                    done || active ? 'text-gold-deep' : 'text-ink-faint'
                  }`}
                >
                  No. 0{i + 1}
                </span>
                <span
                  className={`block truncate font-display text-sm tracking-tight ${
                    active ? 'text-ink' : done ? 'text-ink-body' : 'text-ink-faint'
                  }`}
                >
                  {stage.label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
