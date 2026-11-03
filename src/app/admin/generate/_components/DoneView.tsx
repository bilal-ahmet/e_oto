'use client';

import type { PinCopy, PipelineRun } from '@/types';
import { Button, Card } from '@/components/ui';
import { PipelineWarnings } from './PipelineWarnings';
import { SeoSummary } from './SeoSummary';
import { PinterestPanel, type PinRequestOptions } from './PinterestPanel';
import { listingStateLabel } from '@/lib/status';
import { formatTr } from '@/lib/format';

export function DoneView({
  run,
  onReset,
  onPinPinterest,
  pinning,
  onCheckEtsyState,
  checkingState,
}: {
  run: PipelineRun;
  onReset: () => void;
  onPinPinterest: (copy: PinCopy, opts: PinRequestOptions) => void;
  pinning: boolean;
  /** Etsy'deki gerçek durumu SALT OKUNUR okut (api/pipeline/etsy-state), sonra run'ı tazele. */
  onCheckEtsyState: () => void;
  checkingState: boolean;
}) {
  const active = run.etsyListingState === 'active';
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
      <div className={`mt-4 rounded-md border-l-4 px-4 py-3 ${active ? 'border-l-state-done-ink bg-state-done' : 'border-l-gold bg-state-turn'}`}>
        <p className={`text-sm font-medium ${active ? 'text-state-done-ink' : 'text-state-turn-ink'}`}>
          {listingStateLabel(run.etsyListingState)}
          {run.etsyStateCheckedAt ? ` · son kontrol ${formatTr(run.etsyStateCheckedAt)}` : ''}
        </p>
        {active ? null : (
          <p className="mt-1 text-sm text-state-turn-ink">
            Hat ilanı Etsy&apos;ye <strong>taslak</strong> olarak aktarır. Son kontrolü yapıp Etsy panelinden
            yayına alman gerekiyor. Pinterest pini yalnız ilan Etsy&apos;de aktif okunduğunda atılır.
          </p>
        )}
        <button
          type="button"
          onClick={onCheckEtsyState}
          disabled={checkingState}
          className="mt-2 mr-4 text-sm font-medium underline disabled:opacity-60"
        >
          {checkingState ? 'Etsy okunuyor…' : 'Etsy durumunu kontrol et'}
        </button>
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
        <PinterestPanel run={run} onPin={onPinPinterest} pinning={pinning} />
      )}
    </Card>
  );
}
