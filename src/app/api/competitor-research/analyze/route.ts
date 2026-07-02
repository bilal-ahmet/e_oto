/**
 * POST /api/competitor-research/analyze
 * Body: { url: string }  — kullanıcının girdiği Etsy listing URL'i.
 *
 * URL'den listing_id parse eder → public Etsy GET /listings/{id} ile referans veriyi çeker →
 * Claude ile özgün SEO (title + 13 tag + description) üretir → competitor_research'e kaydeder.
 * SENKRON döner (tek Claude çağrısı): { id, source, generated }. Sonra /generate'de bu id ile
 * üretim başlatılır (gate 2'de SEO o nişe yönlendirilir).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getListingById } from '@/lib/etsy/listings';
import { analyzeCompetitorSeo } from '@/lib/claude/competitor-seo';
import { createCompetitorResearch } from '@/lib/db/queries';

// Ülke prefix'i (/tr/, /de/ ...) olsa da listing_id'yi yakalar.
const LISTING_ID_RE = /\/listing\/(\d+)/;

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövde.' }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: 'url zorunlu.' }, { status: 400 });

  const match = url.match(LISTING_ID_RE);
  if (!match) {
    return NextResponse.json(
      { error: 'URL içinde listing kimliği bulunamadı (beklenen biçim: /listing/{id}).' },
      { status: 400 },
    );
  }
  const listingId = Number(match[1]);

  try {
    const listing = await getListingById(listingId);

    const generated = await analyzeCompetitorSeo({
      title: listing.title,
      tags: listing.tags,
      description: listing.description,
      materials: listing.materials,
      style: listing.style,
      taxonomyId: listing.taxonomy_id,
      whoMade: listing.who_made,
      whenMade: listing.when_made,
      numFavorers: listing.num_favorers,
      views: listing.views,
    });

    const research = await createCompetitorResearch({
      sourceListingId: listingId,
      sourceUrl: url,
      sourceTitle: listing.title,
      sourceTags: listing.tags,
      sourceTaxonomyId: listing.taxonomy_id || undefined,
      sourceNumFavorers: listing.num_favorers,
      sourceViews: listing.views,
      generatedTitle: generated.title,
      generatedTags: generated.tags,
      generatedDescription: generated.description,
    });

    return NextResponse.json({
      id: research.id,
      source: {
        listingId,
        title: listing.title,
        tags: listing.tags,
        taxonomyId: listing.taxonomy_id,
        numFavorers: listing.num_favorers,
        views: listing.views,
      },
      generated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rakip analizi başarısız.';
    // Etsy 404 (silinmiş/private) dahil hata mesajını ilet.
    const status = /\b404\b/.test(message) ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
