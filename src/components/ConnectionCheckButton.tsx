'use client';

/**
 * "Bağlantıyı test et" — sağlayıcıya SALT OKUNUR bir çağrı attırır (`?probe=1`), sonuç sunucuda
 * `app_settings`'e yazılır; ardından sayfa yenilenip kart güncel durumu gösterir.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { apiFetch } from '@/lib/client/api';

export function ConnectionCheckButton({ provider }: { provider: 'etsy' | 'pinterest' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/auth/${provider}/status?probe=1`);
      if (!res.ok) throw new Error(`Sunucu ${res.status} döndü.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kontrol çalıştırılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={check} disabled={busy}>
        {busy ? 'Kontrol ediliyor…' : 'Bağlantıyı test et'}
      </Button>
      {error ? <span className="text-xs text-state-error-ink">{error}</span> : null}
    </span>
  );
}
