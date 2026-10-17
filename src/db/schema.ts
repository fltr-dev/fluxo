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
  // Aparência (editável): cor "#rrggbb" (null = cor do banco) e banco ("nubank"…; null = detectar pelo nome, "none" = nenhum)
  color: text(),
  bank: text(),
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

// Aplicações (+) e resgates (−) de investimentos: só reconstroem o histórico do patrimônio,
// ficam fora de transactions para não entrar em receitas/despesas
export const investmentMovements = pgTable("investment_movements", {
  id: serial().primaryKey(),
  accountId: integer().notNull().references(() => accounts.id, { onDelete: "cascade" }),
  pluggyId: text().notNull().unique(),
  date: date({ mode: "string" }).notNull(),
  amount: money("amount").notNull(),
})

// ---------- Investimentos ----------

export const assetClass = pgEnum("asset_class", ["POS_FIXADO", "PRE_FIXADO", "INFLACAO", "ACOES", "FII", "BDR", "ETF", "CRIPTO", "FUNDOS", "OUTROS"])
export const tradeType = pgEnum("trade_type", ["BUY", "SELL", "BONUS", "DIVIDEND", "JCP", "YIELD", "INTEREST"])

const qty = (name: string) => numeric(name, { precision: 24, scale: 8, mode: "number" })

/**
 * Um ativo da carteira. Cada um tem a sua linha em `accounts` (tipo SAVINGS_INVESTMENT), que guarda o saldo e entra no
 * patrimônio e nos snapshots como qualquer conta. Os da Pluggy vêm do GET /investments; os manuais (cripto, corretora
 * sem Open Finance) têm posição calculada pelas operações em `investment_trades`.
 */
export const investments = pgTable("investments", {
  id: serial().primaryKey(),
  accountId: integer().notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),
  // id do investimento na Pluggy (sem o prefixo "inv:" da conta); null = manual
  pluggyId: text().unique(),
  // Categoria detectada (Pluggy ou escolhida ao criar); a escolha do usuário fica em `assetClassOverride` e a sync não toca nela
  assetClass: assetClass().notNull(),
  assetClassOverride: assetClass(),
  code: text(), // ticker ("ITSA4", "BTC") ou código do título
  name: text().notNull(),
  broker: text(), // instituição/corretora onde está
  quantity: qty("quantity"),
  // Cotação atual (renda variável); renda fixa usa só `value`
  unitPrice: qty("unit_price"),
  // Custo (valor aplicado) da posição atual
  invested: money("invested"),
  rateLabel: text(), // "110% CDI", "IPCA + 6,5%", "13,2% a.a."
  dueDate: date({ mode: "string" }),
  // Cotação e saldo atualizados em
  priceUpdatedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

/** Operações (compra, venda, bonificação) e proventos de um ativo. Data futura = provento anunciado, a receber. */
export const investmentTrades = pgTable(
  "investment_trades",
  {
    id: serial().primaryKey(),
    investmentId: integer().notNull().references(() => investments.id, { onDelete: "cascade" }),
    pluggyId: text().unique(), // null = lançamento manual (a sync nunca apaga)
    date: date({ mode: "string" }).notNull(),
    type: tradeType().notNull(),
    quantity: qty("quantity"),
    price: qty("price"),
    // Total da operação, sempre positivo (compra: quanto saiu; venda e proventos: quanto entrou)
    amount: money("amount").notNull(),
    fees: money("fees").notNull().default(0),
    note: text(),
  },
  (t) => [index().on(t.investmentId, t.date), index().on(t.date)],
)

/** Alocação-alvo por categoria, em % da carteira. */
export const investmentTargets = pgTable("investment_targets", {
  assetClass: assetClass().primaryKey(),
  percent: real().notNull(),
})

/**
 * Séries de mercado para comparar a carteira: CDI (taxa diária, % a.d.), IPCA (variação mensal, %, no dia 1 do mês)
 * e IBOV (pontos no fechamento do mês, no dia 1 do mês).
 */
export const marketSeries = pgTable(
  "market_series",
  {
    series: text().notNull(),
    date: date({ mode: "string" }).notNull(),
    value: real().notNull(),
  },
  (t) => [primaryKey({ columns: [t.series, t.date] })],
)

export const categories = pgTable("categories", {
  id: serial().primaryKey(),
  // null = categoria (nível 1); preenchido = subcategoria (nível 2)
  parentId: integer().references((): AnyPgColumn => categories.id, { onDelete: "cascade" }),
  name: text().notNull(),
  kind: categoryKind().notNull(),
  color: text().notNull().default("#64748b"),
  // Nome do ícone do Lucide em PascalCase ("Utensils"); null = ícone padrão pelo nome da categoria
  icon: text(),
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

// Login do dono definido pelo app (Configurações › Conta). Linha única (id = 1); enquanto não existir,
// vale OWNER_USER/OWNER_PASSWORD do ambiente. A senha é guardada como hash scrypt, nunca em texto.
export const appCredentials = pgTable("app_credentials", {
  id: integer().primaryKey().default(1),
  username: text().notNull(),
  passwordHash: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})
