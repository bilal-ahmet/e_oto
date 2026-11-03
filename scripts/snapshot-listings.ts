/**
 * Etsy ilanlarının SALT OKUNUR anlık görüntüsü — elle yapılan değişikliklerin geri dönüp
 * dönmediğini izlemek için. `npx tsx scripts/snapshot-listings.ts <listingId> [listingId…]`
 *
 * Yalnız GET çağrıları yapar (`/listings/{id}`, `/listings/{id}/images`) — ilana hiçbir şey
 * YAZMAZ. Çıktı: `snapshots/listings-<ISO>.json` (gitignore'da). İki anlık görüntü `diff` ile
 * karşılaştırılır; açıklama tam metin yerine SHA-256 + uzunluk olarak saklanır.
 *
 * Not: Bu uygulama mevcut ilanları GÜNCELLEMEZ (kodda PATCH/PUT yalnız kendi oluşturduğu taslağın
 * özniteliklerine yapılır). Bir değerin geri dönmesi tek başına otomasyonun sebep olduğunu kanıtlamaz —
 * `updated_timestamp` ve Etsy panelindeki değişiklik geçmişiyle birlikte değerlendirin.
 * Token/anahtar çıktıya YAZILMAZ.
 */

import { loadEnvConfig } from '@next/env';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

loadEnvConfig(process.cwd());

interface ListingResp {
  listing_id: number;
  shop_id?: number;
  state?: string;
  title?: string;
  tags?: string[];
  materials?: string[];
  description?: string;
  updated_timestamp?: number;
  last_modified_timestamp?: number;
  url?: string;
}

interface ImagesResp {
  results?: { listing_image_id: number; rank?: number; alt_text?: string | null }[];
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    console.error('Kullanım: npx tsx scripts/snapshot-listings.ts <listingId> [listingId…]');
    process.exit(2);
  }
  // Env yüklendikten SONRA import: client modülü getEnv'i çağırır.
  const { etsyFetch } = await import('../src/lib/etsy/client');

  const out: Record<string, unknown>[] = [];
  for (const id of ids) {
    try {
      const l = await etsyFetch<ListingResp>(`/listings/${id}`);
      const imgs = await etsyFetch<ImagesResp>(`/listings/${id}/images`);
      const desc = l.description ?? '';
      out.push({
        listingId: id,
        shopId: l.shop_id ?? null,
        state: l.state ?? null,
        title: l.title ?? null,
        tags: l.tags ?? [],
        materials: l.materials ?? [],
        descriptionSha256: createHash('sha256').update(desc).digest('hex'),
        descriptionLength: desc.length,
        updatedAt: l.updated_timestamp ? new Date(l.updated_timestamp * 1000).toISOString() : null,
        lastModifiedAt: l.last_modified_timestamp ? new Date(l.last_modified_timestamp * 1000).toISOString() : null,
        images: (imgs.results ?? [])
          .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
          .map((i) => ({ id: i.listing_image_id, rank: i.rank ?? null, altText: i.alt_text ?? null })),
      });
      console.log(`✓ ${id} okundu (${l.state ?? '?'})`);
    } catch (e) {
      out.push({ listingId: id, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
      console.error(`✗ ${id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const takenAt = new Date().toISOString();
  mkdirSync('snapshots', { recursive: true });
  const file = join('snapshots', `listings-${takenAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ takenAt, listings: out }, null, 2));
  console.log(`\nKaydedildi: ${file}`);
  process.exit(0);
}

void main();
