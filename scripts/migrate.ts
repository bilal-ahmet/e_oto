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
import { pgSsl, stripSslModeFromUrl } from '../src/lib/db/ssl';

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL tanımlı değil — migration çalıştırılamaz.');

  // sslmode connection string'den ayıklanır — SSL yalnızca pgSsl()'in döndürdüğü açık objeyle kontrol edilir.
  const pool = new Pool({ connectionString: stripSslModeFromUrl(connectionString), ssl: pgSsl(), max: 1 });
  try {
    console.log('[migrate] migration başlıyor…');
    await migrate(drizzle(pool), { migrationsFolder: 'migrations' });
    console.log('[migrate] tüm migration\'lar uygulandı ✓');
  } finally {
    await pool.end();
  }
}

/**
 * Hatayı TÜM zinciriyle basar. drizzle sorgu hatalarını `Failed query: ...` diye sarmalar ve
 * asıl PostgreSQL hatasını (code/detail/hint — teşhis için gereken her şey) `cause` içine koyar;
 * yalnızca `message` basmak bu bilgiyi yutar.
 */
function describeError(err: unknown, depth = 0): string {
  const pad = '  '.repeat(depth);
  if (!(err instanceof Error)) return `${pad}${String(err)}`;

  const lines = [`${pad}${err.name}: ${err.message}`];

  // node-postgres hata alanları (varsa) — asıl teşhis burada.
  const pg = err as Error & {
    code?: string;
    detail?: string;
    hint?: string;
    severity?: string;
    routine?: string;
  };
  for (const field of ['code', 'severity', 'detail', 'hint', 'routine'] as const) {
    if (pg[field]) lines.push(`${pad}  ${field}: ${pg[field]}`);
  }

  if (err.cause !== undefined) {
    lines.push(`${pad}  cause:`);
    lines.push(describeError(err.cause, depth + 2));
  }
  return lines.join('\n');
}

main().catch((err) => {
  console.error('[migrate] HATA:\n' + describeError(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
