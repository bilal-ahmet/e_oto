/**
 * Panel parolası — scrypt ile doğrulama.
 *
 * ADMIN_PASSWORD_HASH biçimi: `scrypt:<saltHex>:<hashHex>`
 * Üretmek için: `npm run auth:hash` (scripts/hash-password.ts).
 *
 * Düz parola ASLA env'de tutulmaz: App Platform panelinde ve log'larda görünür hale gelir.
 *
 * AYRAÇ ':' — '$' DEĞİL, ve bu geri alınamaz bir karar değil, ölçülmüş bir zorunluluk:
 * Next.js env dosyalarını dotenv-expand ile okur ve '$' sonrasını DEĞİŞKEN REFERANSI sayar.
 * `.env.local`'deki `scrypt$<salt>$<hash>` değeri process.env'e sadece "scrypt" olarak
 * ulaşıyordu (ölçüldü) — yani lokalde doğru parola bile sessizce "Parola hatalı" veriyordu.
 * Ayraç değiştirilecekse '$' dışında bir şey seçin.
 */

import { scrypt, timingSafeEqual } from 'node:crypto';

// scrypt maliyet parametreleri. N=16384 → tek doğrulama ~100 ms; kaba kuvvete karşı ilk
// savunma katmanı (ikincisi lib/auth/rate-limit.ts). Değiştirilirse eski hash'ler bozulmaz:
// parametreler hash'in kendisine değil, bu sabitlere bağlı — bu yüzden ikisi de sabit kalmalı.
const KEYLEN = 64;
const COST = 16384;

export const HASH_PREFIX = 'scrypt';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem varsayılanı 32 MB; N=16384 için 128*N*r = 16 MB yeterli ama sınıra yakın,
    // açıkça yükselt (aksi halde bazı ortamlarda "memory limit exceeded" fırlatır).
    scrypt(password, salt, KEYLEN, { N: COST, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** `scrypt:<saltHex>:<hashHex>` üretir — yalnızca scripts/hash-password.ts kullanır. */
export async function hashPassword(password: string, salt: Buffer): Promise<string> {
  const key = await derive(password, salt);
  return `${HASH_PREFIX}:${salt.toString('hex')}:${key.toString('hex')}`;
}

/**
 * FAIL-CLOSED: env yoksa, biçim bozuksa veya scrypt hata verirse false.
 * Karşılaştırma timingSafeEqual ile — parolanın kaç karakterinin tuttuğu zamanlamadan sızmaz.
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const stored = process.env.ADMIN_PASSWORD_HASH;
  if (!stored) return false;

  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) return false;
  const [, saltHex, hashHex] = parts;

  let expected: Buffer;
  let salt: Buffer;
  try {
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEYLEN) return false;

  try {
    const actual = await derive(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
