'use client';

import { useState } from 'react';
import type { PinCopy } from '@/types';
import { Button, Spinner } from '@/components/ui';
import { readJson } from './shared';
import { LabeledField } from './LabeledField';

/**
 * Pinterest pin onay kapısı: metni Claude üretir, kullanıcı DÜZENLEYİP onaylar, sonra pinlenir.
 * Etsy listing'i taslak bırakıldığı için pin otomatik zincirlenmez — kullanıcı listing'i
 * Etsy panelinden aktive ettikten sonra buradan tetikler (ölü linke pin atılmasın).
 */
export function PinterestPanel({
  runId,
  onPin,
  pinning,
}: {
  runId: string;
  onPin: (copy: PinCopy) => void;
  pinning: boolean;
}) {
  const [copy, setCopy] = useState<PinCopy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function prepare() {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch('/api/pipeline/pin-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: runId }),
      });
      const data = await readJson<{ copy?: PinCopy; warning?: string; error?: string }>(res);
      if (!res.ok || !data.copy) throw new Error(data.error ?? 'Pin metni alınamadı.');
      setCopy(data.copy);
      if (data.warning) setWarning(data.warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pin metni alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  if (!copy) {
    return (
      <div className="mt-5 border-t border-zinc-100 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => void prepare()} disabled={loading}>
            {loading ? <Spinner /> : null}
            {loading ? 'Metin hazırlanıyor…' : "Pinterest'te pinle"}
          </Button>
          <a href="/api/auth/pinterest/start" className="text-xs text-zinc-400 hover:text-zinc-600">
            Pinterest hesabını bağla
          </a>
        </div>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  const update = (patch: Partial<PinCopy>) => setCopy({ ...copy, ...patch });

  return (
    <div className="mt-5 border-t border-zinc-100 pt-5">
      <h3 className="text-sm font-semibold text-zinc-900">Pinterest pin metni</h3>
      <p className="mt-1 text-sm text-zinc-500">
        Pinlemeden önce düzenleyebilirsiniz. Pin, Etsy listing&apos;ine bağlanır — listing&apos;i
        Etsy panelinden aktive ettiğinizden emin olun.
      </p>
      {warning ? <p className="mt-2 text-sm text-amber-700">{warning}</p> : null}

      <div className="mt-3 space-y-3">
        <LabeledField label="Başlık" hint={`${copy.title.length}/100`}>
          <input
            value={copy.title}
            maxLength={100}
            onChange={(e) => update({ title: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </LabeledField>
        <LabeledField label="Açıklama" hint={`${copy.description.length}/500`}>
          <textarea
            value={copy.description}
            maxLength={500}
            rows={4}
            onChange={(e) => update({ description: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </LabeledField>
        <LabeledField label="Alternatif metin (erişilebilirlik)" hint={`${copy.altText.length}/500`}>
          <textarea
            value={copy.altText}
            maxLength={500}
            rows={2}
            onChange={(e) => update({ altText: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </LabeledField>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => onPin(copy)} disabled={pinning || !copy.title.trim()}>
          {pinning ? <Spinner /> : null}
          {pinning ? 'Pinleniyor…' : 'Onayla ve pinle'}
        </Button>
        <Button variant="ghost" onClick={() => void prepare()} disabled={loading || pinning}>
          {loading ? <Spinner /> : null}
          Metni yeniden üret
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
