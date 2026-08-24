'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';

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
        className="text-sm font-medium text-zinc-400 transition-colors hover:text-red-600"
      >
        Geçmişi temizle
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-sm font-medium text-red-900">{total} kaydın tamamı silinsin mi?</p>
      <ul className="mt-1.5 space-y-0.5 text-sm text-red-800">
        <li>• Kayıtlarla birlikte üretilen görseller, baskı dosyaları ve videolar da silinir.</li>
        <li>• Etsy’de yayınlanmış ilanlar etkilenmez, onlar yerinde kalır.</li>
        {active > 0 ? (
          <li className="font-medium">
            • Şu an devam eden veya onay bekleyen {active} iş var — onlar da silinecek.
          </li>
        ) : null}
        <li>• Bu işlem geri alınamaz.</li>
      </ul>
      {error ? <p className="mt-2 text-sm font-medium text-red-700">{error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={clearAll}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? <Spinner /> : null}
          Evet, hepsini sil
        </button>
        <button
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={busy}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-red-100 disabled:opacity-50"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}
