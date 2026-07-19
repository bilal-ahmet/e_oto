/**
 * Prod migration çalıştırıcı — App Platform Pre-Deploy Job bunu çağırır (`npm run db:migrate`).
 * Yeni kod canlıya geçmeden önce `migrations/` altındaki tüm bekleyen migration'ları uygular.
 *
 * Kendi SSL'li pool'unu açar (Managed PG) — drizzle-kit'e bağımlı değildir.
 * Lokalde de çalışır: @next/env ile .env.local yüklenir.
 */

import { loadEnvConfig } from '@next/env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { pgSsl } from '../src/lib/db/ssl';

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL tanımlı değil — migration çalıştırılamaz.');

  const pool = new Pool({ connectionString, ssl: pgSsl(), max: 1 });
  try {
    console.log('[migrate] migration başlıyor…');
    await migrate(drizzle(pool), { migrationsFolder: 'migrations' });
    console.log('[migrate] tüm migration\'lar uygulandı ✓');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] HATA:', err instanceof Error ? err.message : err);
  process.exit(1);
});
