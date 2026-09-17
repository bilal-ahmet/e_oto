'use client';

import { useState } from 'react';
import { Alert, Button, Field, Input, Spinner } from '@/components/ui';

/**
 * Girişten sonra dönülecek yolu doğrular.
 *
 * KRİTİK: ham `next` parametresi doğrudan kullanılırsa açık yönlendirme (open redirect)
 * açığı olur — `/login?next=https://kotu.site` bağlantısı kullanıcıyı giriş yaptıktan sonra
 * saldırganın sayfasına atar. Yalnızca `/admin` ile başlayan GÖRELİ yollar kabul edilir.
 * `//host` biçimi tarayıcıda protokol-göreli MUTLAK URL'dir; bu yüzden ayrıca elenir.
 */
function safeNext(next: string | undefined): string {
  if (!next) return '/admin';
  if (!next.startsWith('/admin') || next.startsWith('//')) return '/admin';
  return next;
}

export function LoginForm({ next }: { next?: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // router.push DEĞİL: çerez sunucu tarafında yazıldı ve korumalı sayfanın SUNUCUDA
        // yeniden render edilmesi gerekiyor. Tam sayfa gezinme bunu garanti eder; client-side
        // geçiş önbellekten eski (giriş öncesi) bir yanıt döndürebilir.
        window.location.href = safeNext(next);
        return;
      }

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? 'Giriş yapılamadı.');
    } catch {
      setError('Sunucuya ulaşılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <Field label="Parola" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          invalid={error !== null}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </Field>

      {error ? (
        <Alert tone="danger" compact className="mt-3" >
          {error}
        </Alert>
      ) : null}

      <Button type="submit" className="mt-5 w-full" disabled={busy || password.length === 0}>
        {busy ? <Spinner /> : null}
        {busy ? 'Kontrol ediliyor…' : 'Giriş yap'}
      </Button>
    </form>
  );
}
