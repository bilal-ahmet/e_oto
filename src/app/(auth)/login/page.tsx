import { Alert, Card } from '@/components/ui';
import { missingAuthEnv } from '@/lib/auth/session';
import { LoginForm } from './LoginForm';

/**
 * /login — panelin tek giriş kapısı.
 *
 * Bu sayfa `src/proxy.ts` matcher'ının DIŞINDA (matcher yalnızca /admin ve /api). Korunsaydı
 * giriş yapmanın yolu kalmazdı.
 */

// Yapılandırma eksikliği (missingAuthEnv) çalışma zamanında değişebilir; sayfa statik
// prerender edilirse deploy anındaki durum donar ve yanlış mesaj gösterir.
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const missing = missingAuthEnv();

  return (
    <Card className="w-full max-w-sm">
      <p className="font-mono text-label uppercase tracking-label text-ink-faint">Velora</p>
      <h1 className="mt-1 font-display text-2xl tracking-tight text-ink">Panele giriş</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Otomasyon paneli yalnızca mağaza sahibine açıktır.
      </p>

      {missing.length > 0 ? (
        // Arka kapı DEĞİL, teşhis: sunucu hiç yapılandırılmamışsa doğru parola da işe yaramaz;
        // kullanıcı "parolam mı yanlış" diye aramasın.
        <Alert tone="danger" title="Sunucu yapılandırması eksik" className="mt-6">
          Şu ortam değişkenleri tanımlı değil: <strong>{missing.join(', ')}</strong>. Giriş
          yapılamaz. Değer üretmek için <code className="font-mono">npm run auth:hash</code>.
        </Alert>
      ) : (
        <LoginForm next={next} />
      )}
    </Card>
  );
}
