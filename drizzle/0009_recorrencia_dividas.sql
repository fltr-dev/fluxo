ALTER TABLE "debt_items" ADD COLUMN "date" date;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "recur_every" integer;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "recur_unit" text;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "recur_label" text;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "recur_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "recur_next" date;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "recur_end" date;