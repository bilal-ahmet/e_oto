-- pgAdmin'de POSTGRES (süper-kullanıcı) ile, "etsy_otomasyon" veritabanına bağlıyken çalıştır.
-- Amaç: postgres-sahipli tabloları/şemayı kaldırmak; ardından uygulama kullanıcısı (etsy_otomasyon)
-- drizzle-kit migrate ile her şeyi kendi sahipliğinde sıfırdan kuracak. (Mock aşaması — veri yok.)

DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP TABLE IF EXISTS public.competitor_listings CASCADE;
DROP TABLE IF EXISTS public.competitor_shops CASCADE;
DROP TABLE IF EXISTS public.pipeline_runs CASCADE;
DROP TABLE IF EXISTS public.oauth_tokens CASCADE;
