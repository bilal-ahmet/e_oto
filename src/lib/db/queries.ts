/**
 * Typed CRUD fonksiyonlar — DB satırı ↔ domain tipi dönüşümünü burada yapıyoruz.
 * snake_case DB kolonları, Drizzle schema'da camelCase JS key olarak tanımlı olduğundan
 * dönen objeler zaten camelCase; sadece numeric → number dönüşümü gerekiyor.
 * updated_at: her UPDATE'te `updatedAt: new Date()` manuel eklenir.
 */

import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db, pgPool } from './index';
import {
  appSettings,
  competitorListings,
  competitorResearch,
  competitorShops,
  imageDrafts,
  oauthTokens,
  pipelineRuns,
  type CompetitorListingRow,
  type CompetitorResearchRow,
  type CompetitorShopRow,
  type ImageDraftRow,
  type PipelineRunRow,
} from './schema';
import { decrypt, encrypt } from './crypto';
import type {
  CompetitorListing,
  CompetitorResearch,
  CompetitorShop,
  DigitalFileUrls,
  ImageDraft,
  ImageModel,
  MediaUrls,
  PipelineRun,
  PipelineStatus,
  PublishProgress,
  SeoData,
} from '@/types';

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function n(v: string | null | undefined): number {
  return v == null ? 0 : parseFloat(v);
}

function rowToPipelineRun(row: PipelineRunRow): PipelineRun {
  return {
    id: row.id,
    status: row.status as PipelineStatus,
    prompt: row.prompt,
    imageModel: (row.imageModel as ImageModel) ?? undefined,
    competitorResearchId: row.competitorResearchId ?? undefined,
    referenceImageUrl: row.referenceImageUrl ?? undefined,
    variationUrls: (row.variationUrls as string[]) ?? undefined,
    generatedImageUrl: row.generatedImageUrl ?? undefined,
    upscaledImageUrl: row.upscaledImageUrl ?? undefined,
    digitalFileUrls: (row.digitalFileUrls as DigitalFileUrls) ?? undefined,
    mediaUrls: (row.mediaUrls as MediaUrls) ?? undefined,
    seo: (row.seoJson as SeoData) ?? undefined,
    etsyListingId: row.etsyListingId ?? undefined,
    pinterestPinId: row.pinterestPinId ?? undefined,
    attempts: row.attempts ?? 0,
    publishProgress: (row.publishProgress as PublishProgress) ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToCompetitorShop(row: CompetitorShopRow): CompetitorShop {
  return {
    shopId: Number(row.shopId),
    shopName: row.shopName,
    totalSales: Number(row.totalSales ?? 0),
    totalReviews: Number(row.totalReviews ?? 0),
    reviewRatio: n(row.reviewRatio),
    lastScannedAt: row.lastScannedAt?.toISOString(),
  };
}

function rowToCompetitorListing(row: CompetitorListingRow): CompetitorListing {
  return {
    listingId: Number(row.listingId),
    shopId: Number(row.shopId ?? 0),
    title: row.title ?? '',
    tags: (row.tags as string[]) ?? [],
    price: n(row.price),
    numFavorers: Number(row.numFavorers ?? 0),
    reviewCount: Number(row.reviewCount ?? 0),
    creationDate: row.creationDate?.toISOString() ?? new Date(0).toISOString(),
    estimatedSales: n(row.estimatedSales),
    monthlyVelocity: n(row.monthlyVelocity),
    opportunityScore: n(row.opportunityScore),
  };
}

function rowToCompetitorResearch(row: CompetitorResearchRow): CompetitorResearch {
  return {
    id: row.id,
    pipelineRunId: row.pipelineRunId ?? undefined,
    sourceListingId: Number(row.sourceListingId),
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle ?? '',
    sourceTags: (row.sourceTags as string[]) ?? [],
    sourceTaxonomyId: row.sourceTaxonomyId != null ? Number(row.sourceTaxonomyId) : undefined,
    sourceNumFavorers: Number(row.sourceNumFavorers ?? 0),
    sourceViews: Number(row.sourceViews ?? 0),
    generatedTitle: row.generatedTitle ?? '',
    generatedTags: (row.generatedTags as string[]) ?? [],
    generatedDescription: row.generatedDescription ?? '',
    fetchedAt: row.fetchedAt?.toISOString() ?? new Date(0).toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// ── oauth_tokens ──────────────────────────────────────────────────────────────

export async function upsertOAuthToken(
  provider: 'etsy' | 'pinterest',
  accessToken: string,
  refreshToken: string | null,
  expiresAt: Date | null,
): Promise<void> {
  const values = {
    provider,
    accessTokenEncrypted: encrypt(accessToken),
    refreshTokenEncrypted: refreshToken ? encrypt(refreshToken) : null,
    expiresAt,
    updatedAt: new Date(),
  };
  await db
    .insert(oauthTokens)
    .values({ ...values, createdAt: new Date() })
    .onConflictDoUpdate({
      target: oauthTokens.provider,
      set: values,
    });
}

/**
 * Token'ın VARLIĞINI ve son kullanma tarihini döner — şifre çözmez.
 * Bağlantı durumu göstergeleri (panel kartı, auth status uçları) bunu kullanır: gizli değeri
 * belleğe almadan "bağlı mı?" sorusuna cevap verir.
 */
export async function getOAuthTokenMeta(provider: 'etsy' | 'pinterest'): Promise<{
  connected: boolean;
  expiresAt: Date | null;
  hasRefreshToken: boolean;
  updatedAt: Date | null;
}> {
  const [row] = await db
    .select({
      expiresAt: oauthTokens.expiresAt,
      refresh: oauthTokens.refreshTokenEncrypted,
      updatedAt: oauthTokens.updatedAt,
    })
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, provider))
    .limit(1);
  if (!row) return { connected: false, expiresAt: null, hasRefreshToken: false, updatedAt: null };
  return {
    connected: true,
    expiresAt: row.expiresAt ?? null,
    hasRefreshToken: Boolean(row.refresh),
    updatedAt: row.updatedAt ?? null,
  };
}

export async function getOAuthToken(provider: 'etsy' | 'pinterest'): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
} | null> {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, provider))
    .limit(1);
  if (!row) return null;
  return {
    accessToken: decrypt(row.accessTokenEncrypted),
    refreshToken: row.refreshTokenEncrypted ? decrypt(row.refreshTokenEncrypted) : null,
    expiresAt: row.expiresAt ?? null,
  };
}

