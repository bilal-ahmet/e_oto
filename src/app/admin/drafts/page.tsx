'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { ImageDraft } from '@/types';
import { Button, Card, PageHeader, Spinner } from '@/components/ui';

async function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), mediaType: file.type || 'image/png' };
}

export default function DraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<ImageDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // İlk yüklemede taslakları çek (setState await sonrası — senkron cascade yok).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/drafts');
        if (!res.ok || !active) return;
        const data: { drafts?: ImageDraft[] } = await res.json();
        if (active) setDrafts(data.drafts ?? []);
      } catch {
        /* sessiz geç */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function refresh() {
    try {
      const res = await fetch('/api/drafts');
      if (!res.ok) return;
      const data: { drafts?: ImageDraft[] } = await res.json();
      setDrafts(data.drafts ?? []);
    } catch {
      /* sessiz geç */
    }
  }

  async function uploadDraft(file: File) {
    setBusy(true);
    setError(null);
    try {
      const upload = await fileToBase64(file);
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Görsel yüklenemedi.');
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Görsel yüklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/drafts/${id}`, { method: 'DELETE' });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  // Üretime taşı — /admin/generate taslağı ?draft=<id> ile alıp SEO'dan itibaren otomatik başlatır.
  function continueWithDraft(id: string) {
    router.push(`/admin/generate?draft=${id}`);
  }

  return (
    <div>
      <PageHeader
        title="Taslaklar"
        description="Kaydedilen görseller. Birinden üretime devam edebilir (SEO → yayın), dışarıdan görsel yükleyebilir veya silebilirsin."
      />

      {error ? (
        <Card className="mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">{drafts.length} taslak</p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-300 transition-colors hover:bg-zinc-50">
            {busy ? <Spinner /> : null}
            Görsel yükle
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) uploadDraft(f);
              }}
            />
          </label>
        </div>

        {drafts.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-400">Henüz taslak yok.</p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="group relative overflow-hidden rounded-lg ring-1 ring-zinc-200"
              >
                <Image
                  src={d.imageUrl}
                  alt="Taslak"
                  width={300}
                  height={400}
                  unoptimized
                  className="aspect-[3/4] w-full object-cover"
                />
                <button
                  onClick={() => deleteDraft(d.id)}
                  disabled={busy}
                  title="Taslağı sil"
                  className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-white/90 text-sm font-semibold text-zinc-600 shadow-sm ring-1 ring-zinc-200 transition hover:bg-white hover:text-red-600 disabled:opacity-60"
                >
                  ×
                </button>
                <div className="absolute inset-x-0 bottom-0 p-1.5">
                  <Button
                    onClick={() => continueWithDraft(d.id)}
                    disabled={busy}
                    className="w-full !px-2 !py-1.5 text-xs"
                  >
                    Bu taslakla devam et
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
