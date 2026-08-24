'use client';

import type { PinCopy, PipelineRun } from '@/types';
import { Button, Card } from '@/components/ui';
import { PipelineWarnings } from './PipelineWarnings';
import { SeoSummary } from './SeoSummary';
import { PinterestPanel } from './PinterestPanel';

export function DoneView({
  run,
  onReset,
  onPinPinterest,
  pinning,
}: {
  run: PipelineRun;
  onReset: () => void;
  onPinPinterest: (copy: PinCopy) => void;
  pinning: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-state-done-ink">
        <span className="grid size-7 place-items-center rounded-full bg-state-done text-sm">✓</span>
        <h2 className="text-lg font-semibold">Etsy&apos;ye aktarıldı</h2>
      </div>

      {/*
        Hat listing'i BİLEREK taslak bırakır (lib/pipeline/run.ts — activateListing çağrılmaz).
        Bu uyarı olmadan kullanıcı ilanın canlı olduğunu sanıyordu; üstelik taslak bir ilana
        Pinterest pini atmak ölü link üretiyor. Sıradaki adım açıkça söylenir.
      */}
      <div className="mt-4 rounded-xs border-l-2 border-l-gold bg-state-turn px-4 py-3">
        <p className="text-sm font-medium text-state-turn-ink">İlan taslak durumda — henüz satışta değil.</p>
        <p className="mt-1 text-sm text-state-turn-ink">
          Son kontrolü yapıp Etsy panelinden yayına alman gerekiyor. Pinterest pinini de{' '}
          <strong>ilan yayına girdikten sonra</strong> at; taslak ilanın linki çalışmaz.
        </p>
        {run.etsyListingId ? (
          <a
            href={`https://www.etsy.com/your/shops/me/tools/listings/${run.etsyListingId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-medium text-state-turn-ink underline hover:text-state-turn-ink"
          >
            İlanı Etsy&apos;de aç →
          </a>
        ) : null}
      </div>

      <PipelineWarnings run={run} />
      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-shade px-4 py-3">
          <dt className="text-ink-muted">Etsy Listing ID</dt>
          <dd className="font-mono text-ink">{run.etsyListingId ?? '—'}</dd>
        </div>
        <div className="rounded-lg bg-shade px-4 py-3">
          <dt className="text-ink-muted">Dijital dosyalar</dt>
          <dd className="text-ink">
            {run.digitalFileUrls ? Object.keys(run.digitalFileUrls).length : 0} JPG
          </dd>
        </div>
      </dl>
      {run.seo ? <SeoSummary seo={run.seo} /> : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={onReset}>Yeni üretim</Button>
        {run.pinterestPinId ? (
          <a
            href={`https://www.pinterest.com/pin/${run.pinterestPinId}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-gold-deep hover:text-gold-deep"
          >
            ✓ Pinterest&apos;te pinlendi →
          </a>
        ) : null}
      </div>

      {run.pinterestPinId ? null : (
        <PinterestPanel runId={run.id} onPin={onPinPinterest} pinning={pinning} />
      )}
    </Card>
  );
}
