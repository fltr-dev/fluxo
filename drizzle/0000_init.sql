CREATE TYPE "public"."account_source" AS ENUM('PLUGGY', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('CHECKING', 'CREDIT_CARD', 'SAVINGS_INVESTMENT', 'CASH');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('INCOME', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."category_source" AS ENUM('USER', 'RULE', 'JEV', 'PLUGGY_MAP', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."goal_tracking" AS ENUM('ACCOUNT', 'CONTRIBUTIONS');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('CONTAINS', 'STARTS_WITH', 'REGEX');--> statement-breakpoint
CREATE TYPE "public"."reserve_mode" AS ENUM('MONTHS', 'FIXED');--> statement-breakpoint
CREATE TYPE "public"."tx_kind" AS ENUM('INCOME', 'EXPENSE', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('POSTED', 'PENDING');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer,
	"pluggy_id" text,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"source" "account_source" NOT NULL,
	"balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"opening_balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"is_emergency_reserve" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"transactions_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_pluggyId_unique" UNIQUE("pluggy_id")
);
--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"date" date NOT NULL,
	"balance" numeric(14, 2) NOT NULL,
	CONSTRAINT "balance_snapshots_accountId_date_unique" UNIQUE("account_id","date")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"match_type" "match_type" DEFAULT 'CONTAINS' NOT NULL,
	"pattern" text NOT NULL,
	"account_id" integer,
	"kind" "category_kind",
	"min_amount" numeric(14, 2),
	"max_amount" numeric(14, 2),
	"subcategory_id" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_accounts" (
	"goal_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	CONSTRAINT "goal_accounts_goal_id_account_id_pk" PRIMARY KEY("goal_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"goal_id" integer NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"target_amount" numeric(14, 2) NOT NULL,
	"deadline" date NOT NULL,
	"initial_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tracking" "goal_tracking" NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"pluggy_item_id" text NOT NULL,
	"name" text DEFAULT 'Conexão Pluggy' NOT NULL,
	"status" text,
	"error" text,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "institutions_pluggyItemId_unique" UNIQUE("pluggy_item_id")
);
--> statement-breakpoint
CREATE TABLE "pluggy_category_map" (
	"pluggy_category" text PRIMARY KEY NOT NULL,
	"subcategory_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"target_mode" "reserve_mode" DEFAULT 'MONTHS' NOT NULL,
	"target_months" integer DEFAULT 6 NOT NULL,
	"target_amount" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "spending_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"monthly_amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "spending_limits_categoryId_unique" UNIQUE("category_id")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"pluggy_id" text,
	"date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"description" text NOT NULL,
	"status" "tx_status" DEFAULT 'POSTED' NOT NULL,
	"kind" "tx_kind" NOT NULL,
	"subcategory_id" integer,
	"category_source" "category_source" DEFAULT 'NONE' NOT NULL,
	"suggested_subcategory_id" integer,
	"suggestion_confidence" real,
	"pluggy_category" text,
	"pluggy_category_id" text,
	"installment_number" integer,
	"total_installments" integer,
	"transfer_pair_id" integer,
	"note" text,
	"ignored" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_pluggyId_unique" UNIQUE("pluggy_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_subcategory_id_categories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_accounts" ADD CONSTRAINT "goal_accounts_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_accounts" ADD CONSTRAINT "goal_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pluggy_category_map" ADD CONSTRAINT "pluggy_category_map_subcategory_id_categories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_limits" ADD CONSTRAINT "spending_limits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subcategory_id_categories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_suggested_subcategory_id_categories_id_fk" FOREIGN KEY ("suggested_subcategory_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_date_index" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_account_id_date_index" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "transactions_subcategory_id_date_index" ON "transactions" USING btree ("subcategory_id","date");