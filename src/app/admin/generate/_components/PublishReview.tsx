'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { PipelineRun } from '@/types';
import { defaultPrice } from '@/lib/product/pricing';
import { Button, Card, FRAMED_IMG, Field, Framed, Input, SectionHeading, Select, Spinner } from '@/components/ui';
import { apiFetch } from '@/lib/client/api';
import { mockupAspectClass, fileLabel, filesSummary } from './shared';
import { PipelineWarnings } from './PipelineWarnings';
import { SeoSummary } from './SeoSummary';
import { toEtsySafe, validateListingSeo } from '@/lib/etsy/text-rules';

export function PublishReview({
  run,
  busy,
  regenIndex,
  onPublish,
  onRegenerate,
  onReject,
  onBackToSeo,
}: {
  run: PipelineRun;
  busy: boolean;
  regenIndex: number | null;
  onPublish: (price: number, thumbnailIndex: number, shopSectionId: number | null) => void;
  onRegenerate: (index: number) => void;
  onReject: () => void;
  /** Gate 3 → gate 2: metin düzeltmesi için (üretilmiş medya/dosyalar korunur). */
  onBackToSeo: () => void;
}) {
  const [price, setPrice] = useState(() => defaultPrice(run.productType));
  const files = run.digitalFileUrls ? Object.entries(run.digitalFileUrls) : [];
  const mockups = run.mediaUrls?.mockups ?? [];
  const filledMockups = mockups.filter(Boolean).length;
  // +1: eserin düz önizlemesi (yayında 2. görsel olarak eklenir — Etsy dijital ürün kuralı). Tavan 10.
  const imageCount = Math.min(filledMockups + 1 + (run.mediaUrls?.sizeGuide ? 1 : 0), 10);

  // Etsy mağaza bölümü (section) — liste bir kez çekilir; varsayılan ürün tipinin son seçimidir.
  const [sections, setSections] = useState<{ id: number; title: string }[]>([]);
  const [sectionId, setSectionId] = useState<string>('');
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/etsy/sections?productType=${run.productType ?? 'print'}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          sections?: { id: number; title: string }[];
          defaultSectionId?: number | null;
          error?: string;
        };
        if (!alive) return;
        if (!res.ok) throw new Error(data.error ?? `Sunucu ${res.status} döndü.`);
        setSections(data.sections ?? []);
        setSectionId(data.defaultSectionId ? String(data.defaultSectionId) : '');
      })
      .catch((e: unknown) => {
        if (alive) setSectionsError(e instanceof Error ? e.message : 'Bölümler alınamadı.');
      });
    return () => {
      alive = false;
    };
  }, [run.productType]);
  // Sunucu (publishToEtsy) aynı kuralları Etsy'ye istek atmadan uygular; burada önceden gösterilir.
  const seoIssues = run.seo ? validateListingSeo(toEtsySafe(run.seo)) : [];
  const blocked = filledMockups === 0 || seoIssues.length > 0;

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
      <div className="sticky top-4 z-10 -mx-5 mb-5 border-y border-sand bg-shade/95 px-5 py-4 backdrop-blur-sm">
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

          <Field
            label="Etsy bölümü"
            htmlFor="publish-section"
            hint={sectionsError ?? 'Bölümler Etsy panelinden açılır; seçim bu ürün tipi için hatırlanır.'}
          >
            <Select
              id="publish-section"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="w-56"
            >
              <option value="">Bölümsüz</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => onPublish(price, thumbnailIndex, sectionId ? Number(sectionId) : null)}
              disabled={busy || blocked || regenIndex !== null}
            >
              {busy ? <Spinner /> : null}
              Etsy&apos;ye yayınla
            </Button>
            <Button variant="ghost" onClick={onReject} disabled={busy}>
              Bu üretimi bırak
            </Button>
          </div>
        </div>

        <p className="mt-3 text-sm tabular-nums text-ink-muted">
          {imageCount} görsel{run.mediaUrls?.video ? ' · 1 video' : ''} · {files.length} JPG · kapak #
          {thumbnailIndex + 1}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Kapaktan sonra eserin düz önizlemesi eklenir — Etsy dijital üründe alıcının alacağı gerçek
          içeriğin önizlemesini istiyor.
        </p>

        {/* Engelleyici uyarı butonun 300px altında değil, kararın YANINDA. */}
        {filledMockups === 0 ? (
          <p className="mt-2 text-sm font-medium text-state-error-ink">
            En az 1 mockup gerekli — ilan eseri göstermeli (yalnız ölçü görseliyle yayınlanmaz). fal
            kredisi gelince mockup üret.
          </p>
        ) : null}
        {seoIssues.length > 0 ? (
          <div className="mt-2 text-sm font-medium text-state-error-ink">
            <p>Metinler Etsy kurallarına uymuyor — bu hâliyle Etsy&apos;ye gönderilmez:</p>
            <ul className="mt-1 space-y-0.5">
              {seoIssues.map((i, k) => (
                <li key={k}>• [{i.field}] {i.message}</li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" className="mt-2" onClick={onBackToSeo} disabled={busy}>
              Metinlere dön ve düzelt
            </Button>
            <p className="mt-1 font-normal text-ink-muted">
              Dosyalar, mockup&apos;lar ve video korunur; metin onayından sonra yeniden üretilmez.
            </p>
          </div>
        ) : null}
      </div>

      <PipelineWarnings run={run} />

      {/* Mockup'lar */}
      <div className="mt-5">
        <p className="text-base font-semibold text-ink">
          Mockuplar <span className="font-normal tabular-nums text-ink-muted">{filledMockups}/8</span>
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">
          Kapak olacak kareye tıkla; beğenmediğini “Yeniden üret” ile değiştir.
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
                      <div className="grid h-full w-full place-items-center text-sm text-ink-faint">
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
                  <span className="text-sm font-semibold text-gold-deep">
                    {isThumb ? '★ Kapak' : ''}
                  </span>
                  <button
                    onClick={() => onRegenerate(i)}
                    disabled={busy || isRegen || regenIndex !== null}
                    className="cursor-pointer rounded-full px-2 py-1 text-sm font-medium text-ink-muted transition-colors hover:bg-shade hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRegen ? 'Üretiliyor…' : '↻ Yeniden üret (~$0.04)'}
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
          <p className="text-sm font-semibold text-ink">Zoom video</p>
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
          <p className="text-sm font-semibold text-ink">Ölçü görseli</p>
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
              yok — ölçü görseli üretilemedi (sunucu loguna bak)
            </p>
          )}
        </div>
      </div>

      {/* Dijital dosyalar */}
      <div className="mt-5">
        <p className="text-sm font-semibold text-ink">
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
