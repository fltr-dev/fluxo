import "server-only"
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm"
import { accounts, db, institutions, syncRuns, transactions } from "@/db"
import { deriveKind } from "./domain/categorize"
import { addDays, toLocalDate, today } from "./domain/dates"
import { mergeTransactions, normalizePluggyTx } from "./domain/sync-merge"
import { detectAndMarkTransfers, loadCategorizer, refreshManualBalances, snapshotBalances } from "./ledger"
import { pluggyClient, type PluggyAccount } from "./pluggy"

type Pluggy = Awaited<ReturnType<typeof pluggyClient>>
type Categorizer = Awaited<ReturnType<typeof loadCategorizer>>

// Investimentos não têm transações; o prefixo os distingue das contas na mesma coluna pluggyId
const INVESTMENT_PREFIX = "inv:"
// Reprocessa alguns dias antes da última sync para pegar pendentes que foram confirmadas
const OVERLAP_DAYS = 10

const accountType = (a: PluggyAccount): "CHECKING" | "CREDIT_CARD" | "SAVINGS_INVESTMENT" =>
  a.type === "CREDIT" ? "CREDIT_CARD" : a.subtype === "SAVINGS_ACCOUNT" ? "SAVINGS_INVESTMENT" : "CHECKING"

async function syncItem(pluggy: Pluggy, inst: typeof institutions.$inferSelect) {
  const item = await pluggy.item(inst.pluggyItemId)
  const accs = await pluggy.accounts(inst.pluggyItemId)
  // Produto de investimentos pode não estar habilitado na aplicação; não é motivo para falhar a sync
  const invs = await pluggy.investments(inst.pluggyItemId).catch(() => [])

  const rows = [
    ...accs.map((a) => ({
      pluggyId: a.id,
      name: [a.marketingName || a.name, a.number && `(${a.number.slice(-4)})`].filter(Boolean).join(" "),
      type: accountType(a),
      // Cartão: fatura aberta é dívida, entra negativa no patrimônio
      balance: a.type === "CREDIT" ? -Math.abs(a.balance) : a.balance,
    })),
    ...invs.map((i) => ({ pluggyId: INVESTMENT_PREFIX + i.id, name: i.name, type: "SAVINGS_INVESTMENT" as const, balance: i.balance })),
  ]
  if (rows.length) {
    await db
      .insert(accounts)
      .values(rows.map((r) => ({ ...r, institutionId: inst.id, source: "PLUGGY" as const })))
      // nome e tipo são editáveis pelo usuário: só o saldo é atualizado
      .onConflictDoUpdate({ target: accounts.pluggyId, set: { balance: sql`excluded.balance`, institutionId: inst.id } })
  }
  await db
    .update(institutions)
    .set({
      name: item.connector?.name ?? inst.name,
      status: item.status,
      error: item.status === "UPDATED" ? null : (item.error?.message ?? item.executionStatus ?? null),
    })
    .where(eq(institutions.id, inst.id))
}

async function syncAccountTransactions(pluggy: Pluggy, cat: Categorizer, acc: typeof accounts.$inferSelect) {
  const windowStart = acc.transactionsSyncedAt ? addDays(toLocalDate(acc.transactionsSyncedAt), -OVERLAP_DAYS) : null
  const startedAt = new Date()
  const incoming = (await pluggy.transactions(acc.pluggyId!, windowStart ?? undefined)).map(normalizePluggyTx)
  const ids = incoming.map((i) => i.pluggyId)

  const existing = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, acc.id),
        or(ids.length ? inArray(transactions.pluggyId, ids) : undefined, eq(transactions.status, "PENDING")),
      ),
    )
  const { inserts, updates, deletes } = mergeTransactions(existing, incoming, windowStart)

  const values = []
  for (const ins of inserts) {
    const { carry, ...tx } = ins
    const userCategory = carry?.categorySource === "USER"
    const res = userCategory
      ? { subcategoryId: carry.subcategoryId, categorySource: "USER" as const, suggestedSubcategoryId: null, suggestionConfidence: null }
      : await cat.categorize({ ...tx, accountId: acc.id, accountName: acc.name })
    values.push({
      ...tx,
      ...res,
      accountId: acc.id,
      kind: deriveKind(tx.amount, res.subcategoryId ? cat.kinds.get(res.subcategoryId) : null),
      note: carry?.note ?? null,
      ignored: carry?.ignored ?? false,
    })
  }
  for (let i = 0; i < values.length; i += 500) await db.insert(transactions).values(values.slice(i, i + 500))

  const byId = new Map(existing.map((e) => [e.id, e]))
  const changed = updates.filter(({ id, data }) => {
    const e = byId.get(id)!
    return (Object.keys(data) as (keyof typeof data)[]).some((k) => e[k] !== data[k])
  })
  await Promise.all(
    changed.map(({ id, data }) => {
      const e = byId.get(id)!
      const kind = e.kind === "TRANSFER" ? "TRANSFER" : deriveKind(data.amount, e.subcategoryId ? cat.kinds.get(e.subcategoryId) : null)
      return db.update(transactions).set({ ...data, kind, updatedAt: new Date() }).where(eq(transactions.id, id))
    }),
  )
  if (deletes.length) await db.delete(transactions).where(inArray(transactions.id, deletes))
  await db.update(accounts).set({ transactionsSyncedAt: startedAt }).where(eq(accounts.id, acc.id))

  const dates = values.map((v) => v.date).sort()
  return { inserted: values.length, minDate: dates[0] as string | undefined, firstSync: !windowStart }
}

/**
 * Sincroniza todas as conexões. Conta por conta, começando pela sincronizada há mais tempo;
 * ao estourar o orçamento de tempo para (status PARTIAL) e a próxima execução continua de onde parou.
 */
export async function runSync(trigger: "CRON" | "MANUAL", budgetMs = 45_000) {
  const started = Date.now()
  const [run] = await db.insert(syncRuns).values({ trigger }).returning({ id: syncRuns.id })
  try {
    const pluggy = await pluggyClient()
    const insts = await db.select().from(institutions)
    for (const inst of insts) {
      await syncItem(pluggy, inst).catch((e: Error) =>
        db.update(institutions).set({ error: e.message, status: "ERROR" }).where(eq(institutions.id, inst.id)),
      )
    }

    const cat = await loadCategorizer()
    const accs = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.source, "PLUGGY"), eq(accounts.archived, false), isNotNull(accounts.pluggyId), sql`${accounts.pluggyId} not like ${INVESTMENT_PREFIX + "%"}`))
      .orderBy(sql`${accounts.transactionsSyncedAt} asc nulls first`, asc(accounts.id))

    let partial = false
    let since: string | null | undefined
    for (const acc of accs) {
      if (Date.now() - started > budgetMs) {
        partial = true
        break
      }
      const r = await syncAccountTransactions(pluggy, cat, acc)
      if (r.firstSync) since = null
      else if (r.minDate && since !== null && (!since || r.minDate < since)) since = r.minDate
    }
    if (since !== undefined) await detectAndMarkTransfers(since)

    await refreshManualBalances()
    await snapshotBalances(today())
    await db.update(institutions).set({ lastSyncedAt: new Date() }).where(sql`${institutions.error} is null`)
    await db.update(syncRuns).set({ status: partial ? "PARTIAL" : "OK", finishedAt: new Date() }).where(eq(syncRuns.id, run.id))
    return { status: partial ? "PARTIAL" : "OK" }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await db.update(syncRuns).set({ status: "ERROR", error, finishedAt: new Date() }).where(eq(syncRuns.id, run.id))
    return { status: "ERROR", error }
  }
}
