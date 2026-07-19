/**
 * DB bağlantı singleton.
 * Next.js hot reload'da birden fazla Pool açılmasını önlemek için
 * globalThis üzerinde saklanır (Next.js dev mode pattern).
 * Yalnızca server-side import yapılacak (API routes, server actions).
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { env } from '@/lib/env';
import { pgSsl } from './ssl';

declare global {
  var __pgPool: Pool | undefined;
}

const pool = (globalThis.__pgPool ??= new Pool({
  connectionString: env.DATABASE_URL,
  ssl: pgSsl(), // Managed PG (prod) SSL; lokalde undefined → kapalı.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
}));

export const db = drizzle(pool, { schema });
