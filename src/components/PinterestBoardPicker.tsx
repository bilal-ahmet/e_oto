'use client';

/**
 * Pin'in atılacağı board'u seçtiren küçük client bileşen (PinterestConnection kartının içinde).
 *
 * Board listesi SUNUCUDA çekilir ve prop olarak gelir; burada yalnızca seçim (POST) yapılır.
 * Böylece bileşenin effect'e ve açılışta setState'e ihtiyacı kalmaz (react-hooks/set-state-in-effect).
 * Seçim app_settings'e yazılır — board ID'sini elle bulup env'e yazmak ve redeploy gerekmez.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import type { PinterestBoard } from '@/lib/pinterest/boards';

/**
 * Yanıtı güvenle okur ve hatalıysa fırlatır.
 *
 * NEDEN doğrudan res.json() DEĞİL: route'a hiç ulaşılamadığında (proxy 502/504, dağıtım anı)
 * gövde JSON değil HTML olur; res.json() o zaman "Unexpected token '<'" fırlatır ve kullanıcı
 * gerçek sorunu (ağ geçidi zaman aşımı) göremez.
 */
async function readJson<T>(res: Response, fallbackMessage: string): Promise<T> {
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      res.ok
        ? fallbackMessage
        : `Sunucu ${res.status} döndü (yanıt JSON değil). İşlem zaman aşımına uğramış olabilir — sayfayı yenileyip durumu kontrol edin.`,
    );
  }
  const parsed = data as { error?: string };
  if (!res.ok) throw new Error(parsed.error ?? fallbackMessage);
  return parsed as T;
}

export function PinterestBoardPicker({
  boards,
  initialSelectedId,
  loadError,
  sandbox,
}: {
  boards: PinterestBoard[];
  initialSelectedId: string | null;
  loadError: string | null;
  /** Sandbox'ta board pinterest.com'dan açılamaz — boş liste mesajı buna göre değişir. */
  sandbox: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');

  async function select(boardId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/pinterest/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId }),
      });
      await readJson(res, 'Board seçimi kaydedilemedi.');
      setSelectedId(boardId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Board seçimi kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Board'u Pinterest'ten siler. Geri alınamaz (içindeki pinler de gider) — bu yüzden onay istenir.
   * Sandbox board'ları pinterest.com'da görünmediğinden silmenin tek yolu burası.
   */
  async function remove(board: PinterestBoard) {
    if (!confirm(`"${board.name}" board'u ve içindeki tüm pinler kalıcı olarak silinecek. Emin misiniz?`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/pinterest/boards?boardId=${encodeURIComponent(board.id)}`, {
        method: 'DELETE',
      });
      await readJson(res, 'Board silinemedi.');
      if (selectedId === board.id) setSelectedId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Board silinemedi.');
      // Zaman aşımında silme sunucu tarafında TAMAMLANMIŞ olabilir — listeyi tazele ki
      // kullanıcı hata mesajına bakıp board'un hâlâ durduğunu sanmasın.
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  /** Board'u API üzerinden yaratır; sunucu bileşenini tazeleyerek listeye düşmesini sağlar. */
  async function create() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/pinterest/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await readJson<{ selectedBoardId?: string }>(res, 'Board oluşturulamadı.');
      setSelectedId(data.selectedBoardId ?? null);
      setNewName('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Board oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  }

  const createForm = (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="Board adı (örn. Wall Art Prints)"
        disabled={saving}
        className="w-64 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
      />
      <Button onClick={() => void create()} disabled={saving || !newName.trim()} className="px-3 py-1.5">
        {saving ? 'Oluşturuluyor…' : 'Board oluştur'}
      </Button>
    </div>
  );

  if (loadError) {
    return <p className="mt-3 text-sm text-red-700">Board listesi alınamadı: {loadError}</p>;
  }

  if (boards.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-sm text-amber-800">
          {sandbox
            ? // Sandbox'ta board API'siz yaratılamaz; kullanıcı pinterest.com'da board açıp
              // burada neden görünmediğini anlamaya çalışarak vakit kaybetmesin.
              'Sandbox hesabında board yok. Sandbox’ın board’ları pinterest.com’dakilerden ayrıdır — orada açtığınız board burada GÖRÜNMEZ; aşağıdan oluşturun.'
            : 'Hesapta hiç board yok — aşağıdan oluşturun veya Pinterest’te açıp sayfayı yenileyin.'}
        </p>
        {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
        {createForm}
      </div>
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
            // Silme düğmesi seçim düğmesinin İÇİNE konamaz (iç içe <button> geçersiz HTML) —
            // bu yüzden ikisi yan yana tek bir çip içinde durur.
            <span key={b.id} className="inline-flex items-center gap-1">
              <Button
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
              <Button
                variant="danger"
                disabled={saving}
                onClick={() => void remove(b)}
                className="px-2 py-1.5"
                title={`"${b.name}" board'unu sil`}
                aria-label={`"${b.name}" board'unu sil`}
              >
                ×
              </Button>
            </span>
          );
        })}
      </div>
      {!selectedId ? (
        <p className="mt-2 text-sm text-amber-800">Henüz board seçilmedi — seçmeden pin atılamaz.</p>
      ) : null}
      {createForm}
    </div>
  );
}
