/**
 * POST /api/auth/login → parola doğruysa oturum çerezi yazar.
 *
 * Bu uç `src/proxy.ts`'teki PUBLIC_API_PATHS listesindedir (giriş akışının kendisi).
 * Kaba kuvvet savunması iki katmanlı: IP başına sayaç (lib/auth/rate-limit) + scrypt maliyeti.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { bodyErrorStatus, readJsonBody } from '@/lib/http/body';
import { verifyPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, cookieOptions, missingAuthEnv, signSession } from '@/lib/auth/session';
import { clientIp, registerAttempt, resetAttempts } from '@/lib/auth/rate-limit';

// Parola gövdesi birkaç yüz byte — 34 MB'lık varsayılan tavanı buraya uygulamanın anlamı yok.
const MAX_LOGIN_BODY = 4 * 1024;

export async function POST(req: NextRequest) {
  const missing = missingAuthEnv();
  if (missing.length > 0) {
    // 503: istemci hatası değil, sunucu yapılandırılmamış. Eksik olanı ADIYLA söyle —
    // hangi değişkenin boş olduğunu aramak bir deploy turu daha harcatır (env.ts deseni).
    return NextResponse.json(
      { error: `Sunucu yapılandırması eksik: ${missing.join(', ')} tanımlı değil.` },
      { status: 503 },
    );
  }

  const ip = clientIp(req.headers);
  const limit = registerAttempt(ip);
  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return NextResponse.json(
      { error: `Çok fazla başarısız deneme. ${minutes} dakika sonra tekrar deneyin.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: { password?: unknown };
  try {
    body = await readJsonBody<{ password?: unknown }>(req, MAX_LOGIN_BODY);
  } catch (e) {
    const status = bodyErrorStatus(e);
    if (status) return NextResponse.json({ error: (e as Error).message }, { status });
    throw e;
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || !(await verifyPassword(password))) {
    // Hangi kısmın yanlış olduğu söylenmez (parola yok mu, hatalı mı) — tek mesaj.
    return NextResponse.json({ error: 'Parola hatalı.' }, { status: 401 });
  }

  const token = signSession();
  if (!token) {
    return NextResponse.json({ error: 'Oturum oluşturulamadı — AUTH_SECRET geçersiz.' }, { status: 503 });
  }

  resetAttempts(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return res;
}
