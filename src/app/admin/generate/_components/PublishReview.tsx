'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { PipelineRun } from '@/types';
import { Button, Card, FRAMED_IMG, Field, Framed, Input, SectionHeading, Spinner } from '@/components/ui';
import { mockupAspectClass, fileLabel, filesSummary } from './shared';
import { PipelineWarnings } from './PipelineWarnings';
import { SeoSummary } from './SeoSummary';

export function PublishReview({
  run,
  busy,
  regenIndex,
  onPublish,
  onRegenerate,
  onReject,
}: {
  run: PipelineRun;
  busy: boolean;
  regenIndex: number | null;
  onPublish: (price: number, thumbnailIndex: number) => void;
  onRegenerate: (index: number) => void;
  onReject: () => void;
}) {
  const [price, setPrice] = useState(5.0);
  const files = run.digitalFileUrls ? Object.entries(run.digitalFileUrls) : [];
  const mockups = run.mediaUrls?.mockups ?? [];
  const filledMockups = mockups.filter(Boolean).length;
  const imageCount = filledMockups + (run.mediaUrls?.sizeGuide ? 1 : 0);

  // Thumbnail = ilk dolu mockup (varsayılan). Kullanıcı değiştirebilir.
  const firstFilled = mockups.findIndex(Boolean);
  const [thumbnailIndex, setThumbnailIndex] = useState(firstFilled >= 0 ? firstFilled : 0);

  return (
    <Card>
      <SectionHeading
        no="04"
        title="Yayın onayı"
        description="İlan Etsy'de taslak olarak oluşturulur; son kontrolü yapıp Etsy panelinden kendin yayına alırsın."
      />

      {/*
        KARAR BANDI — en kritik karar (fiyat + yayınla) eskiden sayfanın EN ALTINDA,
        w-28'lik küçük bir input olarak duruyordu. Artık üstte ve ekranda kalıyor.
      */}
      <div className="sticky top-4 z-10 -mx-5 mb-5 border-y border-sand bg-shade px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Field label="Fiyat (USD)" htmlFor="publish-price">
            <div className="relative w-32">
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-ink-faint"
              >
                $
              </span>
              <Input
                id="publish-price"
                type="number"
                min={0.2}
                step={0.5}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="pl-7 font-mono text-base tabular-nums"
              />
            </div>
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => onPublish(price, thumbnailIndex)}
              disabled={busy || imageCount === 0 || regenIndex !== null}
            >
              {busy ? <Spinner /> : null}
              Etsy&apos;ye yayınla
            </Button>
            <Button variant="ghost" onClick={onReject} disabled={busy}>
              Bu üretimi bırak
            </Button>
          </div>
        </div>

        <p className="mt-3 font-mono text-label uppercase tracking-label tabular-nums text-ink-muted">
          {imageCount} görsel{run.mediaUrls?.video ? ' · 1 video' : ''} · {files.length} JPG · kapak #
          {thumbnailIndex + 1}
        </p>

        {/* Engelleyici uyarı butonun 300px altında değil, kararın YANINDA. */}
        {imageCount === 0 ? (
          <p className="mt-2 text-sm font-medium text-state-error-ink">
            Etsy en az 1 görsel ister. fal kredisi gelince mockup üret ya da ölçü görseli ekle.
          </p>
        ) : null}
      </div>

      <PipelineWarnings run={run} />

      {/* Mockup'lar */}
      <div className="mt-5">
        <p className="font-mono text-label uppercase tracking-label text-ink-muted">
          Mockuplar {filledMockups}/8 — kapak olacak kareye tıkla, beğenmediğini yeniden üret
        </p>
        <div className="mt-3 grid grid-cols-2 gap-5 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => {
            const url = mockups[i];
            const isThumb = thumbnailIndex === i && Boolean(url);
            const isRegen = regenIndex === i;
            return (
              <div key={i}>
                <button
                  onClick={() => url && setThumbnailIndex(i)}
                  disabled={!url}
                  className="block w-full text-left"
                  aria-label={`Mockup ${i + 1} kapak yap`}
                  aria-pressed={isThumb}
                >
                  <Framed ratio={mockupAspectClass(run.productType)} selected={isThumb}>
                    {url ? (
                      <Image
                        src={url}
                        alt={`Mockup ${i + 1}`}
                        width={300}
                        height={225}
                        unoptimized
                        className={FRAMED_IMG}
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center font-mono text-label uppercase tracking-label text-ink-faint">
                        boş
                      </div>
                    )}
                    {isRegen ? (
                      <span className="absolute inset-0 grid place-items-center bg-paper/70">
                        <Spinner className="text-gold-deep" />
                      </span>
                    ) : null}
                  </Framed>
                </button>
                {/* Kapak işareti ve "yeniden üret" mat'ın DIŞINDA — eserin üstünü
                    kapatmıyor ve "yeniden üret" artık hover'da belirmiyor, hep görünür. */}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="font-mono text-label uppercase tracking-label text-gold-deep">
                    {isThumb ? 'Kapak' : ''}
                  </span>
                  <button
                    onClick={() => onRegenerate(i)}
                    disabled={busy || isRegen || regenIndex !== null}
                    className="font-mono text-label uppercase tracking-label text-ink-faint transition-colors hover:text-ink disabled:opacity-50"
                  >
                    {isRegen ? 'Üretiliyor…' : '↻ Yeniden üret'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Video + ölçü görseli */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Zoom video</p>
          {run.mediaUrls?.video ? (
            <>
              <video src={run.mediaUrls.video} controls className="mt-2 w-full rounded-lg ring-1 ring-sand" />
              <a
                href={run.mediaUrls.video}
                download
                className="mt-1 inline-block text-sm text-gold-deep hover:underline"
              >
                mp4 indir
              </a>
            </>
          ) : (
            <p className="mt-2 text-sm text-state-turn-ink">
              yok — video üretilemedi. Yayın devam eder ama listing videosuz olur.
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ölçü görseli</p>
          {run.mediaUrls?.sizeGuide ? (
            <Image
              src={run.mediaUrls.sizeGuide}
              alt="Ölçü görseli"
              width={300}
              height={300}
              unoptimized
              className="mt-2 w-full rounded-lg object-contain ring-1 ring-sand"
            />
          ) : run.productType === 'tv' ? (
            <p className="mt-2 text-sm text-ink-faint">
              TV ürününde ölçü görseli kullanılmaz.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-faint">
              yok — <code>public/templates/size-guide.png</code> ekleyin
            </p>
          )}
        </div>
      </div>

      {/* Dijital dosyalar */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          {filesSummary(run.productType, files.length)}
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {files.map(([key, url]) => (
            <li key={key} className="text-sm">
              <a href={url} target="_blank" rel="noreferrer" className="text-gold-deep hover:underline">
                {fileLabel(key)}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {run.seo ? <SeoSummary seo={run.seo} /> : null}

    </Card>
  );
}
