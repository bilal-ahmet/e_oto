'use client';

import type { PipelineRun } from '@/types';

/**
 * Yayını bloklamayan uyarılar (örn. "Etsy videoyu kabul etmedi"). Bunlar eskiden yalnızca
 * sunucu loguna yazılıyordu; kullanıcı listing'de video olmadığını görüyor ama sebebini
 * öğrenemiyordu. Artık gate 3 ve "Yayınlandı" ekranında görünür.
 */
export function PipelineWarnings({ run }: { run: PipelineRun }) {
  const warnings = run.publishProgress?.warnings ?? [];
  if (warnings.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-900">Dikkat edilmesi gerekenler</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-800">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
