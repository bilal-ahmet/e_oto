/**
 * Panel koruması — /admin/* ve /api/* uçlarına oturum çerezi olmadan erişilemez.
 *
 * DOSYA ADI: Next 16'da `middleware.ts` deprecated ve `proxy.ts` olarak yeniden adlandırıldı
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * `export const runtime` YAZMAYIN — Proxy dosyasında bu ayar hata fırlatır; Node.js runtime
 * zaten varsayılandır, bu yüzden node:crypto doğrudan kullanılabilir.
 *
 * Burada DB'ye GİDİLMEZ: proxy prefetch dahil her korumalı istekte çalışır (Next auth rehberi).
 * Yalnızca imzalı çerez doğrulanır; ikinci kapı sunucu tarafında (app/admin/layout.tsx).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, cookieOptions, signSession, verifySession } from '@/lib/auth/session';

/**
 * POZİTİF matcher bilinçli tercih: negatif catch-all'a göre denetlenmesi kolay ve `/`,
 * `/privacy`, `_next/*`, `public/*` hiç dokunulmadan geçer (vitrinin statik prerender'ı korunur).
 * `/admin` ayrıca listelenir: `:path*` sıfır-veya-daha-fazla olsa da kök yolu açıkça yazmak
 * matcher'ı okuyanın kafasında soru bırakmaz.
 */
export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/:path*'],
};

/**
 * KİMLİKSİZ ERİŞİLEBİLİR OLMASI ZORUNLU uçlar. Buraya bir şey eklemeden önce iki kez düşün:
 * listedeki her satır kapatılmamış bir kapıdır.
 *   · /api/health                   → DO App Platform health probe; 200 dönmezse deploy başarısız sayılır.
 *   · .../etsy|pinterest/callback   → Etsy/Pinterest'ten gelir, bizim oturum çerezimizi TAŞIMAZ.
 *                                     Korunursa token hiç kaydedilmez, kullanıcı sebebini göremez.
 *   · /api/auth/login|logout        → giriş/çıkış akışının kendisi.
 * `/api/auth/etsy/start` ve `/api/auth/pinterest/start` BİLEREK listede yok: bunlar kullanıcının
 * kendi tarayıcısından same-site navigasyonla açılır, SameSite=Lax çerez gider.
 */
const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/etsy/callback',
  '/api/auth/pinterest/callback',
  '/api/auth/login',
  '/api/auth/logout',
]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API_PATHS.has(pathname)) return NextResponse.next();

  const { valid, needsRefresh } = verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!valid) {
    // API: JSON 401. (CLAUDE.md §4'teki 502/504→424 kuralı UPSTREAM hataları içindir; 401
    // bizim kendi statümüz ve DO/Cloudflare tarafından HTML ile değiştirilmez.)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Oturum gerekli — panele giriş yapın.' }, { status: 401 });
    }

    const login = new URL('/login', req.url);
    // Sorgu dizesi de korunur: /admin?etsy=success gibi dönüşler girişten sonra kaybolmasın.
    login.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }

  const res = NextResponse.next();
  // Kayan süre: ömrün yarısı tükendiğinde tazele. Her istekte imzalamamak için eşik var.
  if (needsRefresh) {
    const token = signSession();
    if (token) res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  }
  return res;
}
