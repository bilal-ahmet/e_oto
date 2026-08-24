'use client';

import type { PipelineRun } from '@/types';

export function SeoSummary({ seo }: { seo: NonNullable<PipelineRun['seo']> }) {
  return (
    <div className="mt-5 space-y-3 border-t border-sand pt-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Başlık</p>
        <p className="text-sm text-ink">{seo.title}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Etiketler</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {seo.tags.map((t, i) => (
            <span key={i} className="rounded-md bg-shade px-2 py-0.5 text-xs text-ink-body">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
