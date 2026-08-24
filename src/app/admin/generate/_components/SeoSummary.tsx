'use client';

import type { PipelineRun } from '@/types';

export function SeoSummary({ seo }: { seo: NonNullable<PipelineRun['seo']> }) {
  return (
    <div className="mt-5 space-y-3 border-t border-zinc-100 pt-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Başlık</p>
        <p className="text-sm text-zinc-800">{seo.title}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Etiketler</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {seo.tags.map((t, i) => (
            <span key={i} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
