/**
 * Sunucu tarafı ortam değişkenleri — yalnızca server-side dosyalarda import et.
 * Faz 2: DATABASE_URL + TOKEN_ENCRYPTION_KEY zorunlu; API anahtarları Faz 3-5'te zorunlu hale gelecek.
 */

import { z } from 'zod';

// .env'de boş bırakılan değişkenler '' olarak gelir; opsiyonel alanlar için bunu undefined say.
const emptyToUndef = (v: unknown) => (v === '' ? undefined : v);
const optStr = () => z.preprocess(emptyToUndef, z.string().min(1).optional());
const optUrl = () => z.preprocess(emptyToUndef, z.string().url().optional());

const schema = z.object({
  // Faz 2 — DB katmanı (zorunlu)
  DATABASE_URL: z.string().url('DATABASE_URL geçerli bir PostgreSQL URL olmalı'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .length(64, 'TOKEN_ENCRYPTION_KEY 64 hex karakter (32 byte) olmalı — openssl rand -hex 32'),

  // Faz 3 — OAuth (şimdi opsiyonel)
  ETSY_CLIENT_ID: optStr(),
  ETSY_CLIENT_SECRET: optStr(),
  ETSY_REDIRECT_URI: optUrl(),
  PINTEREST_CLIENT_ID: optStr(),
  PINTEREST_CLIENT_SECRET: optStr(),
  PINTEREST_REDIRECT_URI: optUrl(),

  // Faz 4 — Görsel üretim (şimdi opsiyonel)
  GOOGLE_API_KEY: optStr(), // Imagen (Google AI Studio)
  FAL_KEY: optStr(), // fal.ai — FLUX.1 Kontext [pro] + clarity-upscaler
  ETSY_SHOP_NAME: z.preprocess(emptyToUndef, z.string().default('VeloraArtDesigns')), // açıklama TERMS/telif
  // Lokal disk depolama için public URL tabanı (DO Spaces yoksa).
  PUBLIC_BASE_URL: z.preprocess(emptyToUndef, z.string().url().default('http://localhost:3000')),
  DO_SPACES_KEY: optStr(),
  DO_SPACES_SECRET: optStr(),
  DO_SPACES_BUCKET: optStr(),
  DO_SPACES_REGION: optStr(),
  DO_SPACES_ENDPOINT: optUrl(),
  UPSCALE_API_KEY: optStr(),

  // Faz 5 — SEO / Claude (şimdi opsiyonel)
  ANTHROPIC_API_KEY: optStr(),
});

export type Env = z.infer<typeof schema>;

function validate(): Env {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Eksik veya hatalı ortam değişkenleri:\n${missing}`);
  }
  return result.data;
}

// Singleton — process başına bir kez doğrulanır.
// Yalnızca server-side import yapılacak; build sırasında page'ler tarafından import edilmez.
let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) _env = validate();
  return _env;
}

/**
 * Üretim (NODE_ENV=production) ek doğrulaması — instrumentation boot'unda çağrılır.
 * KRİTİK: Spaces eksikse boot'u durdurur; çünkü App Platform diski ephemeral olduğundan
 * lokal diske yazılan tüm görseller/dosyalar restart'ta kaybolur (sessiz veri kaybı).
 * Diğer eksik anahtarlar için yalnızca uyarır.
 */
export function assertProdEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const e = getEnv();

  const spacesComplete =
    e.DO_SPACES_KEY && e.DO_SPACES_SECRET && e.DO_SPACES_BUCKET && e.DO_SPACES_REGION && e.DO_SPACES_ENDPOINT;
  if (!spacesComplete) {
    // PUBLIC_BASE_URL hâlâ localhost ise gerçek bir deploy değil (dev'de `next start` denemesi) → sert hata atma.
    const isLocal = /localhost|127\.0\.0\.1/.test(e.PUBLIC_BASE_URL);
    if (isLocal) {
      console.warn('[env] Üretim modu ama PUBLIC_BASE_URL localhost — Spaces zorunluluğu atlandı (lokal test).');
    } else {
      throw new Error(
        'Üretimde DO_SPACES_* eksik — App Platform diski ephemeral olduğundan dosyalar kaybolur. Spaces yapılandırın.',
      );
    }
  }

  const recommended: Array<[string, unknown]> = [
    ['ANTHROPIC_API_KEY', e.ANTHROPIC_API_KEY],
    ['FAL_KEY', e.FAL_KEY],
    ['ETSY_CLIENT_ID', e.ETSY_CLIENT_ID],
    ['ETSY_CLIENT_SECRET', e.ETSY_CLIENT_SECRET],
    ['ETSY_REDIRECT_URI', e.ETSY_REDIRECT_URI],
  ];
  for (const [name, val] of recommended) {
    if (!val) console.warn(`[env] Uyarı: üretimde ${name} tanımlı değil — ilgili özellik çalışmayabilir.`);
  }
}

// Convenience proxy: env.DATABASE_URL şeklinde erişim sağlar, lazy validate eder.
export const env = new Proxy({} as Env, {
  get(_target, key: string) {
    return getEnv()[key as keyof Env];
  },
});
