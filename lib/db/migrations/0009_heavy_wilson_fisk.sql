ALTER TABLE "GlobalContext" RENAME TO "global_context";--> statement-breakpoint
ALTER TABLE "global_context" ALTER COLUMN "id" SET DATA TYPE varchar(191);--> statement-breakpoint
ALTER TABLE "global_context" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "global_context" ADD COLUMN "associated_hotels" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "global_context" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "global_context" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "global_context" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "global_context" DROP COLUMN IF EXISTS "isActive";--> statement-breakpoint
ALTER TABLE "global_context" DROP COLUMN IF EXISTS "createdAt";--> statement-breakpoint
ALTER TABLE "global_context" DROP COLUMN IF EXISTS "updatedAt";