/**
 * Pinterest bağlantı durumu kartı (server component) — EtsyConnection'ın muadili.
 *
 * NEDEN: OAuth callback'i `/admin?pinterest=connected|error&reason=...` adresine dönüyordu ama
 * panel bu parametreleri hiç okumuyordu; yetkilendirme sessizce başarısız olabiliyordu.
 * Ayrıca board seçimi ve sandbox/production ortamı burada görünür kılınır — trial access'te
 * pinler YALNIZCA sahibine görünür, bu bilinmezse "pin atıldı ama Pinterest'te yok" sanılır.
 */

import Link from 'next/link';
import { Card } from '@/components/ui';
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

  const connectButton = (
    <Link
      href="/api/auth/pinterest/start"
      prefetch={false}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
    >
      {meta.connected ? 'Yeniden yetkilendir' : "Pinterest'e bağlan"}
    </Link>
  );

  const sandboxNote = sandbox ? (
    <p className="mt-1 text-sm text-zinc-500">
      <span className="font-medium">Sandbox (trial) modu:</span> oluşturulan pinler yalnızca size
      görünür, herkese açık değildir. Standart erişim onaylandığında{' '}
      <code className="rounded bg-zinc-100 px-1">PINTEREST_API_ENV=production</code> yapıp yeniden
      yetkilendirin.
    </p>
  ) : null;

  if (callbackResult?.status === 'error') {
    return (
      <Card className="mb-6 border-red-200 bg-red-50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-800">Pinterest yetkilendirmesi başarısız</p>
            <p className="mt-1 break-words text-sm text-red-700">
              {callbackResult.reason ?? 'Bilinmeyen sebep.'}
            </p>
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
            <p className="text-sm font-medium text-amber-900">Pinterest bağlı değil</p>
            <p className="mt-1 text-sm text-amber-800">
              Pin adımı çalışmaz. Etsy yayınından sonra pin atmak istiyorsanız bağlanın.
            </p>
            {sandboxNote}
          </div>
          {connectButton}
        </div>
      </Card>
    );
  }

  if (meta.tokenEnvMismatch) {
    return (
      <Card className="mb-6 border-amber-200 bg-amber-50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900">Pinterest ortamı değişti</p>
            <p className="mt-1 text-sm text-amber-800">
              Kayıtlı token <strong>{meta.tokenEnv}</strong> ortamında alınmış, şu anki ortam ise{' '}
              <strong>{apiEnv()}</strong>. Sandbox ve production token&apos;ları birbirinin yerine
              geçmez — yeniden yetkilendirin ve board&apos;u tekrar seçin.
            </p>
          </div>
          {connectButton}
        </div>
      </Card>
    );
  }

  // Buraya yalnızca bağlantı GEÇERLİ olduğunda gelinir — bağlı değilken veya ortam
  // uyuşmazlığı varken Pinterest'e boşuna çağrı yapılmaz.
  const { boards, error: boardsError } = await loadBoards();

  return (
    <Card className={`mb-6 ${meta.expiringSoon ? 'border-amber-200 bg-amber-50' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">
            <span className="mr-2 inline-block size-2 rounded-full bg-green-500 align-middle" aria-hidden />
            Pinterest bağlı
            <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-600">
              {apiEnv()}
            </span>
            {callbackResult?.status === 'connected' ? (
              <span className="ml-2 text-green-700">— yetkilendirme tamamlandı</span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Son yetkilendirme: {fmt(meta.updatedAt)} · Erişim anahtarı geçerlilik: {fmt(meta.expiresAt)}
            {meta.hasRefreshToken ? '' : ' · yenileme anahtarı YOK (süre dolunca yeniden bağlanmalısınız)'}
          </p>
          {sandboxNote}
          {meta.expiringSoon ? (
            <p className="mt-1 text-sm font-medium text-amber-800">
              Yenileme anahtarı ~{meta.daysLeft} gün içinde geçersiz olacak — yeniden yetkilendirin.
              (Normalde günlük tazeleme görevi bunu kendisi yapar; bu uyarı görünüyorsa görev
              çalışmıyor demektir — loglarda <code>[cron] Pinterest token</code> satırlarına bakın.)
            </p>
          ) : null}
          <PinterestBoardPicker
            boards={boards}
            initialSelectedId={meta.boardId}
            loadError={boardsError}
          />
        </div>
        {connectButton}
      </div>
    </Card>
  );
}
