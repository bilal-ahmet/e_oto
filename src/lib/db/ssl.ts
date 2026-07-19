/**
 * PostgreSQL SSL ayarı — Managed PG (DigitalOcean) SSL zorunlu; lokalde kapalı.
 *
 * Env ile sürülür (env.ts zod şemasına dokunmadan, process.env doğrudan — COMPETITOR_CRON_ENABLED
 * ile aynı desen):
 *   - DATABASE_SSL=true VEYA DATABASE_URL'de `sslmode=require` → SSL aç.
 *   - DATABASE_CA_CERT (PEM) verilmişse → sertifika doğrulamalı (en güvenli).
 *   - CA yoksa → şifreli ama doğrulamasız (DO self-signed CA için pratik varsayılan).
 *   - Hiçbiri yoksa → SSL kapalı (lokal Postgres).
 *
 * ÖNEMLİ: `pg` (pg-connection-string) artık connection string'teki `sslmode=require`'ı
 * `verify-full` (tam sertifika doğrulama) ile eş anlamlı sayıyor ve bunu Pool'a verilen
 * açık `ssl` objesinin önüne geçiriyor. DO'nun (CA verilmemişse) self-signed sertifikasıyla
 * bu, `SELF_SIGNED_CERT_IN_CHAIN` hatasına yol açar. Bu yüzden `sslmode`'u connection
 * string'den ayıklayıp SSL'i YALNIZCA burada döndürdüğümüz açık `ssl` objesiyle kontrol
 * ediyoruz — bkz. `stripSslModeFromUrl`, çağıranlar bunu Pool'a verilen connectionString'e uygular.
 */

import type { PoolConfig } from 'pg';

export function pgSsl(): PoolConfig['ssl'] {
  const url = process.env.DATABASE_URL ?? '';
  const wantSsl = process.env.DATABASE_SSL === 'true' || /[?&]sslmode=require/i.test(url);
  if (!wantSsl) return undefined;

  const ca = process.env.DATABASE_CA_CERT;
  if (ca && ca.trim()) return { ca, rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/** Connection string'den `sslmode`/`ssl` query parametrelerini ayıklar (bkz. üstteki not). */
export function stripSslModeFromUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    return u.toString();
  } catch {
    return url; // parse edilemeyen bir string ise dokunma
  }
}