// ── app_settings ──────────────────────────────────────────────────────────────

/**
 * Panelden değiştirilebilen ayarlar. Env değişkenlerinin aksine redeploy gerektirmez —
 * Pinterest board seçimi gibi, kullanıcının çalışma anında değiştirdiği değerler içindir.
 */
export type AppSettingKey = 'pinterest_board_id' | 'pinterest_token_env';

export async function getSetting(key: AppSettingKey): Promise<string | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return row?.value ?? null;
}

export async function setSetting(key: AppSettingKey, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

// ── pipeline_runs ─────────────────────────────────────────────────────────────

export async function createPipelineRun(
  prompt: string,
  opts: { imageModel?: ImageModel; referenceImageUrl?: string; competitorResearchId?: number } = {},
): Promise<PipelineRun> {
  const now = new Date();
  const [row] = await db
    .insert(pipelineRuns)
    .values({
      prompt,
      imageModel: opts.imageModel ?? null,
      referenceImageUrl: opts.referenceImageUrl ?? null,
      competitorResearchId: opts.competitorResearchId ?? null,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return rowToPipelineRun(row);
}

type PipelineRunUpdate = {
  status?: PipelineStatus;
  competitorResearchId?: number;
  imageModel?: ImageModel; // referans modunda Imagen → FLUX düşüşü buraya yazılır
  referenceImageUrl?: string;
  variationUrls?: string[];
  generatedImageUrl?: string;
  upscaledImageUrl?: string;
  digitalFileUrls?: DigitalFileUrls;
  mediaUrls?: MediaUrls;
  seoJson?: SeoData;
  etsyListingId?: number;
  pinterestPinId?: string;
  attempts?: number;
  publishProgress?: PublishProgress;
  errorMessage?: string | null; // null → önceki hatayı temizle (yeniden çalıştırmada)
};

export async function updatePipelineRun(
  id: string,
  updates: PipelineRunUpdate,
): Promise<void> {
  await db
    .update(pipelineRuns)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(pipelineRuns.id, id));
}

export async function getPipelineRun(id: string): Promise<PipelineRun | null> {
  const [row] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, id)).limit(1);
  return row ? rowToPipelineRun(row) : null;
}

