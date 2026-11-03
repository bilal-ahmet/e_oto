'use client';

import { useState } from 'react';
import type { PinCopy, PipelineRun } from '@/types';
import { Button, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { apiFetch } from '@/lib/client/api';
import { formatTr } from '@/lib/format';
import { listingStateLabel } from '@/lib/status';
import { readJson } from './shared';

/** Pin gönderiminin ek seçenekleri (publish-pinterest gövdesi). */
export interface PinRequestOptions {
  boardId?: string;
  force?: boolean;
}

interface Board {
  id: string;
  name: string;
}

/**
 * Pinterest pin onay kapısı: metni Claude üretir, kullanıcı DÜZENLEYİP onaylar, sonra pinlenir.
 * Etsy listing'i taslak bırakıldığı için pin otomatik zincirlenmez — kullanıcı listing'i
 * Etsy panelinden aktive ettikten sonra buradan tetikler. Sunucu da pinlemeden önce ilanın
 * Etsy'de AKTİF olduğunu yeniden okur; değilse pin atılmaz (409 + sebep).
 *
 * Pano bu pin için seçilebilir; panelde seçili varsayılan pano DEĞİŞMEZ.
 */
export function PinterestPanel({
  run,
  onPin,
  pinning,
}: {
  run: PipelineRun;
  onPin: (copy: PinCopy, opts: PinRequestOptions) => void;
  pinning: boolean;
}) {
  const runId = run.id;
  const [copy, setCopy] = useState<PinCopy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<string>('');
  // Önceki POST /pins denemesinin sonucu belirsiz (sunucu mutabakatta pin bulamadı) — bilinçli tekrar.
  const uncertain = Boolean(run.pinAttemptedAt && !run.pinterestPinId);
  const [force, setForce] = useState(false);

  async function prepare() {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const [res, boardsRes] = await Promise.all([
        apiFetch('/api/pipeline/pin-copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: runId }),
        }),
        apiFetch('/api/auth/pinterest/boards'),
      ]);
      const data = await readJson<{ copy?: PinCopy; warning?: string; error?: string }>(res);
      if (!res.ok || !data.copy) throw new Error(data.error ?? 'Pin metni alınamadı.');
      setCopy(data.copy);
      if (data.warning) setWarning(data.warning);

      const b = await readJson<{ boards?: Board[]; selectedBoardId?: string | null; error?: string }>(boardsRes);
      if (boardsRes.ok) {
        setBoards(b.boards ?? []);
        setBoardId(run.pinterestBoardId ?? b.selectedBoardId ?? b.boards?.[0]?.id ?? '');
      } else {
        setError(`Pano listesi alınamadı: ${b.error ?? boardsRes.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pin metni alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  const stateLine = (
    <p className={`mt-1 text-sm ${run.etsyListingState === 'active' ? 'text-state-done-ink' : 'text-ink-muted'}`}>
      {listingStateLabel(run.etsyListingState)}
      {run.etsyStateCheckedAt ? ` · son kontrol ${formatTr(run.etsyStateCheckedAt)}` : ''}
      {' — '}pinlemeden hemen önce Etsy&apos;den tekrar okunur; aktif değilse pin atılmaz.
    </p>
  );

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
        {stateLine}
        {error ? <p className="mt-2 text-sm text-state-error-ink">{error}</p> : null}
      </div>
    );
  }

  const update = (patch: Partial<PinCopy>) => setCopy({ ...copy, ...patch });

  return (
    <div className="mt-5 border-t border-sand pt-5">
      <h3 className="text-sm font-semibold text-ink">Pinterest pin metni</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Pinlemeden önce düzenleyebilirsiniz. Pin, Etsy listing&apos;ine bağlanır.
      </p>
      {stateLine}
      {warning ? <p className="mt-2 text-sm text-state-turn-ink">{warning}</p> : null}

      <div className="mt-4 space-y-4">
        <Field label="Pano" htmlFor="pin-board" hint="Yalnız bu pin için; paneldeki varsayılan pano değişmez.">
          <Select id="pin-board" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
            {boards.length === 0 ? <option value="">Varsayılan pano</option> : null}
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
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
        {uncertain ? (
          <label className="flex items-start gap-2 text-sm text-state-turn-ink">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-1" />
            <span>
              Önceki pin denemesinin sonucu belirsiz ve panoda bu ilana bağlı pin bulunamadı. Pinterest&apos;te
              kontrol ettim, <strong>yine de yeni pin at</strong>.
            </span>
          </label>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => onPin(copy, { boardId: boardId || undefined, force: uncertain && force })}
          disabled={pinning || !copy.title.trim()}
        >
          {pinning ? <Spinner /> : null}
          {pinning ? 'Pinleniyor…' : uncertain && force ? 'Yine de pinle' : 'Onayla ve pinle'}
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
