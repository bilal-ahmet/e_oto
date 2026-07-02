/**
 * Sabit ölçü (size guide) görseli — kullanıcı tek seferlik koyar, her listing'e aynısı eklenir.
 * Konum: public/templates/size-guide.(png|jpg|jpeg|webp). Yoksa null döner (publish'te atlanır).
 */

import { readFile, access } from 'fs/promises';
import path from 'path';

const DIR = path.join(process.cwd(), 'public', 'templates');
const CANDIDATES = [
  { file: 'size-guide.png', contentType: 'image/png' },
  { file: 'size-guide.jpg', contentType: 'image/jpeg' },
  { file: 'size-guide.jpeg', contentType: 'image/jpeg' },
  { file: 'size-guide.webp', contentType: 'image/webp' },
];

export async function getSizeGuide(): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> {
  for (const c of CANDIDATES) {
    const full = path.join(DIR, c.file);
    try {
      await access(full);
      const buffer = await readFile(full);
      return { buffer, contentType: c.contentType, ext: c.file.split('.').pop() ?? 'png' };
    } catch {
      // sonraki adayı dene
    }
  }
  return null;
}
