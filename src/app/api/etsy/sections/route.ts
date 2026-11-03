/**
 * GET /api/etsy/sections?productType=print|tv
 * Mağazanın Etsy bölümlerini (section) + bu ürün tipi için son seçileni döner — gate 3'te
 * ilanın bölümü seçilir. SALT OKUNUR; bölümler Etsy panelinden oluşturulur (`shops_w` istenmez).
 * Upstream (Etsy) hatası → 424 (502/504 DEĞİL — CLAUDE.md kural 4).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getShopId, getShopSections } from '@/lib/etsy/listings';
import { getSetting } from '@/lib/db/queries';

const UPSTREAM_FAILED = 424;

export async function GET(req: NextRequest) {
  const productType = req.nextUrl.searchParams.get('productType') === 'tv' ? 'tv' : 'print';
  try {
    const [sections, saved] = await Promise.all([
      getShopId().then(getShopSections),
      getSetting(productType === 'tv' ? 'etsy_section_tv' : 'etsy_section_print'),
    ]);
    const savedId = saved && saved !== 'none' ? Number(saved) : null;
    // Kayıtlı bölüm Etsy'de silinmişse varsayılan bölümsüze düşer.
    const defaultSectionId = savedId && sections.some((s) => s.id === savedId) ? savedId : null;
    return NextResponse.json({ sections, defaultSectionId });
  } catch (e) {
    return NextResponse.json(
      { error: `Etsy bölümleri alınamadı: ${e instanceof Error ? e.message : String(e)}` },
      { status: UPSTREAM_FAILED },
    );
  }
}
