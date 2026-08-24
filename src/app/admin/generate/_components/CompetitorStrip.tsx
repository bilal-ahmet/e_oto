'use client';

import { useState } from 'react';
import { Alert, Button, Input, Spinner } from '@/components/ui';
import { type CompetitorAnalysis } from './shared';

export function CompetitorResearchPanel({
  research,
  onAnalyzed,
  onClear,
}: {
  research: CompetitorAnalysis | null;
  onAnalyzed: (r: CompetitorAnalysis) => void;
  onClear: () => void;
}) {
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function analyze() {
    if (!url.trim()) return;
    setAnalyzing(true);
    setErr(null);
    try {
      const res = await fetch('/api/competitor-research/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analiz başarısız.');
      onAnalyzed(data as CompetitorAnalysis);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Analiz başarısız.');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="mb-6 rounded-xs border border-sand bg-shade">
      {/*
        Bu panel OPSIYONEL bir on-adim ama eskiden asil formun ustunde tam genislikte
        bir karttı ve baslangic ekranini dagitiyordu. Artik tek satirlik bir serit;
        detaylar <details> icinde acilir (state gerekmez, klavye destegi bedava).
      */}
      {!research ? (
        <details className="group">
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="font-mono text-label uppercase tracking-label text-ink-muted">
              Rakip SEO analizi · opsiyonel
            </span>
            <span className="font-mono text-label uppercase tracking-label text-gold-deep">
              Aç / kapat
            </span>
          </summary>
          <div className="border-t border-sand px-4 py-4">
            <p className="max-w-2xl text-sm leading-relaxed text-ink-body">
              İyi performans gösteren bir Etsy ürününün linkini gir; sistem o nişten özgün SEO
              çıkarsın. Bağlarsan, SEO seçtiğin görsele göre üretilirken bu nişe/keyword&apos;lere
              yönlendirilir.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.etsy.com/listing/123456789/..."
                aria-label="Rakip Etsy ürün linki"
              />
              <Button onClick={analyze} disabled={analyzing || !url.trim()} className="shrink-0">
                {analyzing ? <Spinner /> : null}
                {analyzing ? 'Analiz ediliyor…' : 'Analiz et'}
              </Button>
            </div>
            {err ? (
              <Alert tone="danger" compact className="mt-3">
                {err}
              </Alert>
            ) : null}
          </div>
        </details>
      ) : null}

      {research ? (
        <details className="group">
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 border-l-2 border-l-gold px-4 py-3">
            <span className="min-w-0 truncate font-mono text-label uppercase tracking-label text-gold-deep">
              ✓ Rakip analizi bağlı · #{research.id} · {research.source.title}
            </span>
            <span className="font-mono text-label uppercase tracking-label text-ink-muted">
              Detaylar
            </span>
          </summary>
          <div className="space-y-4 border-t border-sand px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Kaynak (rakip)</p>
              <p className="mt-1 text-sm text-ink">{research.source.title}</p>
              <p className="mt-1 text-xs text-ink-muted">
                ❤ {research.source.numFavorers} favori · {research.source.views} görüntülenme · taxonomy{' '}
                {research.source.taxonomyId || '—'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {research.source.tags.map((t, i) => (
                  <span key={i} className="rounded-md bg-shade px-2 py-0.5 text-xs text-ink-body">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gold-deep">Üretilen (özgün)</p>
              <p className="mt-1 text-sm font-medium text-ink">{research.generated.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {research.generated.tags.map((t, i) => (
                  <span key={i} className="rounded-md bg-shade px-2 py-0.5 text-xs text-gold-deep">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Üretilen açıklama{' '}
              <span className="font-normal normal-case tracking-normal text-gold-deep">
                — sadece fikir amaçlı, listing&apos;e geçmez
              </span>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-body">{research.generated.description}</p>
            <p className="mt-1.5 text-xs text-ink-faint">
              Üretime yalnızca yukarıdaki <strong>başlık ve etiketler</strong> referans olarak taşınır.
              Listing açıklaması, seçtiğin görselden yazılan hook + sabit şablondan oluşur.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted">
              Bu analiz üretime bağlandı; aşağıdan prompt girip başlayabilirsin.
            </span>
            <Button variant="ghost" onClick={onClear}>
              Bağı kaldır
            </Button>
          </div>
        </div>
        </details>
      ) : null}
    </div>
  );
}
