CREATE TABLE "competitor_research" (
	"id" serial PRIMARY KEY NOT NULL,
	"pipeline_run_id" uuid,
	"source_listing_id" bigint NOT NULL,
	"source_url" text NOT NULL,
	"source_title" text,
	"source_tags" jsonb,
	"source_taxonomy_id" bigint,
	"source_num_favorers" bigint,
	"source_views" bigint,
	"generated_title" text,
	"generated_tags" jsonb,
	"generated_description" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD COLUMN "competitor_research_id" integer;--> statement-breakpoint
ALTER TABLE "competitor_research" ADD CONSTRAINT "competitor_research_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE no action ON UPDATE no action;