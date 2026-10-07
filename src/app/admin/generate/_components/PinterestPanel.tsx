'use client';

import { useState } from 'react';
import type { PinCopy } from '@/types';
import { Button, Field, Input, Spinner, Textarea } from '@/components/ui';
import { apiFetch } from '@/lib/client/api';
import { readJson } from './shared';

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
      const res = await apiFetch('/api/pipeline/pin-copy', {
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
      <div className="mt-5 border-t border-sand pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => void prepare()} disabled={loading}>
            {loading ? <Spinner /> : null}
            {loading ? 'Metin hazırlanıyor…' : "Pinterest'te pinle"}
          </Button>
          <a
            href="/api/auth/pinterest/start"
            className="text-sm font-medium text-ink-muted underline decoration-sand underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Pinterest hesabını bağla
          </a>
        </div>
        {error ? <p className="mt-2 text-sm text-state-error-ink">{error}</p> : null}
      </div>
    );
  }

  const update = (patch: Partial<PinCopy>) => setCopy({ ...copy, ...patch });

  return (
    <div className="mt-5 border-t border-sand pt-5">
      <h3 className="text-sm font-semibold text-ink">Pinterest pin metni</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Pinlemeden önce düzenleyebilirsiniz. Pin, Etsy listing&apos;ine bağlanır — listing&apos;i
        Etsy panelinden aktive ettiğinizden emin olun.
      </p>
      {warning ? <p className="mt-2 text-sm text-state-turn-ink">{warning}</p> : null}

      <div className="mt-4 space-y-4">
        <Field label="Başlık" htmlFor="pin-title" counter={{ value: copy.title.length, max: 100 }}>
          <Input
            id="pin-title"
            value={copy.title}
            maxLength={100}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
        <Field label="Açıklama" htmlFor="pin-desc" counter={{ value: copy.description.length, max: 500 }}>
          <Textarea
            id="pin-desc"
            value={copy.description}
            maxLength={500}
            rows={4}
            onChange={(e) => update({ description: e.target.value })}
          />
        </Field>
        <Field
          label="Alternatif metin"
          htmlFor="pin-alt"
          hint="Görme engelli kullanıcılar için görselin kısa tarifi."
          counter={{ value: copy.altText.length, max: 500 }}
        >
          <Textarea
            id="pin-alt"
            value={copy.altText}
            maxLength={500}
            rows={2}
            onChange={(e) => update({ altText: e.target.value })}
          />
        </Field>
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
      {error ? <p className="mt-2 text-sm text-state-error-ink">{error}</p> : null}
    </div>
  );
}
