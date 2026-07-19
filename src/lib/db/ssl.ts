/**
 * PostgreSQL SSL ayarı — Managed PG (DigitalOcean) SSL zorunlu; lokalde kapalı.
 *
 * Env ile sürülür (env.ts zod şemasına dokunmadan, process.env doğrudan — COMPETITOR_CRON_ENABLED
 * ile aynı desen):
 *   - DATABASE_SSL=true VEYA DATABASE_URL'de `sslmode=require` → SSL aç.
 *   - DATABASE_CA_CERT (PEM) verilmişse → sertifika doğrulamalı (en güvenli).
 *   - CA yoksa → şifreli ama doğrulamasız (DO self-signed CA için pratik varsayılan).
 *   - Hiçbiri yoksa → SSL kapalı (lokal Postgres).
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
