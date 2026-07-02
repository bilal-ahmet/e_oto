/**
 * GET /api/competitors — taranmış rakip mağazaları ve ürünleri döner.
 * Query: ?shopId=123 (opsiyonel) belirli mağazanın ürünlerini filtreler.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { listCompetitorListings, listCompetitorShops } from '@/lib/db/queries';

export async function GET(req: NextRequest) {
  const shopIdParam = req.nextUrl.searchParams.get('shopId');
  const shopId = shopIdParam ? Number(shopIdParam) : undefined;

  const [shops, listings] = await Promise.all([
    listCompetitorShops(),
    listCompetitorListings(shopId),
  ]);

  return NextResponse.json({ shops, listings });
}
