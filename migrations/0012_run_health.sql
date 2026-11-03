-- Çalıştırma sağlığı (Velora iyileştirme notu, 2026-11). Yalnızca nullable sütun ekler;
-- eski kayıtlar ve eski kod etkilenmez.

-- Teknik hatanın hangi aşamada ve hangi sınıfta oluştuğu (validation/auth/rate_limit/transient/internal).
ALTER TABLE "pipeline_runs" ADD COLUMN IF NOT EXISTS "error_stage" text;
ALTER TABLE "pipeline_runs" ADD COLUMN IF NOT EXISTS "error_kind" text;

-- Etsy'den salt okunur geri okunan ilan durumu (draft/active/inactive/... ya da 'unknown') + okuma anı.
ALTER TABLE "pipeline_runs" ADD COLUMN IF NOT EXISTS "etsy_listing_state" text;
ALTER TABLE "pipeline_runs" ADD COLUMN IF NOT EXISTS "etsy_state_checked_at" timestamptz;

-- Pin'in atıldığı pano ve POST /pins denemesinin başladığı an (sonuç belirsizse mutabakat için).
ALTER TABLE "pipeline_runs" ADD COLUMN IF NOT EXISTS "pinterest_board_id" text;
ALTER TABLE "pipeline_runs" ADD COLUMN IF NOT EXISTS "pin_attempted_at" timestamptz;
