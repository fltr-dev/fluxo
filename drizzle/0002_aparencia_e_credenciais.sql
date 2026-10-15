CREATE TABLE "app_credentials" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "bank" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "icon" text;