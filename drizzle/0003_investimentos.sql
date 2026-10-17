CREATE TYPE "public"."asset_class" AS ENUM('POS_FIXADO', 'PRE_FIXADO', 'INFLACAO', 'ACOES', 'FII', 'BDR', 'ETF', 'CRIPTO', 'FUNDOS', 'OUTROS');--> statement-breakpoint
CREATE TYPE "public"."trade_type" AS ENUM('BUY', 'SELL', 'BONUS', 'DIVIDEND', 'JCP', 'YIELD', 'INTEREST');--> statement-breakpoint
CREATE TABLE "investment_targets" (
	"asset_class" "asset_class" PRIMARY KEY NOT NULL,
	"percent" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"investment_id" integer NOT NULL,
	"pluggy_id" text,
	"date" date NOT NULL,
	"type" "trade_type" NOT NULL,
	"quantity" numeric(24, 8),
	"price" numeric(24, 8),
	"amount" numeric(14, 2) NOT NULL,
	"fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"note" text,
	CONSTRAINT "investment_trades_pluggyId_unique" UNIQUE("pluggy_id")
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"pluggy_id" text,
	"asset_class" "asset_class" NOT NULL,
	"asset_class_override" "asset_class",
	"code" text,
	"name" text NOT NULL,
	"broker" text,
	"quantity" numeric(24, 8),
	"unit_price" numeric(24, 8),
	"invested" numeric(14, 2),
	"rate_label" text,
	"due_date" date,
	"price_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investments_accountId_unique" UNIQUE("account_id"),
	CONSTRAINT "investments_pluggyId_unique" UNIQUE("pluggy_id")
);
--> statement-breakpoint
CREATE TABLE "market_series" (
	"series" text NOT NULL,
	"date" date NOT NULL,
	"value" real NOT NULL,
	CONSTRAINT "market_series_series_date_pk" PRIMARY KEY("series","date")
);
--> statement-breakpoint
ALTER TABLE "investment_trades" ADD CONSTRAINT "investment_trades_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investment_trades_investment_id_date_index" ON "investment_trades" USING btree ("investment_id","date");--> statement-breakpoint
CREATE INDEX "investment_trades_date_index" ON "investment_trades" USING btree ("date");