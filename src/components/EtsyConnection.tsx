/**
 * Etsy bağlantı durumu kartı (server component).
 *
 * NEDEN: OAuth callback'i `/admin?etsy=connected` veya `/admin?etsy=error&reason=...` adresine
 * yönlendiriyordu ama panel bu parametreleri hiç okumuyordu — yetkilendirme sessizce başarısız
 * olabiliyor, kullanıcı bunu ancak hattın SONUNDA "Etsy bağlantısı yok" hatasıyla görüyordu.
 * Bu kart bağlantıyı görünür kılar ve tek tıkla yetkilendirme verir.
 */

import { Alert, LinkButton } from '@/components/ui';
import { getOAuthTokenMeta } from '@/lib/db/queries';

function fmt(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Etsy refresh token'ı ~90 gün geçerlidir; bu süre dolarsa yeniden yetkilendirme şart. */
const REFRESH_TOKEN_DAYS = 90;

/**
 * Veri + türetilmiş alanlar. `Date.now()` bilerek BURADA (render dışında) okunur — React
 * derleyicisi render gövdesinde saf olmayan çağrılara izin vermiyor.
 */
async function loadStatus() {
  const meta = await getOAuthTokenMeta('etsy');
  // Refresh token'ın ömrü son yetkilendirmeden itibaren sayılır (her refresh'te tazelenir).
  const since = meta.updatedAt ? Date.now() - meta.updatedAt.getTime() : 0;
  const daysLeft = Math.max(REFRESH_TOKEN_DAYS - Math.floor(since / 86_400_000), 0);
  return { ...meta, daysLeft, expiringSoon: meta.connected && daysLeft <= 14 };
}

export async function EtsyConnection({ callbackResult }: { callbackResult?: { status?: string; reason?: string } }) {
  const meta = await loadStatus();

  // prefetch={false} ŞART: OAuth başlatma route'u prefetch EDİLMEMELİ (her prefetch
  // yeni bir PKCE verifier üretip cookie'yi ezerdi).
  const connectButton = (
    <LinkButton href="/api/auth/etsy/start" prefetch={false} variant="secondary" size="sm">
      {meta.connected ? 'Yeniden yetkilendir' : "Etsy'ye bağlan"}
    </LinkButton>
  );

  if (callbackResult?.status === 'error') {
    return (
      <Alert tone="danger" title="Etsy yetkilendirmesi başarısız" action={connectButton} className="mb-6">
        <span className="break-words">{callbackResult.reason ?? 'Bilinmeyen sebep.'}</span>
      </Alert>
    );
  }

  if (!meta.connected) {
    return (
      <Alert tone="warning" title="Etsy bağlı değil" action={connectButton} className="mb-6">
        Yayın adımı çalışmaz. Üretime başlamadan önce bağlanın — aksi halde hattın sonunda
        (mockup ve dosyalar üretildikten sonra) hata alırsınız.
      </Alert>
    );
  }

  return (
    <Alert
      tone={meta.expiringSoon ? 'warning' : 'info'}
      title="Etsy bağlı"
      action={connectButton}
      className="mb-6"
    >
      <p className="font-mono text-label uppercase tracking-label">
        <span className="mr-2 inline-block size-1.5 rounded-full bg-state-done-ink align-middle" aria-hidden />
        Son yetkilendirme: {fmt(meta.updatedAt)} · Geçerlilik: {fmt(meta.expiresAt)}
        {callbackResult?.status === 'connected' ? ' · yetkilendirme tamamlandı' : ''}
      </p>
      {meta.hasRefreshToken ? null : (
        <p className="mt-1">Yenileme anahtarı YOK — süre dolunca yeniden bağlanmalısınız.</p>
      )}
      {meta.expiringSoon ? (
        <p className="mt-1 font-medium">
          Yenileme anahtarı ~{meta.daysLeft} gün içinde geçersiz olacak — yeniden yetkilendirin.
          (Normalde günlük tazeleme görevi bunu kendisi yapar; bu uyarı görünüyorsa görev
          çalışmıyor demektir — sunucu loglarında <code className="rounded-xs bg-paper px-1 font-mono">[cron] Etsy token</code> satırlarına bakın.)
        </p>
      ) : null}
    </Alert>
  );
}
