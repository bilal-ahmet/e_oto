/**
 * fal.ai GERÇEK harcama dökümü (salt okunur) — `npm run fal:usage [-- --days 30]`
 *
 * `GET https://api.fal.ai/v1/models/usage?expand=summary` ile model (endpoint) başına adet, birim
 * ve tutarı yazdırır. Panelde gösterilen maliyet liste fiyatından TAHMİNDİR; bu betik faturadaki
 * gerçek rakamı verir — ikisi karşılaştırılarak sapma görülür.
 *
 * Anahtar: `.env.local` → `FAL_BILLING_KEY` (fal panelinde "Billing" ön ayarlı anahtar; izin
 * `billing:usage:read`). Üretim anahtarı `FAL_KEY` bu izne genelde sahip değildir (403).
 * Anahtar hiçbir yere yazdırılmaz.
 */

import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

interface UsageRow {
  endpoint_id: string;
  unit: string;
  quantity: number;
  unit_price: number;
  cost_total?: number;
  cost?: number;
  currency?: string;
}

async function main(): Promise<void> {
  const daysArg = process.argv.indexOf('--days');
  const days = daysArg > 0 ? Number(process.argv[daysArg + 1]) || 30 : 30;
  const key = process.env.FAL_BILLING_KEY || process.env.FAL_KEY;
  if (!key) {
    console.error('FAL_BILLING_KEY (ya da FAL_KEY) tanımlı değil — .env.local\'e ekleyin.');
    process.exit(2);
  }
  const end = new Date();
  const start = new Date(end.getTime() - days * 864e5);
  const rows: UsageRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), expand: 'summary', limit: '100' });
    if (cursor) q.set('cursor', cursor);
    const res = await fetch(`https://api.fal.ai/v1/models/usage?${q}`, {
      headers: { Authorization: `Key ${key}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 || res.status === 403) {
      console.error(
        `fal ${res.status}: anahtarın faturalama okuma izni yok. fal panelinde "Billing" ön ayarlı bir anahtar\n` +
          'oluşturup .env.local\'e FAL_BILLING_KEY=... olarak ekleyin (commit etmeyin).',
      );
      process.exit(1);
    }
    if (!res.ok) throw new Error(`fal kullanım API'si ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { summary?: UsageRow[]; has_more?: boolean; next_cursor?: string | null };
    rows.push(...(j.summary ?? []));
    if (!j.has_more || !j.next_cursor) break;
    cursor = j.next_cursor;
  }

  const cost = (r: UsageRow) => r.cost_total ?? r.cost ?? 0;
  rows.sort((a, b) => cost(b) - cost(a));
  const total = rows.reduce((s, r) => s + cost(r), 0);
  console.log(`fal harcaması — son ${days} gün (${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)})\n`);
  for (const r of rows) {
    const share = total ? ((cost(r) / total) * 100).toFixed(0) : '0';
    console.log(
      `${r.endpoint_id.padEnd(42)} ${String(r.quantity).padStart(10)} ${r.unit.padEnd(11)} × $${r.unit_price}  = $${cost(r).toFixed(2).padStart(8)}  (%${share})`,
    );
  }
  console.log(`\nTOPLAM: $${total.toFixed(2)} ${rows[0]?.currency ?? 'USD'}`);
}

void main().catch((e) => {
  console.error('HATA:', e instanceof Error ? e.message : e);
  process.exit(1);
});