export async function listPipelineRuns(limit = 50): Promise<PipelineRun[]> {
  const rows = await db
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.createdAt))
    .limit(limit);
  return rows.map(rowToPipelineRun);
}

/** Transient (askıda kalabilecek) durumlar — kurtarma sweeper bunları izler. */
export const TRANSIENT_STATUSES: PipelineStatus[] = [
  'generating_image',
  'generating_seo',
  'processing_files',
  'publishing_etsy',
  'publishing_pinterest',
];

/**
 * Bir transient statüde takılmış (updated_at eşiği geçmiş) run'ları döner — restart/çökme sonrası
 * arka plan işi kaybolan run'lar. Sweeper bunları idempotent step fonksiyonlarıyla sürdürür.
 */
export async function listStalledRuns(olderThanMs: number): Promise<PipelineRun[]> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await db
    .select()
    .from(pipelineRuns)
    .where(and(inArray(pipelineRuns.status, TRANSIENT_STATUSES), lt(pipelineRuns.updatedAt, cutoff)));
  return rows.map(rowToPipelineRun);
}

/** attempts sayacını atomik artırır ve yeni değeri döner. */
export async function incrementRunAttempts(id: string): Promise<number> {
  const [row] = await db
    .update(pipelineRuns)
    .set({ attempts: sql`${pipelineRuns.attempts} + 1`, updatedAt: new Date() })
    .where(eq(pipelineRuns.id, id))
    .returning({ attempts: pipelineRuns.attempts });
  return row?.attempts ?? 0;
}

/**
 * PostgreSQL session-level advisory lock ile bir işi tek instance'ta çalıştırır.
 *
 * ÖNEMLİ: Advisory lock, onu ALAN bağlantıya (session) aittir. Eski hali `db.execute()`
 * kullanıyordu; havuz her sorguda farklı bir client verebildiği için `pg_advisory_unlock`
 * çoğu zaman BAŞKA bir session'da çalışıyor, `false` dönüp kilidi asıl sahibinde bırakıyordu
 * (kilit ancak o bağlantı idle timeout'la kapanınca serbest kalıyordu). Bu yüzden kilit alma,
 * iş ve bırakma aynı client üzerinde yapılır.
 *
 * @returns Kilit alınamazsa (başka instance tutuyorsa) `false`; iş çalıştıysa `true`.
 */
export async function withAdvisoryLock(key: number, fn: () => Promise<void>): Promise<boolean> {
  const client = await pgPool().connect();
  let locked = false;
  try {
    const res = await client.query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked', [key]);
    locked = res.rows[0]?.locked === true;
    if (!locked) return false;
    await fn();
    return true;
  } finally {
    if (locked) {
      // Kilidi ALAN client üzerinde bırak — release edilemezse bağlantıyı havuzdan düşür ki
      // kilit sızmasın (bağlantı kapanınca PG session lock'ları otomatik serbest bırakır).
      try {
        await client.query('select pg_advisory_unlock($1)', [key]);
        client.release();
      } catch (e) {
        console.error('[db] advisory unlock başarısız — bağlantı düşürülüyor:', e instanceof Error ? e.message : e);
        client.release(true);
      }
    } else {
      client.release();
    }
  }
}

// ── competitor_shops ──────────────────────────────────────────────────────────

export async function upsertCompetitorShop(shop: CompetitorShop): Promise<void> {
  const values = {
    shopId: shop.shopId,
    shopName: shop.shopName,
    totalSales: shop.totalSales,
    totalReviews: shop.totalReviews,
    reviewRatio: String(shop.reviewRatio),
    lastScannedAt: shop.lastScannedAt ? new Date(shop.lastScannedAt) : new Date(),
  };
  await db
    .insert(competitorShops)
    .values(values)
    .onConflictDoUpdate({ target: competitorShops.shopId, set: values });
}

export async function listCompetitorShops(): Promise<CompetitorShop[]> {
  const rows = await db.select().from(competitorShops);
  return rows.map(rowToCompetitorShop);
}

// ── competitor_listings ───────────────────────────────────────────────────────

