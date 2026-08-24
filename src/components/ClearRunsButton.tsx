'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Spinner } from '@/components/ui';

/**
 * "Geçmişi temizle" — tüm pipeline kayıtlarını ve depodaki dosyalarını siler.
 *
 * Tek tıkla silmez: önce ne olacağını yazan bir onay kutusu açılır. Silme geri alınamadığı ve
 * devam eden işleri de kapsadığı için kullanıcının ne sildiğini görmeden onaylamaması gerekir.
 */
export function ClearRunsButton({ total, active }: { total: number; active: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clearAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/runs', { method: 'DELETE' });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error ?? `Temizlenemedi (HTTP ${res.status}).`);
      setConfirming(false);
      router.refresh(); // server component listesini yeniden çek
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Temizlenemedi.');
    } finally {
      setBusy(false);
    }
  }

  if (total === 0) return null;

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="font-mono text-label uppercase tracking-label text-ink-faint transition-colors hover:text-state-error-ink"
      >
        Geçmişi temizle
      </button>
    );
  }

  return (
    <Alert tone="danger" title={`${total} kaydın tamamı silinsin mi?`}>
      <ul className="space-y-0.5">
        <li>• Kayıtlarla birlikte üretilen görseller, baskı dosyaları ve videolar da silinir.</li>
        <li>• Etsy’de yayınlanmış ilanlar etkilenmez, onlar yerinde kalır.</li>
        {active > 0 ? (
          <li className="font-medium">
            • Şu an devam eden veya onay bekleyen {active} iş var — onlar da silinecek.
          </li>
        ) : null}
        <li>• Bu işlem geri alınamaz.</li>
      </ul>
      {error ? <p className="mt-2 font-medium">{error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        {/* `danger` varyantı yalnızca geri alınamaz, veri silen işler için (bkz. ui.tsx).
            Vazgeçmek zararsız bir çıkış olduğu için `ghost`. */}
        <Button variant="danger" size="sm" onClick={clearAll} disabled={busy}>
          {busy ? <Spinner /> : null}
          Evet, hepsini sil
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={busy}
        >
          Vazgeç
        </Button>
      </div>
    </Alert>
  );
}
