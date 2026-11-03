/**
 * Etsy bağlantı durumu kartı (server component).
 *
 * NEDEN: OAuth callback'i `/admin?etsy=connected` veya `/admin?etsy=error&reason=...` adresine
 * yönlendiriyordu ama panel bu parametreleri hiç okumuyordu — yetkilendirme sessizce başarısız
 * olabiliyor, kullanıcı bunu ancak hattın SONUNDA "Etsy bağlantısı yok" hatasıyla görüyordu.
 * Bu kart bağlantıyı görünür kılar ve tek tıkla yetkilendirme verir.
 */

import { Alert, LinkButton } from '@/components/ui';
import { ConnectionHealthLine } from '@/components/ConnectionHealthLine';
import { connectionHealth } from '@/lib/connection/health';
import { getOAuthTokenMeta } from '@/lib/db/queries';
import { formatTr } from '@/lib/format';

const fmt = (d: Date | null) => formatTr(d, { year: true });

/** Etsy refresh token'ı ~90 gün geçerlidir; bu süre dolarsa yeniden yetkilendirme şart. */
const REFRESH_TOKEN_DAYS = 90;

/**
 * Veri + türetilmiş alanlar. `Date.now()` bilerek BURADA (render dışında) okunur — React
 * derleyicisi render gövdesinde saf olmayan çağrılara izin vermiyor.
 */
async function loadStatus() {
  const [meta, health] = await Promise.all([getOAuthTokenMeta('etsy'), connectionHealth('etsy')]);
  // Refresh token'ın ömrü son yetkilendirmeden itibaren sayılır (her refresh'te tazelenir).
  const since = meta.updatedAt ? Date.now() - meta.updatedAt.getTime() : 0;
  const daysLeft = Math.max(REFRESH_TOKEN_DAYS - Math.floor(since / 86_400_000), 0);
  return { ...meta, health, daysLeft, expiringSoon: meta.connected && daysLeft <= 14 };
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

  const bad = ['reauth_required', 'auth_error'].includes(meta.health.state);
  return (
    <Alert
      tone={bad ? 'danger' : meta.expiringSoon || meta.health.state === 'transient' ? 'warning' : 'info'}
      title="Etsy hesabı"
      action={connectButton}
      className="mb-6"
    >
      {/* "Erişim anahtarı" Etsy'de 1 saat geçerlidir ve her çağrıda otomatik yenilenir — geçmiş
          bir saat görünmesi ARIZA DEĞİLDİR. Asıl ömür refresh token'ındır (~90 gün, aşağıda). */}
      <p className="text-sm">
        Son yetkilendirme/yenileme: {fmt(meta.updatedAt)} · Erişim anahtarı (≈1 sa, otomatik
        yenilenir): {fmt(meta.expiresAt)} · Yenileme anahtarı: ~{meta.daysLeft} gün
        {callbackResult?.status === 'connected' ? ' · yetkilendirme tamamlandı' : ''}
      </p>
      <ConnectionHealthLine provider="etsy" health={meta.health} />
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
