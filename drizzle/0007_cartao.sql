ALTER TABLE "accounts" ADD COLUMN "credit_limit" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "available_credit_limit" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "bill_due_date" date;