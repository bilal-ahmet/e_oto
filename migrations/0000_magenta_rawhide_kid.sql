CREATE TABLE "competitor_listings" (
	"listing_id" bigint PRIMARY KEY NOT NULL,
	"shop_id" bigint,
	"title" text,
	"tags" jsonb,
	"price" numeric,
	"num_favorers" bigint,
	"review_count" bigint,
	"creation_date" timestamp with time zone,
	"estimated_sales" numeric,
	"monthly_velocity" numeric,
	"opportunity_score" numeric,
	"scanned_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "competitor_shops" (
	"shop_id" bigint PRIMARY KEY NOT NULL,
	"shop_name" text NOT NULL,
	"total_sales" bigint,
	"total_reviews" bigint,
	"review_ratio" numeric,
	"last_scanned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"prompt" text NOT NULL,
	"reference_image_url" text,
	"generated_image_url" text,
	"upscaled_image_urls" jsonb,
	"seo_json" jsonb,
	"etsy_listing_id" bigint,
	"pinterest_pin_id" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_listings" ADD CONSTRAINT "competitor_listings_shop_id_competitor_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."competitor_shops"("shop_id") ON DELETE no action ON UPDATE no action;