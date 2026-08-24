/**
 * Görsel/dosya depolama soyutlaması — iki sürücü, tek imza.
 *
 * Sürücü seçimi env ile:
 *   - `DO_SPACES_*` tam doluysa → **S3 sürücüsü** (DigitalOcean Spaces). Prod/canlı burada.
 *   - Aksi halde → **lokal disk** sürücüsü: `public/uploads/<key>` (dev).
 *
 * İmzalar sabit — çağıran kod (pipeline/run.ts, drafts route) değişmez.
 * `putObject` public URL döner; `readObject` key ile byte okur; `keyFromUrl` URL→key.
 *
 * ÖNEMLİ: App Platform dosya sistemi ephemeral olduğundan canlıda MUTLAKA Spaces sürücüsü
 * kullanılmalı; lokal disk yalnızca geliştirme içindir.
 *
 * Yalnızca server-side import edilir (API route'ları).
 */

import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '@/lib/env';

// ── Sürücü tespiti ────────────────────────────────────────────────────────────
interface SpacesConfig {
  client: S3Client;
  bucket: string;
  /** Public URL tabanı (origin, virtual-hosted): https://<bucket>.<region>.digitaloceanspaces.com */
  publicBase: string;
}

let _spaces: SpacesConfig | null | undefined;

/** Spaces yapılandırması tamsa S3 config döner, değilse null (lokal diske düşer). Bir kez hesaplanır. */
function spaces(): SpacesConfig | null {
  if (_spaces !== undefined) return _spaces;

  const { DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET, DO_SPACES_REGION, DO_SPACES_ENDPOINT } = env;
  if (!DO_SPACES_KEY || !DO_SPACES_SECRET || !DO_SPACES_BUCKET || !DO_SPACES_REGION || !DO_SPACES_ENDPOINT) {
    _spaces = null;
    return _spaces;
  }

  // endpoint örn: https://fra1.digitaloceanspaces.com
  const endpoint = DO_SPACES_ENDPOINT.replace(/\/+$/, '');
  const hostNoProto = endpoint.replace(/^https?:\/\//, '');
  const proto = endpoint.startsWith('http://') ? 'http:' : 'https:';
  // Virtual-hosted origin URL (public-read nesneler için her zaman erişilebilir, CDN gerekmez):
  const publicBase = `${proto}//${DO_SPACES_BUCKET}.${hostNoProto}`;

  const client = new S3Client({
    endpoint,
    region: DO_SPACES_REGION,
    forcePathStyle: false,
    credentials: { accessKeyId: DO_SPACES_KEY, secretAccessKey: DO_SPACES_SECRET },
  });

  _spaces = { client, bucket: DO_SPACES_BUCKET, publicBase };
  return _spaces;
}

/** Key normalizasyonu — baştaki / ve `..` path-traversal temizliği (her iki sürücüde). */
function safeKey(key: string): string {
  return key.replace(/^\/+/, '').replace(/\.\.+/g, '');
}

// ── Lokal disk sürücüsü ───────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

async function putLocal(key: string, body: Buffer): Promise<string> {
  const filePath = path.join(UPLOADS_DIR, key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
  const base = env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${base}/uploads/${key.split(path.sep).join('/')}`;
}

async function readLocal(key: string): Promise<Buffer> {
  return readFile(path.join(UPLOADS_DIR, key));
}

async function deletePrefixLocal(prefix: string): Promise<number> {
  // Lokalde prefix = klasör (`runs/<id>/`). Yoksa sessiz geçer (force).
  await rm(path.join(UPLOADS_DIR, prefix), { recursive: true, force: true });
  return 0; // lokal sürücüde sayım tutulmaz — çağıran yalnızca Spaces'te anlamlı sayar.
}

// ── S3 (Spaces) sürücüsü ──────────────────────────────────────────────────────
// Spaces yanıt vermezse pipeline adımı sonsuza kadar beklemesin — AWS SDK abortSignal ile
// isteği GERÇEKTEN iptal eder (soket kapanır, sızıntı olmaz).
const SPACES_TIMEOUT_MS = 3 * 60_000;

async function putSpaces(cfg: SpacesConfig, key: string, body: Buffer, contentType: string): Promise<string> {
  await cfg.client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read', // panel <img> ve genel erişim için nesneler herkese açık okunur.
    }),
    { abortSignal: AbortSignal.timeout(SPACES_TIMEOUT_MS) },
  );
  return `${cfg.publicBase}/${key}`;
}

/**
 * Bir prefix altındaki TÜM nesneleri siler. Liste sayfalanır (>1000 nesne), silme 1000'lik
 * gruplar hâlinde yapılır (DeleteObjects tek çağrıda en fazla 1000 anahtar kabul eder).
 */
async function deletePrefixSpaces(cfg: SpacesConfig, prefix: string): Promise<number> {
  let deleted = 0;
  let token: string | undefined;
  do {
    const listed = await cfg.client.send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token }),
      { abortSignal: AbortSignal.timeout(SPACES_TIMEOUT_MS) },
    );
    const keys = (listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
    if (keys.length > 0) {
      await cfg.client.send(
        new DeleteObjectsCommand({
          Bucket: cfg.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
        { abortSignal: AbortSignal.timeout(SPACES_TIMEOUT_MS) },
      );
      deleted += keys.length;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

async function readSpaces(cfg: SpacesConfig, key: string): Promise<Buffer> {
  const res = await cfg.client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), {
    abortSignal: AbortSignal.timeout(SPACES_TIMEOUT_MS),
  });
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

// ── Public API (imzalar sabit) ────────────────────────────────────────────────

/**
 * Bir nesneyi depolar ve public URL döner.
 * @param key  Depolama anahtarı (alt klasör içerebilir, örn. `runs/<id>/master.jpg`).
 * @param body Dosya içeriği.
 * @param contentType MIME tipi (S3 sürücüsünde ContentType olarak yazılır; lokalde kullanılmaz).
 */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const k = safeKey(key);
  const cfg = spaces();
  return cfg ? putSpaces(cfg, k, body, contentType) : putLocal(k, body);
}

/** Daha önce putObject ile yazılmış bir nesneyi anahtarına göre okur. */
export async function readObject(key: string): Promise<Buffer> {
  const k = safeKey(key);
  const cfg = spaces();
  return cfg ? readSpaces(cfg, k) : readLocal(k);
}

/**
 * putObject ile dönen public URL'den depolama anahtarını çıkarır.
 * Spaces URL'i (virtual-hosted), lokal `/uploads/...` URL'i ve doğrudan key — üçünü de karşılar.
 */
export function keyFromUrl(url: string): string {
  // 1) Spaces public URL: tabanı soy.
  const cfg = spaces();
  if (cfg && url.startsWith(cfg.publicBase + '/')) {
    return url.slice(cfg.publicBase.length + 1);
  }
  // 2) Herhangi bir digitaloceanspaces.com URL'i: path = key (virtual-hosted).
  if (/^https?:\/\/[^/]+\.digitaloceanspaces\.com\//i.test(url)) {
    try {
      return new URL(url).pathname.replace(/^\/+/, '');
    } catch {
      /* düşer */
    }
  }
  // 3) Lokal/legacy `/uploads/<key>` URL'i.
  const idx = url.indexOf('/uploads/');
  if (idx >= 0) return url.slice(idx + '/uploads/'.length);
  // 4) Zaten ham key ise olduğu gibi bırak.
  return url;
}

/**
 * Bir prefix altındaki her şeyi siler (örn. `runs/<id>/` → o run'ın master'ı, JPG'leri,
 * mockup'ları, videosu). GERİ DÖNÜŞÜ YOKTUR; yalnızca kullanıcı onaylı temizlik akışında çağrılır.
 * Dönen sayı Spaces'te silinen nesne adedidir (lokal sürücüde 0).
 */
export async function deletePrefix(prefix: string): Promise<number> {
  const p = safeKey(prefix);
  if (!p) return 0; // boş prefix TÜM bucket'ı silerdi — kesinlikle engelle.
  const cfg = spaces();
  return cfg ? deletePrefixSpaces(cfg, p) : deletePrefixLocal(p);
}

/**
 * TEK bir nesneyi siler. Yoksa sessizce geçer (iki sürücüde de idempotent).
 * Kaydı silinen içeriğin dosyası da gitsin diye kullanılır (örn. taslak silme) — aksi hâlde
 * depoda hiçbir zaman temizlenmeyen yetim dosyalar birikir.
 */
export async function deleteObject(key: string): Promise<void> {
  const k = safeKey(key);
  if (!k) return;
  const cfg = spaces();
  if (!cfg) {
    await rm(path.join(UPLOADS_DIR, k), { force: true });
    return;
  }
  await cfg.client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: k }), {
    abortSignal: AbortSignal.timeout(SPACES_TIMEOUT_MS),
  });
}
