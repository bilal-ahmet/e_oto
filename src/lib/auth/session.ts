/**
 * Panel oturumu — imzalı çerez (HMAC-SHA256), DB'siz.
 *
 * NEDEN DB YOK: bu modül `src/proxy.ts` içinden çağrılır ve proxy prefetch dahil HER
 * korumalı istekte çalışır. Next.js'in auth rehberi proxy'de DB sorgusunu açıkça yasaklar
 * (node_modules/next/dist/docs/01-app/02-guides/authentication.md).
 *
 * NEDEN `@/lib/env` YOK: `env` proxy'sine tek bir erişim TÜM zod şemasını doğrular, yani
 * DATABASE_URL/TOKEN_ENCRYPTION_KEY'i zorunlu kılar. Oturum doğrulaması bunların hiçbirine
 * ihtiyaç duymaz; `publicBranding` (lib/env.ts) ile aynı gerekçeyle düz process.env okunur.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'velora_session';

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
/** Kalan ömür bunun altına inince çerez tazelenir (kayan süre) — her istekte imzalamamak için. */
const REFRESH_BELOW_MS = TTL_MS / 2;

export type VerifyResult = {
  valid: boolean;
  /** true ise çağıran, yanıta signSession() ile tazelenmiş çerezi eklemeli. */
  needsRefresh: boolean;
};

/** AUTH_SECRET veya ADMIN_PASSWORD_HASH eksikse null — bu durumda hiçbir oturum geçerli sayılmaz. */
function secrets(): { key: Buffer; pwdPrint: string } | null {
  const secret = process.env.AUTH_SECRET;
  const pwdHash = process.env.ADMIN_PASSWORD_HASH;
  if (!secret || secret.length < 32 || !pwdHash) return null;
  return {
    key: Buffer.from(secret, 'utf8'),
    // Parola değişince parmak izi değişir → daha önce dağıtılmış tüm çerezler kendiliğinden
    // geçersizleşir. "Parolayı değiştirdim ama eski oturumlar hâlâ açık" tuzağını kapatır.
    pwdPrint: createHash('sha256').update(pwdHash).digest('hex').slice(0, 16),
  };
}

/** Eksik yapılandırmayı giriş sayfasında ADIYLA göstermek için — erişim kararı vermez. */
export function missingAuthEnv(): string[] {
  const missing: string[] = [];
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) missing.push('AUTH_SECRET');
  if (!process.env.ADMIN_PASSWORD_HASH) missing.push('ADMIN_PASSWORD_HASH');
  return missing;
}

function sign(payload: string, key: Buffer): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

/** Yeni oturum token'ı: `<expMs>.<pwdPrint>.<hmac>`. Yapılandırma eksikse null. */
export function signSession(): string | null {
  const s = secrets();
  if (!s) return null;
  const payload = `${Date.now() + TTL_MS}.${s.pwdPrint}`;
  return `${payload}.${sign(payload, s.key)}`;
}

/**
 * FAIL-CLOSED: secret eksikse, biçim bozuksa, imza tutmazsa, parola değiştiyse veya süre
 * dolduysa daima `valid: false`. Hiçbir hata yolu erişim açmaz.
 */
export function verifySession(token: string | undefined): VerifyResult {
  const deny: VerifyResult = { valid: false, needsRefresh: false };
  if (!token) return deny;

  const s = secrets();
  if (!s) return deny;

  const parts = token.split('.');
  if (parts.length !== 3) return deny;
  const [expRaw, pwdPrint, mac] = parts;

  const expected = sign(`${expRaw}.${pwdPrint}`, s.key);
  // Uzunluklar eşit değilse timingSafeEqual fırlatır — önce uzunluğu karşılaştır.
  if (mac.length !== expected.length) return deny;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return deny;

  // İmza doğru ama parola o zamandan beri değişmişse token artık geçerli değil.
  if (pwdPrint !== s.pwdPrint) return deny;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) return deny;
  const remaining = exp - Date.now();
  if (remaining <= 0) return deny;

  return { valid: true, needsRefresh: remaining < REFRESH_BELOW_MS };
}

/**
 * Çerez seçenekleri — mevcut OAuth çerezleriyle aynı desen (bkz. api/auth/etsy/start).
 * sameSite 'lax' ŞART: dış bir yer imi ya da OAuth dönüşüyle /admin'e gelindiğinde çerez
 * gönderilmeli. 'lax' aynı zamanda siteler arası POST'ta çerezi göndermeyerek CSRF'i keser.
 */
export function cookieOptions(maxAgeSeconds = Math.floor(TTL_MS / 1000)) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
