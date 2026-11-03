'use client';

/**
 * "Etsy durumlarını kontrol et" — listing'i olan run'ların Etsy'deki gerçek durumunu SALT OKUNUR
 * okutur. Sayfa sayfa ister (her istek ~20 ilan) ki tek istek proxy zaman aşımına takılmasın.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { apiFetch } from '@/lib/client/api';

export function EtsyStateCheckButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    let offset = 0;
    let checked = 0;
    try {
      for (let guard = 0; guard < 100; guard++) {
        const res = await apiFetch('/api/pipeline/etsy-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          results?: unknown[];
          hasMore?: boolean;
          nextOffset?: number;
        };
        if (!res.ok) throw new Error(data.error ?? `Sunucu ${res.status} döndü.`);
        checked += data.results?.length ?? 0;
        setProgress(`${checked} ilan okundu…`);
        if (!data.hasMore || data.nextOffset == null) break;
        offset = data.nextOffset;
      }
      setProgress(`${checked} ilan okundu.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kontrol çalıştırılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={run} disabled={busy}>
        {busy ? 'Okunuyor…' : 'Etsy durumlarını kontrol et'}
      </Button>
      {progress ? <span className="text-xs text-ink-muted">{progress}</span> : null}
      {error ? <span className="text-xs text-state-error-ink">{error}</span> : null}
    </span>
  );
}
