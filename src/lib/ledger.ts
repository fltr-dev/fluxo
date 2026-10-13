import "server-only"
import { aliasedTable, and, desc, eq, gte, isNotNull, isNull, ne, sql } from "drizzle-orm"
import { accounts, balanceSnapshots, categories, categoryRules, db, pluggyCategoryMap, transactions } from "@/db"
import {
  mapPluggyCategory,
  matchRule,
  resolveCategory,
  type CategorizableTx,
  type Kind,
  type Resolution,
} from "./domain/categorize"
import { addDays } from "./domain/dates"
import { detectTransfers } from "./domain/transfers"
import { classifyWithJev, jevEnabled, jevThresholds } from "./jev"

/** Subcategorias ativas com o nome da categoria-pai ("Alimentação / Mercado"). */
export async function subcategoryOptions() {
  const parent = aliasedTable(categories, "parent")
  return db
    .select({ id: categories.id, name: categories.name, kind: categories.kind, parentName: parent.name, color: parent.color })
    .from(categories)
    .innerJoin(parent, eq(categories.parentId, parent.id))
    .where(and(eq(categories.archived, false), eq(parent.archived, false)))
    .orderBy(categories.kind, parent.name, categories.name)
}

export async function subcategoryKinds() {
  const rows = await db.select({ id: categories.id, kind: categories.kind }).from(categories).where(isNotNull(categories.parentId))
  return new Map(rows.map((r) => [r.id, r.kind as Kind]))
}

// ponytail: limite de chamadas ao Jev por execução para caber no timeout da função (a 1ª sync pode trazer milhares)
const JEV_MAX_PER_RUN = 200

/** Monta o pipeline regra → Jev → mapeamento Pluggy com os dados carregados uma única vez. */
export async function loadCategorizer() {
  const [rules, mapRows, options, examples] = await Promise.all([
    db.select().from(categoryRules).where(eq(categoryRules.active, true)),
    db.select().from(pluggyCategoryMap),
    subcategoryOptions(),
    jevEnabled()
      ? db
          .select({ description: transactions.description, subcategoryId: transactions.subcategoryId })
          .from(transactions)
          .where(and(eq(transactions.categorySource, "USER"), isNotNull(transactions.subcategoryId)))
          .orderBy(desc(transactions.updatedAt))
          .limit(50)
      : [],
  ])
  const map = new Map(mapRows.map((r) => [r.pluggyCategory, r.subcategoryId]))
  const label = new Map(options.map((o) => [o.id, `${o.parentName} / ${o.name}`]))
  const kinds = await subcategoryKinds()
  const thresholds = jevThresholds()
  let jevCalls = 0

  return {
    kinds,
    async categorize(tx: CategorizableTx & { accountName: string }): Promise<Resolution> {
      const rule = matchRule(rules, tx)
      let jev = null
      if (!rule && jevCalls < JEV_MAX_PER_RUN && jevEnabled()) {
        jevCalls++
        const kind = tx.amount < 0 ? "EXPENSE" : "INCOME"
        jev = await classifyWithJev({
          description: tx.description,
          amount: tx.amount,
          account: tx.accountName,
          pluggyCategory: tx.pluggyCategory,
          options: options.filter((o) => o.kind === kind).map((o) => ({ id: o.id, label: label.get(o.id)! })),
          examples: examples.flatMap((e) => (label.has(e.subcategoryId!) ? [{ description: e.description, label: label.get(e.subcategoryId!)! }] : [])),
        })
      }
      return resolveCategory({
        ruleSubcategoryId: rule?.subcategoryId,
        jev,
        mappedSubcategoryId: mapPluggyCategory(map, tx),
        ...thresholds,
      })
    },
  }
}

/** Detecta transferências entre contas próprias a partir de `since` e marca pares/singles. */
export async function detectAndMarkTransfers(since: string | null) {
  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      kind: transactions.kind,
      categorySource: transactions.categorySource,
      ignored: transactions.ignored,
      transferPairId: transactions.transferPairId,
      pluggyCategory: transactions.pluggyCategory,
      pluggyCategoryId: transactions.pluggyCategoryId,
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.transferPairId),
        ne(transactions.categorySource, "USER"),
        since ? gte(transactions.date, addDays(since, -3)) : undefined,
      ),
    )
  // ponytail: pareamento O(n²) em memória; ok para dezenas de milhares de linhas na 1ª sync
  const { pairs, singles } = detectTransfers(rows)
  const asTransfer = { kind: "TRANSFER" as const, subcategoryId: null, suggestedSubcategoryId: null, suggestionConfidence: null, categorySource: "NONE" as const }
  await Promise.all([
    ...pairs.flatMap(([a, b]) => [
      db.update(transactions).set({ ...asTransfer, transferPairId: b }).where(eq(transactions.id, a)),
      db.update(transactions).set({ ...asTransfer, transferPairId: a }).where(eq(transactions.id, b)),
    ]),
    ...singles.map((id) => db.update(transactions).set(asTransfer).where(eq(transactions.id, id))),
  ])
  return pairs.length * 2 + singles.length
}

/** Contas manuais: saldo = saldo inicial + soma das transações. */
export async function refreshManualBalances() {
  await db.execute(sql`
    update accounts a set balance = a.opening_balance + coalesce((select sum(t.amount) from transactions t where t.account_id = a.id), 0)
    where a.source = 'MANUAL'`)
}

export async function snapshotBalances(date: string) {
  const rows = await db.select({ id: accounts.id, balance: accounts.balance }).from(accounts).where(eq(accounts.archived, false))
  if (!rows.length) return
  await db
    .insert(balanceSnapshots)
    .values(rows.map((r) => ({ accountId: r.id, date, balance: r.balance })))
    .onConflictDoUpdate({ target: [balanceSnapshots.accountId, balanceSnapshots.date], set: { balance: sql`excluded.balance` } })
}
