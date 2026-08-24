'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { PipelineRun } from '@/types';
import { Button, Card, Spinner } from '@/components/ui';
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
      <h2 className="text-lg font-semibold text-zinc-900">Yayın onayı</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Onaylayınca Etsy taslak listing&apos;i oluşturulur: {imageCount} görsel
        {run.mediaUrls?.video ? ' + 1 video' : ''} + {files.length} JPG yüklenir ve öznitelikler yazılır.{' '}
        <strong>Thumbnail</strong> seçtiğin mockup olur. İlan <strong>taslak</strong> kalır — son kontrolü
        yapıp Etsy panelinden kendin yayına alırsın.
      </p>

      <PipelineWarnings run={run} />

      {/* Mockup'lar */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Mockup&apos;lar ({filledMockups}/8) — thumbnail seç ⭐ veya beğenmediğini yeniden üret ↻
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => {
            const url = mockups[i];
            const isThumb = thumbnailIndex === i && Boolean(url);
            const isRegen = regenIndex === i;
            return (
              <div
                key={i}
                className={`overflow-hidden rounded-lg ring-1 ${
                  isThumb ? 'ring-2 ring-rose-500' : 'ring-zinc-200'
                }`}
              >
                <button
                  onClick={() => url && setThumbnailIndex(i)}
                  disabled={!url}
                  className="relative block w-full"
                >
                  {url ? (
                    <Image
                      src={url}
                      alt={`Mockup ${i + 1}`}
                      width={300}
                      height={225}
                      unoptimized
                      className={`${mockupAspectClass(run.productType)} w-full object-cover`}
                    />
                  ) : (
                    <div className={`grid ${mockupAspectClass(run.productType)} w-full place-items-center bg-zinc-100 text-xs text-zinc-400`}>
                      boş
                    </div>
                  )}
                  {isRegen ? (
                    <span className="absolute inset-0 grid place-items-center bg-white/70">
                      <Spinner className="text-rose-600" />
                    </span>
                  ) : null}
                  {isThumb ? (
                    <span className="absolute left-1 top-1 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      ⭐ Thumbnail
                    </span>
                  ) : null}
                </button>
                <button
                  onClick={() => onRegenerate(i)}
                  disabled={busy || isRegen || regenIndex !== null}
                  className="w-full bg-zinc-50 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                >
                  {isRegen ? 'Üretiliyor…' : '↻ Yeniden üret'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Video + ölçü görseli */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Zoom video</p>
          {run.mediaUrls?.video ? (
            <>
              <video src={run.mediaUrls.video} controls className="mt-2 w-full rounded-lg ring-1 ring-zinc-200" />
              <a
                href={run.mediaUrls.video}
                download
                className="mt-1 inline-block text-sm text-rose-600 hover:underline"
              >
                mp4 indir
              </a>
            </>
          ) : (
            <p className="mt-2 text-sm text-amber-700">
              yok — video üretilemedi. Yayın devam eder ama listing videosuz olur.
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Ölçü görseli</p>
          {run.mediaUrls?.sizeGuide ? (
            <Image
              src={run.mediaUrls.sizeGuide}
              alt="Ölçü görseli"
              width={300}
              height={300}
              unoptimized
              className="mt-2 w-full rounded-lg object-contain ring-1 ring-zinc-200"
            />
          ) : run.productType === 'tv' ? (
            <p className="mt-2 text-sm text-zinc-400">
              TV ürününde ölçü görseli kullanılmaz.
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">
              yok — <code>public/templates/size-guide.png</code> ekleyin
            </p>
          )}
        </div>
      </div>

      {/* Dijital dosyalar */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          {filesSummary(run.productType, files.length)}
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {files.map(([key, url]) => (
            <li key={key} className="text-sm">
              <a href={url} target="_blank" rel="noreferrer" className="text-rose-600 hover:underline">
                {fileLabel(key)}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {run.seo ? <SeoSummary seo={run.seo} /> : null}

      <div className="mt-5 flex items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700">Fiyat (USD)</label>
          <input
            type="number"
            min={0.2}
            step={0.5}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="mt-1.5 w-28 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>
        <Button onClick={() => onPublish(price, thumbnailIndex)} disabled={busy || imageCount === 0 || regenIndex !== null}>
          {busy ? <Spinner /> : null}
          Etsy&apos;ye yayınla
        </Button>
        <Button variant="ghost" onClick={onReject} disabled={busy}>
          İptal
        </Button>
      </div>
      {imageCount === 0 ? (
        <p className="mt-2 text-xs text-amber-600">
          Etsy en az 1 görsel ister. fal kredisi gelince mockup üret ya da ölçü görseli ekle.
        </p>
      ) : null}
    </Card>
  );
}
