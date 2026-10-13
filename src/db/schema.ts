import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" })

export const accountType = pgEnum("account_type", ["CHECKING", "CREDIT_CARD", "SAVINGS_INVESTMENT", "CASH"])
export const accountSource = pgEnum("account_source", ["PLUGGY", "MANUAL"])
export const categoryKind = pgEnum("category_kind", ["INCOME", "EXPENSE"])
export const txKind = pgEnum("tx_kind", ["INCOME", "EXPENSE", "TRANSFER"])
export const txStatus = pgEnum("tx_status", ["POSTED", "PENDING"])
export const categorySource = pgEnum("category_source", ["USER", "RULE", "JEV", "PLUGGY_MAP", "NONE"])
export const matchType = pgEnum("match_type", ["CONTAINS", "STARTS_WITH", "REGEX"])
export const goalTracking = pgEnum("goal_tracking", ["ACCOUNT", "CONTRIBUTIONS"])
export const reserveMode = pgEnum("reserve_mode", ["MONTHS", "FIXED"])

export const institutions = pgTable("institutions", {
  id: serial().primaryKey(),
  pluggyItemId: text().notNull().unique(),
  name: text().notNull().default("Conexão Pluggy"),
  status: text(),
  error: text(),
  lastSyncedAt: timestamp({ withTimezone: true }),
})

export const accounts = pgTable("accounts", {
  id: serial().primaryKey(),
  institutionId: integer().references(() => institutions.id, { onDelete: "set null" }),
  // id da conta (ou do investimento) na Pluggy
  pluggyId: text().unique(),
  name: text().notNull(),
  type: accountType().notNull(),
  source: accountSource().notNull(),
  // Contribuição para o patrimônio: cartão de crédito fica negativo (dívida da fatura aberta).
  // Contas manuais: saldo = openingBalance + soma das transações (recalculado ao gravar).
  balance: money("balance").notNull().default(0),
  openingBalance: money("opening_balance").notNull().default(0),
  isEmergencyReserve: boolean().notNull().default(false),
  archived: boolean().notNull().default(false),
  transactionsSyncedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const balanceSnapshots = pgTable(
  "balance_snapshots",
  {
    id: serial().primaryKey(),
    accountId: integer().notNull().references(() => accounts.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    balance: money("balance").notNull(),
  },
  (t) => [unique().on(t.accountId, t.date)],
)

export const categories = pgTable("categories", {
  id: serial().primaryKey(),
  // null = categoria (nível 1); preenchido = subcategoria (nível 2)
  parentId: integer().references((): AnyPgColumn => categories.id, { onDelete: "cascade" }),
  name: text().notNull(),
  kind: categoryKind().notNull(),
  color: text().notNull().default("#64748b"),
  archived: boolean().notNull().default(false),
})

export const transactions = pgTable(
  "transactions",
  {
    id: serial().primaryKey(),
    accountId: integer().notNull().references(() => accounts.id, { onDelete: "cascade" }),
    pluggyId: text().unique(),
    date: date({ mode: "string" }).notNull(),
    // Negativo = saída, positivo = entrada
    amount: money("amount").notNull(),
    description: text().notNull(),
    status: txStatus().notNull().default("POSTED"),
    kind: txKind().notNull(),
    // null = "A categorizar" (transferências também ficam sem categoria)
    subcategoryId: integer().references(() => categories.id, { onDelete: "set null" }),
    categorySource: categorySource().notNull().default("NONE"),
    suggestedSubcategoryId: integer().references(() => categories.id, { onDelete: "set null" }),
    suggestionConfidence: real(),
    pluggyCategory: text(),
    pluggyCategoryId: text(),
    installmentNumber: integer(),
    totalInstallments: integer(),
    transferPairId: integer(),
    note: text(),
    ignored: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.date),
    index().on(t.accountId, t.date),
    index().on(t.subcategoryId, t.date),
  ],
)

export const categoryRules = pgTable("category_rules", {
  id: serial().primaryKey(),
  priority: integer().notNull().default(100),
  matchType: matchType().notNull().default("CONTAINS"),
  pattern: text().notNull(),
  accountId: integer().references(() => accounts.id, { onDelete: "cascade" }),
  kind: categoryKind(),
  minAmount: money("min_amount"),
  maxAmount: money("max_amount"),
  subcategoryId: integer()
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  active: boolean().notNull().default(true),
})

// Chave = nome da categoria como a Pluggy envia (nível 2 ou nível 1)
export const pluggyCategoryMap = pgTable("pluggy_category_map", {
  pluggyCategory: text().primaryKey(),
  subcategoryId: integer()
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
})

export const spendingLimits = pgTable("spending_limits", {
  id: serial().primaryKey(),
  categoryId: integer()
    .notNull()
    .unique()
    .references(() => categories.id, { onDelete: "cascade" }),
  monthlyAmount: money("monthly_amount").notNull(),
})

export const goals = pgTable("goals", {
  id: serial().primaryKey(),
  name: text().notNull(),
  targetAmount: money("target_amount").notNull(),
  deadline: date({ mode: "string" }).notNull(),
  initialAmount: money("initial_amount").notNull().default(0),
  tracking: goalTracking().notNull(),
  archived: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const goalAccounts = pgTable(
  "goal_accounts",
  {
    goalId: integer().notNull().references(() => goals.id, { onDelete: "cascade" }),
    accountId: integer().notNull().references(() => accounts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.accountId] })],
)

export const goalContributions = pgTable("goal_contributions", {
  id: serial().primaryKey(),
  goalId: integer().notNull().references(() => goals.id, { onDelete: "cascade" }),
  date: date({ mode: "string" }).notNull(),
  amount: money("amount").notNull(),
  note: text(),
})

// Linha única (id = 1)
export const reserveSettings = pgTable("reserve_settings", {
  id: integer().primaryKey().default(1),
  targetMode: reserveMode().notNull().default("MONTHS"),
  targetMonths: integer().notNull().default(6),
  targetAmount: money("target_amount"),
})

export const syncRuns = pgTable("sync_runs", {
  id: serial().primaryKey(),
  trigger: text().notNull(), // CRON | MANUAL
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp({ withTimezone: true }),
  status: text().notNull().default("RUNNING"), // RUNNING | OK | PARTIAL | ERROR
  error: text(),
})
