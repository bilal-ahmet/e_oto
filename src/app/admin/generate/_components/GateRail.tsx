'use client';

import type { PipelineStatus } from '@/types';
import { STAGES, stageIndexFor } from './shared';

export function Stepper({ status }: { status: PipelineStatus }) {
  const current = stageIndexFor(status);
  return (
    <ol className="flex items-center gap-2">
      {STAGES.map((stage, i) => {
        const done = current > i;
        const active = current === i;
        return (
          <li key={stage.key} className="flex flex-1 items-center gap-2">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                done ? 'bg-green-600 text-white' : active ? 'bg-rose-600 text-white' : 'bg-zinc-200 text-zinc-500'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={`text-sm font-medium ${active ? 'text-zinc-900' : 'text-zinc-400'}`}>
              {stage.label}
            </span>
            {i < STAGES.length - 1 ? (
              <span className={`h-px flex-1 ${done ? 'bg-green-300' : 'bg-zinc-200'}`} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
