import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';
import { stripSslModeFromUrl } from './src/lib/db/ssl';

loadEnvConfig(process.cwd());

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // sslmode ayıklanır — aksi halde pg-connection-string bunu verify-full sayıp DO'nun
    // self-signed CA'sıyla SELF_SIGNED_CERT_IN_CHAIN'e yol açar (bkz. lib/db/ssl.ts).
    url: stripSslModeFromUrl(process.env.DATABASE_URL!),
    // Managed PG için SSL (yalnızca drizzle-kit push/studio kullanılırsa devreye girer;
    // prod migration'ı scripts/migrate.ts kendi SSL'li pool'uyla çalıştırır).
    ssl:
      process.env.DATABASE_SSL === 'true' || /[?&]sslmode=require/i.test(process.env.DATABASE_URL ?? '')
        ? { rejectUnauthorized: false }
        : undefined,
  },
});
