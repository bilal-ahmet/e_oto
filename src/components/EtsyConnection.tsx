/**
 * Etsy bağlantı durumu kartı (server component).
 *
 * NEDEN: OAuth callback'i `/admin?etsy=connected` veya `/admin?etsy=error&reason=...` adresine
 * yönlendiriyordu ama panel bu parametreleri hiç okumuyordu — yetkilendirme sessizce başarısız
 * olabiliyor, kullanıcı bunu ancak hattın SONUNDA "Etsy bağlantısı yok" hatasıyla görüyordu.
 * Bu kart bağlantıyı görünür kılar ve tek tıkla yetkilendirme verir.
 */

import Link from 'next/link';
import { Card } from '@/components/ui';
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

  const connectButton = (
    <Link
      href="/api/auth/etsy/start"
      prefetch={false}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
    >
      {meta.connected ? 'Yeniden yetkilendir' : "Etsy'ye bağlan"}
    </Link>
  );

  if (callbackResult?.status === 'error') {
    return (
      <Card className="mb-6 border-red-200 bg-red-50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-800">Etsy yetkilendirmesi başarısız</p>
            <p className="mt-1 break-words text-sm text-red-700">{callbackResult.reason ?? 'Bilinmeyen sebep.'}</p>
          </div>
          {connectButton}
        </div>
      </Card>
    );
  }

  if (!meta.connected) {
    return (
      <Card className="mb-6 border-amber-200 bg-amber-50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900">Etsy bağlı değil</p>
            <p className="mt-1 text-sm text-amber-800">
              Yayın adımı çalışmaz. Üretime başlamadan önce bağlanın — aksi halde hattın sonunda
              (mockup ve dosyalar üretildikten sonra) hata alırsınız.
            </p>
          </div>
          {connectButton}
        </div>
      </Card>
    );
  }

  return (
    <Card className={`mb-6 ${meta.expiringSoon ? 'border-amber-200 bg-amber-50' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">
            <span className="mr-2 inline-block size-2 rounded-full bg-green-500 align-middle" aria-hidden />
            Etsy bağlı
            {callbackResult?.status === 'connected' ? (
              <span className="ml-2 text-green-700">— yetkilendirme tamamlandı</span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Son yetkilendirme: {fmt(meta.updatedAt)} · Erişim anahtarı geçerlilik: {fmt(meta.expiresAt)}
            {meta.hasRefreshToken ? '' : ' · yenileme anahtarı YOK (süre dolunca yeniden bağlanmalısınız)'}
          </p>
          {meta.expiringSoon ? (
            <p className="mt-1 text-sm font-medium text-amber-800">
              Yenileme anahtarı ~{meta.daysLeft} gün içinde geçersiz olacak — yeniden yetkilendirin.
              (Normalde günlük tazeleme görevi bunu kendisi yapar; bu uyarı görünüyorsa görev
              çalışmıyor demektir — sunucu loglarında <code>[cron] Etsy token</code> satırlarına bakın.)
            </p>
          ) : null}
        </div>
        {connectButton}
      </div>
    </Card>
  );
}
