'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { ImageDraft } from '@/types';
import { Alert, Button, EmptyState, FRAMED_IMG, Framed, PageHeader, Spinner, buttonClasses } from '@/components/ui';

/**
 * Dosyayı base64'e çevirir. FileReader kullanılır — elle byte döngüsü büyük görsellerde ana
 * iş parçacığını saniyelerce kilitliyordu (bkz. admin/generate/page.tsx'teki aynı yardımcı).
 */
function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve({
        base64: result.slice(result.indexOf(',') + 1),
        mediaType: file.type || 'image/png',
      });
    };
    reader.readAsDataURL(file);
  });
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
        <Alert tone="danger" className="mb-6">
          {error}
        </Alert>
      ) : null}

      {/* Galeri bandı — marka sitesindeki galeri şeridiyle aynı okuma: kâğıt zeminden
          bir ton koyu, kapsayıcının kenarına kadar uzanan bir bant. */}
      <div className="-mx-4 border-y border-sand bg-shade px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-label uppercase tracking-label tabular-nums text-ink-muted">
            {drafts.length} taslak
          </p>
          <label className={`${buttonClasses({ variant: 'ghost', size: 'sm' })} cursor-pointer`}>
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
          <EmptyState
            title="Henüz taslak yok"
            description="Beğendiğin bir varyasyonu kaydet ya da dışarıdan bir görsel yükle."
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {drafts.map((d) => (
              <div key={d.id}>
                <div className="relative">
                  <Framed>
                    {/* object-contain (FRAMED_IMG) — taslak kaydında ürün tipi tutulmadığı
                        için 16:9 bir Frame TV eseri eskiden 3:4 kutuda KIRPILIYORDU.
                        Paspartuda artan boşluk doğal görünür, eser bozulmaz. */}
                    <Image
                      src={d.imageUrl}
                      alt="Taslak"
                      width={300}
                      height={400}
                      unoptimized
                      className={FRAMED_IMG}
                    />
                  </Framed>
                  {/* Sil düğmesi eserin değil, PASPARTUNUN üstünde durur. */}
                  <button
                    onClick={() => deleteDraft(d.id)}
                    disabled={busy}
                    title="Taslağı sil"
                    aria-label="Taslağı sil"
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-paper text-sm font-semibold text-ink-muted transition-colors hover:text-state-error-ink disabled:opacity-60"
                  >
                    ×
                  </button>
                </div>
                {/* Eylem mat'ın DIŞINDA: hover'da eserin üstünü kapatmıyor. */}
                <Button
                  onClick={() => continueWithDraft(d.id)}
                  disabled={busy}
                  size="sm"
                  className="mt-2 w-full"
                >
                  Bu taslakla devam et
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