export async function upsertCompetitorListing(listing: CompetitorListing): Promise<void> {
  const values = {
    listingId: listing.listingId,
    shopId: listing.shopId,
    title: listing.title,
    tags: listing.tags,
    price: String(listing.price),
    numFavorers: listing.numFavorers,
    reviewCount: listing.reviewCount,
    creationDate: new Date(listing.creationDate),
    estimatedSales: String(listing.estimatedSales),
    monthlyVelocity: String(listing.monthlyVelocity),
    opportunityScore: String(listing.opportunityScore),
    scannedAt: new Date(),
  };
  await db
    .insert(competitorListings)
    .values(values)
    .onConflictDoUpdate({ target: competitorListings.listingId, set: values });
}

export async function listCompetitorListings(shopId?: number): Promise<CompetitorListing[]> {
  const rows = await db
    .select()
    .from(competitorListings)
    .where(shopId != null ? eq(competitorListings.shopId, shopId) : undefined)
    .orderBy(desc(competitorListings.opportunityScore));
  return rows.map(rowToCompetitorListing);
}

// ── competitor_research ─────────────────────────────────────────────────────────

export type CompetitorResearchInput = {
  sourceListingId: number;
  sourceUrl: string;
  sourceTitle: string;
  sourceTags: string[];
  sourceTaxonomyId?: number;
  sourceNumFavorers: number;
  sourceViews: number;
  generatedTitle: string;
  generatedTags: string[];
  generatedDescription: string;
};

/** Analiz adımında çağrılır — research henüz bir run'a bağlı değildir (pipelineRunId NULL). */
export async function createCompetitorResearch(
  input: CompetitorResearchInput,
): Promise<CompetitorResearch> {
  const [row] = await db
    .insert(competitorResearch)
    .values({
      sourceListingId: input.sourceListingId,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle,
      sourceTags: input.sourceTags,
      sourceTaxonomyId: input.sourceTaxonomyId ?? null,
      sourceNumFavorers: input.sourceNumFavorers,
      sourceViews: input.sourceViews,
      generatedTitle: input.generatedTitle,
      generatedTags: input.generatedTags,
      generatedDescription: input.generatedDescription,
      fetchedAt: new Date(),
      createdAt: new Date(),
    })
    .returning();
  return rowToCompetitorResearch(row);
}

export async function getCompetitorResearch(id: number): Promise<CompetitorResearch | null> {
  const [row] = await db
    .select()
    .from(competitorResearch)
    .where(eq(competitorResearch.id, id))
    .limit(1);
  return row ? rowToCompetitorResearch(row) : null;
}

/** Run oluşturulduğunda iki yönlü bağı tamamlar (research → run). */
export async function linkCompetitorResearchToRun(
  researchId: number,
  runId: string,
): Promise<void> {
  await db
    .update(competitorResearch)
    .set({ pipelineRunId: runId })
    .where(eq(competitorResearch.id, researchId));
}

// ── image_drafts ──────────────────────────────────────────────────────────────

function rowToImageDraft(row: ImageDraftRow): ImageDraft {
  return {
    id: row.id,
    imageUrl: row.imageUrl,
    source: row.source as ImageDraft['source'],
    prompt: row.prompt ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createImageDraft(input: {
  imageUrl: string;
  source: ImageDraft['source'];
  prompt?: string;
}): Promise<ImageDraft> {
  const [row] = await db
    .insert(imageDrafts)
    .values({
      imageUrl: input.imageUrl,
      source: input.source,
      prompt: input.prompt ?? null,
      createdAt: new Date(),
    })
    .returning();
  return rowToImageDraft(row);
}

export async function listImageDrafts(limit = 100): Promise<ImageDraft[]> {
  const rows = await db
    .select()
    .from(imageDrafts)
    .orderBy(desc(imageDrafts.createdAt))
    .limit(limit);
  return rows.map(rowToImageDraft);
}

export async function getImageDraft(id: string): Promise<ImageDraft | null> {
  const [row] = await db.select().from(imageDrafts).where(eq(imageDrafts.id, id)).limit(1);
  return row ? rowToImageDraft(row) : null;
}

export async function deleteImageDraft(id: string): Promise<void> {
  await db.delete(imageDrafts).where(eq(imageDrafts.id, id));
}
