CREATE TABLE "investment_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"pluggy_id" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "investment_movements_pluggyId_unique" UNIQUE("pluggy_id")
);
--> statement-breakpoint
ALTER TABLE "investment_movements" ADD CONSTRAINT "investment_movements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;