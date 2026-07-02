ALTER TABLE "pipeline_runs" ADD COLUMN "upscaled_image_url" text;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD COLUMN "digital_file_urls" jsonb;