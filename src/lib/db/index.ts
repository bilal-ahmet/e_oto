/**
 * DB bağlantı singleton.
 * Next.js hot reload'da birden fazla Pool açılmasını önlemek için
 * globalThis üzerinde saklanır (Next.js dev mode pattern).
 * Yalnızca server-side import yapılacak (API routes, server actions).
 *
 * TEMBEL (lazy) kurulum — KRİTİK: Pool'u modül seviyesinde kurmak `env.DATABASE_URL`'i
 * import anında okur. `next build`'in "Collecting page data" adımı her route modülünü
 * import ettiğinden bu, build ortamında (secret'lar yokken) env doğrulamasını patlatıp
 * build'i düşürür. Bağlantı ilk gerçek sorguya kadar ertelenir; böylece build hiçbir
 * runtime secret'ına ihtiyaç duymaz.
 */

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { env } from '@/lib/env';
import { pgSsl, stripSslModeFromUrl } from './ssl';

declare global {
  var __pgPool: Pool | undefined;
}

/**
 * Ham Pool — session'a bağlı işlemler için (örn. `pg_advisory_lock`: kilit onu ALAN bağlantıya
 * aittir, başka bir bağlantıdan `unlock` çağırmak sessizce başarısız olur). Bu tür işlerde
 * `pool.connect()` ile TEK bir client alınmalı; `db` (drizzle) her sorguda farklı client kullanabilir.
 */
export function pgPool(): Pool {
  return getPool();
}

function getPool(): Pool {
  return (globalThis.__pgPool ??= new Pool({
    // sslmode connection string'den ayıklanır — SSL yalnızca aşağıdaki açık `ssl` objesiyle kontrol edilir
    // (bkz. lib/db/ssl.ts — aksi halde pg, sslmode=require'ı verify-full sayıp self-signed CA'da patlar).
    connectionString: stripSslModeFromUrl(env.DATABASE_URL),
    ssl: pgSsl(), // Managed PG (prod) SSL; lokalde undefined → kapalı.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  }));
}

let _db: NodePgDatabase<typeof schema> | undefined;

function getDb(): NodePgDatabase<typeof schema> {
  return (_db ??= drizzle(getPool(), { schema }));
}

/** Drizzle istemcisi — ilk erişimde (ilk sorguda) bağlantıyı kurar, önce değil. */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
