-- Sorgu indeksleri. Bu noktaya kadar primary key'ler ve oauth_tokens.provider unique'i
-- dışında hiç index yoktu; aşağıdaki sorguların tamamı sequential scan + sort yapıyordu.
-- Tablolar bugün küçük (etki ölçülemez), ama rakip tarama cron'u her gün mağaza başına
-- yüzlerce listing yazdığı için baskı orada birikiyor.

-- Panelin çalıştırma listesi: ORDER BY created_at DESC + LIMIT/OFFSET (her sayfa açılışında).
CREATE INDEX IF NOT EXISTS "pipeline_runs_created_at_idx" ON "pipeline_runs" ("created_at" DESC);

-- Kurtarma sweeper'ı HER 2 DAKİKADA: WHERE status IN (...) AND updated_at < cutoff.
-- Panelin durum sayaçları da (GROUP BY status) bu indeksten yararlanır.
CREATE INDEX IF NOT EXISTS "pipeline_runs_status_updated_at_idx"
  ON "pipeline_runs" ("status", "updated_at");

-- Rakip listeleri: ORDER BY opportunity_score DESC (panel + /api/competitors).
CREATE INDEX IF NOT EXISTS "competitor_listings_opportunity_score_idx"
  ON "competitor_listings" ("opportunity_score" DESC);

-- Mağazaya göre filtre (?shopId=... ve FK üzerinden birleşimler).
CREATE INDEX IF NOT EXISTS "competitor_listings_shop_id_idx" ON "competitor_listings" ("shop_id");

-- competitor_research.pipeline_run_id: FK; geçmiş temizlenirken toplu UPDATE ... WHERE NOT NULL
-- ve run silinirken FK doğrulaması bu indeksi kullanır.
CREATE INDEX IF NOT EXISTS "competitor_research_pipeline_run_id_idx"
  ON "competitor_research" ("pipeline_run_id");

-- Taslak galerisi: ORDER BY created_at DESC LIMIT 100.
CREATE INDEX IF NOT EXISTS "image_drafts_created_at_idx" ON "image_drafts" ("created_at" DESC);
