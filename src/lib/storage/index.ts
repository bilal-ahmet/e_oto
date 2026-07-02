/**
 * Görsel/dosya depolama soyutlaması.
 *
 * Şu an: lokal disk sürücüsü — dosyalar `public/uploads/<key>` altına yazılır ve
 * `${PUBLIC_BASE_URL}/uploads/<key>` public URL'i döner (Next statik servis eder).
 * İleride DO Spaces'e geçmek için sadece `putObject` implementasyonu değişir; imza sabit.
 *
 * Yalnızca server-side import edilir (API route'ları).
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { env } from '@/lib/env';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

/**
 * Bir nesneyi depolar ve public URL döner.
 * @param key  Depolama anahtarı (alt klasör içerebilir, örn. `runs/<id>/master.jpg`).
 * @param body Dosya içeriği.
 * @param _contentType MIME tipi (lokal sürücüde kullanılmaz; S3 sürücüsünde kullanılacak).
 */
export async function putObject(
  key: string,
  body: Buffer,
  _contentType: string,
): Promise<string> {
  const safeKey = key.replace(/^\/+/, '').replace(/\.\.+/g, '');
  const filePath = path.join(UPLOADS_DIR, safeKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
  const base = env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${base}/uploads/${safeKey.split(path.sep).join('/')}`;
}

/** Daha önce putObject ile yazılmış bir nesneyi anahtarına göre okur. */
export async function readObject(key: string): Promise<Buffer> {
  const safeKey = key.replace(/^\/+/, '').replace(/\.\.+/g, '');
  return readFile(path.join(UPLOADS_DIR, safeKey));
}

/** putObject ile dönen public URL'den depolama anahtarını çıkarır. */
export function keyFromUrl(url: string): string {
  const idx = url.indexOf('/uploads/');
  return idx >= 0 ? url.slice(idx + '/uploads/'.length) : url;
}
