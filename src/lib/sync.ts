import "server-only"
import { and, asc, eq, inArray, isNotNull, notLike, or, sql } from "drizzle-orm"
import { accounts, db, institutions, investmentMovements, investments, investmentTrades, syncRuns, transactions } from "@/db"
import { deriveKind } from "./domain/categorize"
import { addDays, toLocalDate, today } from "./domain/dates"
import { classifyPluggy, detectIncomeFromTransactions, positionFromTrades, rateLabelOf } from "./domain/investments"
import { deriveInvestmentMovements, deriveInvestmentTrades, mergeTransactions, normalizePluggyTx, type PluggyInvestment } from "./domain/sync-merge"
import { detectAndMarkTransfers, loadCategorizer, refreshManualBalances, snapshotBalances } from "./ledger"
import { refreshManualQuotes, updateMarketSeries } from "./market"
import { pluggyClient, type PluggyAccount } from "./pluggy"

type Pluggy = Awaited<ReturnType<typeof pluggyClient>>
type Categorizer = Awaited<ReturnType<typeof loadCategorizer>>

// Investimentos não têm transações comuns; o prefixo os distingue das contas na mesma coluna pluggyId
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
    const saved = await db
      .insert(accounts)
      .values(rows.map((r) => ({ ...r, institutionId: inst.id, source: "PLUGGY" as const })))
      // nome e tipo são editáveis pelo usuário: só o saldo é atualizado
      .onConflictDoUpdate({ target: accounts.pluggyId, set: { balance: sql`excluded.balance`, institutionId: inst.id } })
      .returning({ id: accounts.id, pluggyId: accounts.pluggyId })
    await syncInvestments(pluggy, invs, new Map(saved.map((s) => [s.pluggyId, s.id])), item.connector?.name ?? inst.name)
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

/**
 * Ativos da Pluggy na tela de Investimentos (categoria, quantidade, cotação, custo, taxa) e as movimentações de cada um:
 * aplicações/resgates para o histórico do patrimônio e operações do ativo. As movimentações são refeitas a cada sync
 * (poucas linhas por investimento); investimento cuja busca falhar mantém o que já tinha. A categoria escolhida pelo
 * usuário (`assetClassOverride`) e os lançamentos manuais nunca são tocados.
 */
async function syncInvestments(pluggy: Pluggy, invs: PluggyInvestment[], accountIds: Map<string | null, number>, broker: string) {
  const values = invs.flatMap((inv) => {
    const accountId = accountIds.get(INVESTMENT_PREFIX + inv.id)
    if (!accountId) return []
    return [
      {
        accountId,
        pluggyId: inv.id,
        assetClass: classifyPluggy(inv),
        code: inv.code || null,
        name: inv.name,
        broker: inv.institution?.name || inv.issuer || broker,
        quantity: inv.quantity ?? null,
        unitPrice: inv.value ?? null,
        invested: inv.amountOriginal ?? null,
        rateLabel: rateLabelOf(inv),
        dueDate: inv.dueDate?.slice(0, 10) ?? null,
        priceUpdatedAt: new Date(),
      },
    ]
  })
  if (!values.length) return
  const saved = await db
    .insert(investments)
    .values(values)
    .onConflictDoUpdate({
      target: investments.pluggyId,
      set: {
        assetClass: sql`excluded.asset_class`,
        code: sql`excluded.code`,
        name: sql`excluded.name`,
        broker: sql`excluded.broker`,
        quantity: sql`excluded.quantity`,
        unitPrice: sql`excluded.unit_price`,
        invested: sql`coalesce(excluded.invested, ${investments.invested})`,
        rateLabel: sql`excluded.rate_label`,
        dueDate: sql`excluded.due_date`,
        priceUpdatedAt: sql`excluded.price_updated_at`,
      },
    })
    .returning({ id: investments.id, pluggyId: investments.pluggyId, invested: investments.invested })
  const investmentIds = new Map(saved.map((s) => [s.pluggyId, s.id]))

  const fetched = await Promise.all(
    invs.map(async (inv) => {
      const accountId = accountIds.get(INVESTMENT_PREFIX + inv.id)
      const investmentId = investmentIds.get(inv.id)
      const txs = await pluggy.investmentTransactions(inv.id).catch(() => null)
      return accountId && investmentId && txs ? { inv, accountId, investmentId, txs } : null
    }),
  )
  const ok = fetched.filter((f) => f !== null)
  if (!ok.length) return

  await db.delete(investmentMovements).where(inArray(investmentMovements.accountId, ok.map((f) => f.accountId)))
  const moves = ok.flatMap((f) => deriveInvestmentMovements(f.inv, f.txs).map((m) => ({ ...m, accountId: f.accountId })))
  if (moves.length) await db.insert(investmentMovements).values(moves)

  // Operações vindas da Pluggy são refeitas; manuais (sem pluggyId) e proventos achados na conta ("tx:…") ficam
  await db
    .delete(investmentTrades)
    .where(and(inArray(investmentTrades.investmentId, ok.map((f) => f.investmentId)), isNotNull(investmentTrades.pluggyId), notLike(investmentTrades.pluggyId, "tx:%")))
  const trades = ok.flatMap((f) => deriveInvestmentTrades(f.inv, f.txs).map((t) => ({ ...t, investmentId: f.investmentId })))
  for (let i = 0; i < trades.length; i += 500) await db.insert(investmentTrades).values(trades.slice(i, i + 500)).onConflictDoNothing()

  // Sem custo informado pela Pluggy, o custo sai das próprias operações
  const noCost = saved.filter((s) => s.invested == null)
  for (const s of noCost) {
    const own = trades.filter((t) => t.investmentId === s.id)
    if (own.length) await db.update(investments).set({ invested: positionFromTrades(own).invested }).where(eq(investments.id, s.id))
  }
}

/** Proventos que caíram como crédito na conta da corretora viram proventos do ativo citado na descrição. */
async function syncIncomeFromTransactions() {
  const coded = await db.select({ id: investments.id, code: investments.code }).from(investments).where(isNotNull(investments.code))
  if (!coded.length) return
  const txs = await db
    .select({ id: transactions.id, date: transactions.date, amount: transactions.amount, description: transactions.description })
    .from(transactions)
    .where(and(sql`${transactions.amount} > 0`, sql`${transactions.description} ~* '(rendimento|dividend|juros s|jcp)'`))
  const found = detectIncomeFromTransactions(txs, new Map(coded.map((c) => [c.code!.toUpperCase(), c.id])))
  if (found.length) await db.insert(investmentTrades).values(found).onConflictDoNothing()
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
    await syncIncomeFromTransactions()

    // Índices (CDI, IPCA, IBOV) e cotações dos ativos manuais: opcionais, falha não derruba a sync
    await updateMarketSeries().catch(() => [])
    await refreshManualQuotes().catch(() => null)

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
