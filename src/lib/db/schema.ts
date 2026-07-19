/**
 * Drizzle ORM şeması — CLAUDE.md §4 ile birebir uyumlu.
 * JS key adları camelCase (TypeScript); DB kolon adları snake_case.
 * updated_at: UPDATE sorgularında `updatedAt: new Date()` manuel eklenir (Drizzle trigger yazmaz).
 */

import {
  bigint,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DigitalFileUrls, ImageModel, MediaUrls, PipelineStatus, PublishProgress, SeoData } from '@/types';

// ────────────────────────────────────────────────────────────────────────────
// oauth_tokens
// ────────────────────────────────────────────────────────────────────────────
export const oauthTokens = pgTable('oauth_tokens', {
  id: serial('id').primaryKey(),
  // unique: her provider için tek satır — queries.upsertOAuthToken ON CONFLICT (provider) buna dayanır.
  provider: text('provider', { enum: ['etsy', 'pinterest'] }).notNull().unique(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ────────────────────────────────────────────────────────────────────────────
// pipeline_runs
// ────────────────────────────────────────────────────────────────────────────
export const pipelineRuns = pgTable('pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status')
    .$type<PipelineStatus>()
    .notNull()
    .default('queued'),
  prompt: text('prompt').notNull(),
  imageModel: text('image_model').$type<ImageModel>(),
  // Mantıksal FK → competitor_research.id. Döngüsel FK'yı (research ↔ run) kırmak için Drizzle
  // .references() KULLANILMAZ; bağ uygulama katmanında linkCompetitorResearchToRun ile kurulur.
  competitorResearchId: integer('competitor_research_id'),
  referenceImageUrl: text('reference_image_url'),
  variationUrls: jsonb('variation_urls').$type<string[]>(),
  generatedImageUrl: text('generated_image_url'),
  upscaledImageUrl: text('upscaled_image_url'),
  digitalFileUrls: jsonb('digital_file_urls').$type<DigitalFileUrls>(),
  mediaUrls: jsonb('media_urls').$type<MediaUrls>(),
  seoJson: jsonb('seo_json').$type<SeoData>(),
  etsyListingId: bigint('etsy_listing_id', { mode: 'number' }),
  pinterestPinId: text('pinterest_pin_id'),
  // Dayanıklılık: kurtarma sweeper'ının yeniden deneme sayacı + Etsy yayın checkpoint'i.
  attempts: integer('attempts').default(0).notNull(),
  publishProgress: jsonb('publish_progress').$type<PublishProgress>(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ────────────────────────────────────────────────────────────────────────────
// competitor_shops
// ────────────────────────────────────────────────────────────────────────────
export const competitorShops = pgTable('competitor_shops', {
  shopId: bigint('shop_id', { mode: 'number' }).primaryKey(),
  shopName: text('shop_name').notNull(),
  totalSales: bigint('total_sales', { mode: 'number' }),
  totalReviews: bigint('total_reviews', { mode: 'number' }),
  reviewRatio: numeric('review_ratio'),  // total_reviews / total_sales; string olarak döner → queries.ts'de parseFloat()
  lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
});

// ────────────────────────────────────────────────────────────────────────────
// competitor_listings  (FK: shop_id → competitor_shops.shop_id)
// ────────────────────────────────────────────────────────────────────────────
export const competitorListings = pgTable('competitor_listings', {
  listingId: bigint('listing_id', { mode: 'number' }).primaryKey(),
  shopId: bigint('shop_id', { mode: 'number' }).references(() => competitorShops.shopId),
  title: text('title'),
  tags: jsonb('tags').$type<string[]>(),
  price: numeric('price'),
  numFavorers: bigint('num_favorers', { mode: 'number' }),
  reviewCount: bigint('review_count', { mode: 'number' }),
  creationDate: timestamp('creation_date', { withTimezone: true }),
  estimatedSales: numeric('estimated_sales'),
  monthlyVelocity: numeric('monthly_velocity'),
  opportunityScore: numeric('opportunity_score'),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).defaultNow(),
});

// ────────────────────────────────────────────────────────────────────────────
// competitor_research  (FK: pipeline_run_id → pipeline_runs.id, nullable)
// Kullanıcının girdiği rakip listing URL'inden çekilen veriler + üretilen özgün SEO.
// ────────────────────────────────────────────────────────────────────────────
export const competitorResearch = pgTable('competitor_research', {
  id: serial('id').primaryKey(),
  // Analiz, run'dan ÖNCE oluşur → nullable; run oluşunca linkCompetitorResearchToRun set eder.
  pipelineRunId: uuid('pipeline_run_id').references(() => pipelineRuns.id),
  sourceListingId: bigint('source_listing_id', { mode: 'number' }).notNull(),
  sourceUrl: text('source_url').notNull(),
  sourceTitle: text('source_title'),
  sourceTags: jsonb('source_tags').$type<string[]>(),
  sourceTaxonomyId: bigint('source_taxonomy_id', { mode: 'number' }),
  sourceNumFavorers: bigint('source_num_favorers', { mode: 'number' }),
  sourceViews: bigint('source_views', { mode: 'number' }),
  generatedTitle: text('generated_title'),
  generatedTags: jsonb('generated_tags').$type<string[]>(),
  generatedDescription: text('generated_description'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ────────────────────────────────────────────────────────────────────────────
// image_drafts
// Kullanıcının kaydettiği görseller (beğenilen varyasyonlar + dışarıdan yüklenen
// görseller). Buradan "taslakla devam et" ile yeni bir run başlatılıp yayına gidilebilir.
// ────────────────────────────────────────────────────────────────────────────
export const imageDrafts = pgTable('image_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  imageUrl: text('image_url').notNull(),
  source: text('source', { enum: ['variation', 'upload'] }).notNull(),
  prompt: text('prompt'), // varyasyon kaynaklıysa üretim prompt'u; upload'ta null
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Tip yardımcıları (queries.ts'de kullanılır) ──────────────────────────────
export type OAuthTokenRow = typeof oauthTokens.$inferSelect;
export type ImageDraftRow = typeof imageDrafts.$inferSelect;
export type PipelineRunRow = typeof pipelineRuns.$inferSelect;
export type CompetitorShopRow = typeof competitorShops.$inferSelect;
export type CompetitorListingRow = typeof competitorListings.$inferSelect;
export type CompetitorResearchRow = typeof competitorResearch.$inferSelect;
