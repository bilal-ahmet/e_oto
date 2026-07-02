/**
 * AES-256-GCM şifreleme/çözme — OAuth token'larını DB'ye güvenli saklamak için.
 * Format: `iv_hex.authTag_hex.ciphertext_hex` (tek string, kolayca ayrıştırılabilir).
 * Anahtar: TOKEN_ENCRYPTION_KEY env var — 64 hex karakter (32 byte).
 *   Üretmek için: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '@/lib/env';

const ALGO = 'aes-256-gcm';
const SEP = '.';

function getKey(): Buffer {
  return Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM standartı: 96-bit IV
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag(); // 128-bit auth tag
  return [iv.toString('hex'), tag.toString('hex'), ciphertext.toString('hex')].join(SEP);
}

export function decrypt(stored: string): string {
  const parts = stored.split(SEP);
  if (parts.length !== 3) throw new Error('Geçersiz şifreli veri formatı');
  const [ivHex, tagHex, ciphertextHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
