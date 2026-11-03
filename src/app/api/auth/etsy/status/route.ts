/**
 * GET /api/auth/etsy/status — Etsy bağlantı durumu.
 *
 * NEDEN VAR: Etsy token'ı yalnızca yayın anında (`publishToEtsy`) kullanılıyordu; token yoksa
 * kullanıcı bunu ancak tüm hattı (üretim + SEO + upscale + 8 mockup + video + 5 JPG) çalıştırıp
 * "Etsy'ye yayınla" dedikten SONRA öğreniyordu. Gate 2'deki taksonomi/öznitelik çağrısı da
 * hatayı sessizce yutuyordu. Bu uç, durumu önceden göstermek içindir.
 *
 * `probe=1` ile ayrıca Etsy'ye SALT OKUNUR gerçek bir çağrı (`GET /users/me`) atar; sonuç
 * `app_settings.etsy_last_check`'e yazılır ve panel kartında zamanıyla gösterilir.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getOAuthTokenMeta } from '@/lib/db/queries';
import { runConnectionCheck } from '@/lib/connection/health';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const meta = await getOAuthTokenMeta('etsy');

  if (!meta.connected) {
    return NextResponse.json({
      connected: false,
      reason: 'no_token',
      message: 'Etsy hesabı bu uygulamaya hiç bağlanmamış (veya bağlantı kaydı bu veritabanında yok).',
      authUrl: '/api/auth/etsy/start',
    });
  }

  const base = {
    connected: true,
    expiresAt: meta.expiresAt?.toISOString() ?? null,
    hasRefreshToken: meta.hasRefreshToken,
    connectedAt: meta.updatedAt?.toISOString() ?? null,
    authUrl: '/api/auth/etsy/start',
  };

  if (req.nextUrl.searchParams.get('probe') !== '1') return NextResponse.json(base);

  // Gerçek çağrı: token süresi dolmuşsa refresh'i de tetikler, mağaza erişimini doğrular.
  const check = await runConnectionCheck('etsy', 'panel');
  return NextResponse.json({ ...base, valid: check.ok, check });
}
