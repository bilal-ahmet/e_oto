/**
 * GET /api/auth/pinterest/status — Pinterest bağlantı durumu (Etsy status ucunun muadili).
 *
 * Etsy'deki ile aynı gerekçe: token yalnızca pin atarken kullanılıyor, dolayısıyla eksik/ölü
 * bağlantı ancak hattın sonunda fark ediliyordu. Ek olarak burada ORTAM uyuşmazlığı da
 * raporlanır: sandbox token'ı production'da (ve tersi) geçersizdir, bu yüzden
 * PINTEREST_API_ENV değiştiğinde yeniden yetkilendirme gerekir.
 *
 * `probe=1` ile gerçek bir çağrı (GET /v5/user_account) yapıp token'ı doğrular.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getOAuthTokenMeta, getSetting } from '@/lib/db/queries';
import { apiEnv, isSandbox } from '@/lib/pinterest/hosts';
import { pinterestFetch } from '@/lib/pinterest/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const [meta, tokenEnv, selectedBoardId] = await Promise.all([
    getOAuthTokenMeta('pinterest'),
    getSetting('pinterest_token_env'),
    getSetting('pinterest_board_id'),
  ]);

  const common = {
    apiEnv: apiEnv(),
    sandbox: isSandbox(),
    authUrl: '/api/auth/pinterest/start',
  };

  if (!meta.connected) {
    return NextResponse.json({
      ...common,
      connected: false,
      reason: 'no_token',
      message: 'Pinterest hesabı bu uygulamaya hiç bağlanmamış.',
    });
  }

  const base = {
    ...common,
    connected: true,
    expiresAt: meta.expiresAt?.toISOString() ?? null,
    hasRefreshToken: meta.hasRefreshToken,
    connectedAt: meta.updatedAt?.toISOString() ?? null,
    tokenEnv,
    // Token başka bir ortamda alınmış → çağrılar 401 döner, yeniden yetkilendirme şart.
    tokenEnvMismatch: tokenEnv != null && tokenEnv !== apiEnv(),
    selectedBoardId: selectedBoardId || null,
  };

  if (req.nextUrl.searchParams.get('probe') !== '1') return NextResponse.json(base);

  try {
    const account = await pinterestFetch<{ username?: string }>('/user_account');
    return NextResponse.json({ ...base, valid: true, username: account.username ?? null });
  } catch (e) {
    return NextResponse.json({
      ...base,
      valid: false,
      reason: 'token_invalid',
      message: e instanceof Error ? e.message : 'Pinterest çağrısı başarısız.',
    });
  }
}
