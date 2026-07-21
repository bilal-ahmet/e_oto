'use client';

/**
 * Pin'in atılacağı board'u seçtiren küçük client bileşen (PinterestConnection kartının içinde).
 *
 * Board listesi SUNUCUDA çekilir ve prop olarak gelir; burada yalnızca seçim (POST) yapılır.
 * Böylece bileşenin effect'e ve açılışta setState'e ihtiyacı kalmaz (react-hooks/set-state-in-effect).
 * Seçim app_settings'e yazılır — board ID'sini elle bulup env'e yazmak ve redeploy gerekmez.
 */

import { useState } from 'react';
import { Button } from '@/components/ui';
import type { PinterestBoard } from '@/lib/pinterest/boards';

export function PinterestBoardPicker({
  boards,
  initialSelectedId,
  loadError,
}: {
  boards: PinterestBoard[];
  initialSelectedId: string | null;
  loadError: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function select(boardId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/pinterest/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Board seçimi kaydedilemedi.');
      setSelectedId(boardId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Board seçimi kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <p className="mt-3 text-sm text-red-700">Board listesi alınamadı: {loadError}</p>;
  }

  if (boards.length === 0) {
    return (
      <p className="mt-3 text-sm text-amber-800">
        Hesapta hiç board yok — Pinterest&apos;te bir board oluşturup bu sayfayı yenileyin.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-zinc-700">Pin atılacak board</p>
      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {boards.map((b) => {
          const active = b.id === selectedId;
          return (
            <Button
              key={b.id}
              variant={active ? 'primary' : 'ghost'}
              disabled={saving}
              onClick={() => void select(b.id)}
              className="px-3 py-1.5"
            >
              {active ? '✓ ' : ''}
              {b.name}
              {b.privacy !== 'PUBLIC' ? (
                <span className={active ? 'text-rose-100' : 'text-zinc-400'}>(gizli)</span>
              ) : null}
            </Button>
          );
        })}
      </div>
      {!selectedId ? (
        <p className="mt-2 text-sm text-amber-800">Henüz board seçilmedi — seçmeden pin atılamaz.</p>
      ) : null}
    </div>
  );
}
