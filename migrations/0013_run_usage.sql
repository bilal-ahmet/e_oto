-- Ücretli fal çağrılarının run bazında kaydı (UsageEntry[] — src/types/index.ts).
-- Tutar liste fiyatından TAHMİNDİR (src/lib/cost/prices.ts); gerçek fatura fal kullanım API'sindedir.
ALTER TABLE "pipeline_runs" ADD COLUMN IF NOT EXISTS "usage" jsonb;
