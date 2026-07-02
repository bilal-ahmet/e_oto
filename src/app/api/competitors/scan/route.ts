/**
 * POST /api/competitors/scan
 * Body: { shopId?: number, shopName?: string, maxListings?: number }
 * Rakip tarama algoritmasını çalıştırır, sonuçları DB'ye yazar ve döner.
 * (Etsy API erişimi gerekir; erişim yoksa anlamlı hata döner.)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { scanCompetitor } from '@/lib/scoring/competitor-algorithm';

export async function POST(req: NextRequest) {
  let body: { shopId?: number; shopName?: string; maxListings?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  if (!body.shopId && !body.shopName?.trim()) {
    return NextResponse.json({ error: 'shopId veya shopName gerekli.' }, { status: 400 });
  }

  try {
    const result = await scanCompetitor({
      shopId: body.shopId,
      shopName: body.shopName?.trim(),
      maxListings: body.maxListings,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Tarama başarısız.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
