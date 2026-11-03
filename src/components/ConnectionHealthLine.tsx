/**
 * Bağlantı kartlarındaki "gerçekten çalışıyor mu" satırı (server component).
 * Token kaydının varlığı değil, son SALT OKUNUR API kontrolünün sonucu gösterilir.
 */

import { ConnectionCheckButton } from '@/components/ConnectionCheckButton';
import { CONNECTION_STATE_LABEL, type ConnectionHealth } from '@/lib/connection/health';
import { formatTr } from '@/lib/format';
import { ERROR_KIND_META } from '@/lib/status';

const STATE_CLASS: Record<ConnectionHealth['state'], string> = {
  verified: 'text-state-done-ink',
  unchecked: 'text-ink-muted',
  transient: 'text-state-turn-ink',
  auth_error: 'text-state-error-ink',
  reauth_required: 'text-state-error-ink',
  not_connected: 'text-state-error-ink',
};

export function ConnectionHealthLine({
  provider,
  health,
}: {
  provider: 'etsy' | 'pinterest';
  health: ConnectionHealth;
}) {
  const { state, lastCheck } = health;
  const source = lastCheck?.source === 'cron' ? 'günlük görev' : 'panel';
  return (
    <div className="mt-2 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`font-medium ${STATE_CLASS[state]}`}>{CONNECTION_STATE_LABEL[state]}</span>
        {lastCheck ? (
          <span className="text-ink-muted">
            · Son salt okunur kontrol: {formatTr(lastCheck.at, { year: true })} ({source}) —{' '}
            {lastCheck.ok ? 'başarılı' : `başarısız (${ERROR_KIND_META[lastCheck.kind ?? 'internal'].label})`}
          </span>
        ) : (
          <span className="text-ink-muted">· Henüz salt okunur kontrol yapılmadı.</span>
        )}
        <ConnectionCheckButton provider={provider} />
      </p>
      {lastCheck && !lastCheck.ok && lastCheck.message ? (
        <p className="mt-1 break-words text-xs text-ink-muted">{lastCheck.message}</p>
      ) : null}
      {state === 'reauth_required' ? (
        <p className="mt-1 font-medium">
          Yenileme anahtarı sağlayıcı tarafından reddedildi ya da yok. Otomatik yenileme tekrar
          denenmeyecek — &quot;Yeniden yetkilendir&quot; ile bağlanın.
        </p>
      ) : null}
    </div>
  );
}
