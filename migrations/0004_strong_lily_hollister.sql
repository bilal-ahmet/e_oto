ALTER TABLE "pipeline_runs" ADD COLUMN "image_model" text;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD COLUMN "variation_urls" jsonb;