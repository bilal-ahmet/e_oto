/**
 * GET /api/competitor-research/image?url=<Etsy CDN görsel URL'i>
 *
 * Rakip ilanın görselini SUNUCU üzerinden getirir — üretim formu bunu referans görsele otomatik
 * yükler. Neden aracı: tarayıcı Etsy CDN'inden doğrudan çekerse CORS'a takılabilir.
 *
 * SSRF koruması: yalnız `https://*.etsystatic.com` kabul edilir; yönlendirme izlenmez; yanıt
 * görsel olmalı ve 20 MB'ı aşmamalı. Upstream hatası → 424 (CLAUDE.md kural 4).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { TIMEOUTS, fetchWithTimeout } from '@/lib/async/timeout';

const UPSTREAM_FAILED = 424;
const MAX_BYTES = 20 * 1024 * 1024;

function allowed(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (u.hostname === 'etsystatic.com' || u.hostname.endsWith('.etsystatic.com'))
      ? u
      : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = allowed(req.nextUrl.searchParams.get('url'));
  if (!url) return NextResponse.json({ error: 'Yalnız Etsy görsel adresleri (etsystatic.com) kabul edilir.' }, { status: 400 });

  try {
    const res = await fetchWithTimeout(url.toString(), { redirect: 'error' }, TIMEOUTS.transfer, 'Etsy görsel indirme');
    if (!res.ok) throw new Error(`Etsy görseli ${res.status} döndü.`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) throw new Error(`Beklenmeyen içerik türü: ${type || 'yok'}.`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('Görsel 20 MB sınırını aşıyor.');
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Rakip görseli alınamadı: ${e instanceof Error ? e.message : String(e)}` },
      { status: UPSTREAM_FAILED },
    );
  }
}
