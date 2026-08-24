/**
 * Pinterest bağlantı durumu kartı (server component) — EtsyConnection'ın muadili.
 *
 * NEDEN: OAuth callback'i `/admin?pinterest=connected|error&reason=...` adresine dönüyordu ama
 * panel bu parametreleri hiç okumuyordu; yetkilendirme sessizce başarısız olabiliyordu.
 * Ayrıca board seçimi ve sandbox/production ortamı burada görünür kılınır — trial access'te
 * pinler YALNIZCA sahibine görünür, bu bilinmezse "pin atıldı ama Pinterest'te yok" sanılır.
 */

import { Alert, LinkButton } from '@/components/ui';
import { PinterestBoardPicker } from '@/components/PinterestBoardPicker';
import { getOAuthTokenMeta, getSetting } from '@/lib/db/queries';
import { apiEnv, isSandbox } from '@/lib/pinterest/hosts';
import { listBoards, type PinterestBoard } from '@/lib/pinterest/boards';

function fmt(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Pinterest refresh token'ı 60 gün geçerlidir ama her kullanımda yenilenir (continuous
 * refresh) — cron/token-refresh.ts bunu düzenli tazeler.
 */
const REFRESH_TOKEN_DAYS = 60;

async function loadStatus() {
  const [meta, tokenEnv, boardId] = await Promise.all([
    getOAuthTokenMeta('pinterest'),
    getSetting('pinterest_token_env'),
    getSetting('pinterest_board_id'),
  ]);
  // Date.now() bilerek render dışında okunur (React derleyicisi saf olmayan çağrılara izin vermez).
  const since = meta.updatedAt ? Date.now() - meta.updatedAt.getTime() : 0;
  const daysLeft = Math.max(REFRESH_TOKEN_DAYS - Math.floor(since / 86_400_000), 0);
  return {
    ...meta,
    daysLeft,
    expiringSoon: meta.connected && daysLeft <= 14,
    tokenEnv,
    tokenEnvMismatch: Boolean(tokenEnv) && tokenEnv !== apiEnv(),
    boardId: boardId || null,
  };
}

/**
 * Board listesi Pinterest'ten çekilir. Hata yutulmaz ama SAYFAYI DÜŞÜRMEZ: Pinterest
 * erişilemezse panelin tamamı (Etsy kartı, run listesi) da kaybolurdu.
 */
async function loadBoards(): Promise<{ boards: PinterestBoard[]; error: string | null }> {
  try {
    return { boards: await listBoards(), error: null };
  } catch (e) {
    return { boards: [], error: e instanceof Error ? e.message : 'Bilinmeyen hata.' };
  }
}

export async function PinterestConnection({
  callbackResult,
}: {
  callbackResult?: { status?: string; reason?: string };
}) {
  const meta = await loadStatus();
  const sandbox = isSandbox();

  // prefetch={false} ŞART — OAuth başlatma route'u prefetch EDİLMEMELİ.
  const connectButton = (
    <LinkButton href="/api/auth/pinterest/start" prefetch={false} variant="secondary" size="sm">
      {meta.connected ? 'Yeniden yetkilendir' : "Pinterest'e bağlan"}
    </LinkButton>
  );

  const sandboxNote = sandbox ? (
    <p className="mt-1">
      <span className="font-medium">Sandbox (trial) modu:</span> oluşturulan pinler yalnızca size
      görünür, herkese açık değildir. Standart erişim onaylandığında{' '}
      <code className="rounded-xs bg-paper px-1 font-mono">PINTEREST_API_ENV=production</code> yapıp
      yeniden yetkilendirin.
    </p>
  ) : null;

  if (callbackResult?.status === 'error') {
    return (
      <Alert tone="danger" title="Pinterest yetkilendirmesi başarısız" action={connectButton} className="mb-6">
        <span className="break-words">{callbackResult.reason ?? 'Bilinmeyen sebep.'}</span>
      </Alert>
    );
  }

  if (!meta.connected) {
    return (
      <Alert tone="warning" title="Pinterest bağlı değil" action={connectButton} className="mb-6">
        Pin adımı çalışmaz. Etsy yayınından sonra pin atmak istiyorsanız bağlanın.
        {sandboxNote}
      </Alert>
    );
  }

  if (meta.tokenEnvMismatch) {
    return (
      <Alert tone="warning" title="Pinterest ortamı değişti" action={connectButton} className="mb-6">
        Kayıtlı token <strong>{meta.tokenEnv}</strong> ortamında alınmış, şu anki ortam ise{' '}
        <strong>{apiEnv()}</strong>. Sandbox ve production token&apos;ları birbirinin yerine geçmez —
        yeniden yetkilendirin ve board&apos;u tekrar seçin.
      </Alert>
    );
  }

  // Buraya yalnızca bağlantı GEÇERLİ olduğunda gelinir — bağlı değilken veya ortam
  // uyuşmazlığı varken Pinterest'e boşuna çağrı yapılmaz.
  const { boards, error: boardsError } = await loadBoards();

  return (
    <Alert
      tone={meta.expiringSoon ? 'warning' : 'info'}
      title="Pinterest bağlı"
      action={connectButton}
      className="mb-6"
    >
      <p className="font-mono text-label uppercase tracking-label">
        <span className="mr-2 inline-block size-1.5 rounded-full bg-state-done-ink align-middle" aria-hidden />
        {apiEnv()} · Son yetkilendirme: {fmt(meta.updatedAt)} · Geçerlilik: {fmt(meta.expiresAt)}
        {callbackResult?.status === 'connected' ? ' · yetkilendirme tamamlandı' : ''}
      </p>
      {meta.hasRefreshToken ? null : (
        <p className="mt-1">Yenileme anahtarı YOK — süre dolunca yeniden bağlanmalısınız.</p>
      )}
      {sandboxNote}
      {meta.expiringSoon ? (
        <p className="mt-1 font-medium">
          Yenileme anahtarı ~{meta.daysLeft} gün içinde geçersiz olacak — yeniden yetkilendirin.
          (Normalde günlük tazeleme görevi bunu kendisi yapar; bu uyarı görünüyorsa görev
          çalışmıyor demektir — loglarda <code className="rounded-xs bg-paper px-1 font-mono">[cron] Pinterest token</code> satırlarına bakın.)
        </p>
      ) : null}
      <PinterestBoardPicker
        boards={boards}
        initialSelectedId={meta.boardId}
        loadError={boardsError}
        sandbox={sandbox}
      />
    </Alert>
  );
}
