'use client';

import { useState } from 'react';
import { Button, Card, Spinner } from '@/components/ui';
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
    <Card className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Rakip SEO Analizi <span className="text-sm font-normal text-zinc-400">(opsiyonel)</span></h2>
          <p className="text-sm text-zinc-500">
            İyi performans gösteren bir Etsy ürününün linkini gir; sistem o nişten özgün SEO çıkarsın.
            Bağlarsan, SEO seçtiğin görsele göre üretilirken bu nişe/keyword&apos;lere yönlendirilir.
          </p>
        </div>
        {research ? (
          <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
            Bağlı #{research.id}
          </span>
        ) : null}
      </div>

      {!research ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.etsy.com/listing/123456789/..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
          <Button onClick={analyze} disabled={analyzing || !url.trim()}>
            {analyzing ? <Spinner /> : null}
            {analyzing ? 'Analiz ediliyor…' : 'Analiz Et'}
          </Button>
        </div>
      ) : null}

      {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}

      {research ? (
        <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Kaynak (rakip)</p>
              <p className="mt-1 text-sm text-zinc-800">{research.source.title}</p>
              <p className="mt-1 text-xs text-zinc-500">
                ❤ {research.source.numFavorers} favori · {research.source.views} görüntülenme · taxonomy{' '}
                {research.source.taxonomyId || '—'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {research.source.tags.map((t, i) => (
                  <span key={i} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-rose-500">Üretilen (özgün)</p>
              <p className="mt-1 text-sm font-medium text-zinc-900">{research.generated.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {research.generated.tags.map((t, i) => (
                  <span key={i} className="rounded-md bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Üretilen açıklama{' '}
              <span className="font-normal normal-case tracking-normal text-amber-600">
                — sadece fikir amaçlı, listing&apos;e geçmez
              </span>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{research.generated.description}</p>
            <p className="mt-1.5 text-xs text-zinc-400">
              Üretime yalnızca yukarıdaki <strong>başlık ve etiketler</strong> referans olarak taşınır.
              Listing açıklaması, seçtiğin görselden yazılan hook + sabit şablondan oluşur.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              Bu analiz üretime bağlandı; aşağıdan prompt girip başlayabilirsin.
            </span>
            <Button variant="ghost" onClick={onClear}>
              Bağı kaldır
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
