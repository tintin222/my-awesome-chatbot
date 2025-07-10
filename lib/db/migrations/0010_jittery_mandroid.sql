CREATE TABLE IF NOT EXISTS "content_entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enhanced_content_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"original_text" text NOT NULL,
	"start_position" integer,
	"end_position" integer,
	"confidence" numeric(3, 2),
	"metadata" json DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enhanced_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_content_id" varchar(191) NOT NULL,
	"title" text NOT NULL,
	"original_content" text NOT NULL,
	"enhanced_content" text,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_enhancement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"enhancement_type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "multimedia_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"type" varchar NOT NULL,
	"filename" text NOT NULL,
	"original_filename" text,
	"url" text,
	"size" integer,
	"mime_type" varchar(100),
	"alt_text" text,
	"caption" text,
	"metadata" json DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_entity" ADD CONSTRAINT "content_entity_enhanced_content_id_enhanced_content_id_fk" FOREIGN KEY ("enhanced_content_id") REFERENCES "public"."enhanced_content"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enhanced_content" ADD CONSTRAINT "enhanced_content_original_content_id_global_context_id_fk" FOREIGN KEY ("original_content_id") REFERENCES "public"."global_context"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_enhancement" ADD CONSTRAINT "entity_enhancement_entity_id_content_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."content_entity"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "multimedia_attachment" ADD CONSTRAINT "multimedia_attachment_entity_id_content_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."content_entity"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
