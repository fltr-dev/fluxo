import "server-only"
import { cache } from "react"
import { aliasedTable, and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, ne, sql } from "drizzle-orm"
import {
  accounts,
  categories,
  db,
  goalAccounts,
  goalContributions,
  goals,
  institutions,
  reserveSettings,
  syncRuns,
  transactions,
} from "@/db"
import { averageMonthlyExpense, netWorthSeries, reserveStatus } from "./domain/calc"
import { addMonths, monthEnd, monthOf, monthStart, monthsInRange, resolvePeriod, today, type Period } from "./domain/dates"

export type SearchParams = Record<string, string | string[] | undefined>
export type Filters = Period & {
  preset: string
  accountId?: number
  categoryId?: number
  kind?: "INCOME" | "EXPENSE"
  q?: string
  view?: "uncategorized" | "suggested" | "transfers" | "pending"
  page: number
}

const str = (sp: SearchParams, k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined)
const posInt = (sp: SearchParams, k: string) => {
  const n = Number(str(sp, k))
  return Number.isInteger(n) && n > 0 ? n : undefined
}
const isoDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

/** Filtros vêm da URL (compartilháveis e com histórico do navegador). */
export function parseFilters(sp: SearchParams): Filters {
  const preset = str(sp, "periodo") ?? "mes"
  const tipo = str(sp, "tipo")
  const ver = str(sp, "ver")
  return {
    preset,
    ...resolvePeriod(preset, today(), isoDate(str(sp, "de")), isoDate(str(sp, "ate"))),
    accountId: posInt(sp, "conta"),
    categoryId: posInt(sp, "categoria"),
    kind: tipo === "receita" ? "INCOME" : tipo === "despesa" ? "EXPENSE" : undefined,
    q: str(sp, "q")?.slice(0, 100),
    view: ver === "uncategorized" || ver === "suggested" || ver === "transfers" || ver === "pending" ? ver : undefined,
    page: posInt(sp, "pagina") ?? 1,
  }
}

/** Mesma URL com alguns parâmetros trocados (undefined remove). */
export function withParams(sp: SearchParams, patch: Record<string, string | number | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) p.set(k, v)
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") p.delete(k)
    else p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : "?"
}

const categoryMatch = (id: number) =>
  sql`${transactions.subcategoryId} in (select id from categories where id = ${id} or parent_id = ${id})`

/** report=true: só o que conta em receita/despesa (sem transferências e ignoradas). */
export function txWhere(f: Filters, report: boolean, period: Period = f) {
  return and(
    gte(transactions.date, period.from),
    lte(transactions.date, period.to),
    f.accountId ? eq(transactions.accountId, f.accountId) : undefined,
    f.categoryId ? categoryMatch(f.categoryId) : undefined,
    f.kind ? eq(transactions.kind, f.kind) : undefined,
    report ? and(eq(transactions.ignored, false), ne(transactions.kind, "TRANSFER")) : undefined,
  )
}

const incomeSum = sql<number>`coalesce(sum(case when ${transactions.kind} = 'INCOME' then ${transactions.amount} end), 0)::float8`
const expenseSum = sql<number>`coalesce(-sum(case when ${transactions.kind} = 'EXPENSE' then ${transactions.amount} end), 0)::float8`

export async function totals(f: Filters, period: Period = f) {
  const [r] = await db.select({ income: incomeSum, expense: expenseSum }).from(transactions).where(txWhere(f, true, period))
  return r
}

export async function monthlyTotals(f: Filters, period: Period) {
  const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`
  const rows = await db
    .select({ month, income: incomeSum, expense: expenseSum })
    .from(transactions)
    .where(txWhere(f, true, period))
    .groupBy(month)
  return new Map(rows.map((r) => [r.month, r]))
}

const sub = aliasedTable(categories, "sub")
const parent = aliasedTable(categories, "parent")

/** Agrupa por categoria; se o filtro já é uma categoria-pai, agrupa pelas subcategorias dela (drill-down). */
export async function byCategory(f: Filters, drillParentId?: number) {
  const kind = f.kind ?? "EXPENSE"
  const sign = kind === "EXPENSE" ? -1 : 1
  const total = sql<number>`(${sign} * sum(${transactions.amount}))::float8`
  const g = drillParentId ? sub : parent
  return db
    .select({ id: g.id, name: g.name, color: parent.color, total })
    .from(transactions)
    .leftJoin(sub, eq(transactions.subcategoryId, sub.id))
    .leftJoin(parent, eq(sub.parentId, parent.id))
    .where(txWhere({ ...f, kind }, true))
    .groupBy(g.id, g.name, parent.color)
    .orderBy(desc(total))
}

/** Despesa por mês e categoria-pai, para barras empilhadas. */
export async function monthlyByCategory(f: Filters, period: Period) {
  const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`
  const kind = f.kind ?? "EXPENSE"
  return db
    .select({ month, id: parent.id, name: parent.name, color: parent.color, total: sql<number>`(${kind === "EXPENSE" ? -1 : 1} * sum(${transactions.amount}))::float8` })
    .from(transactions)
    .leftJoin(sub, eq(transactions.subcategoryId, sub.id))
    .leftJoin(parent, eq(sub.parentId, parent.id))
    .where(txWhere({ ...f, kind }, true, period))
    .groupBy(month, parent.id, parent.name, parent.color)
}

export async function listAccounts() {
  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      source: accounts.source,
      balance: accounts.balance,
      openingBalance: accounts.openingBalance,
      isEmergencyReserve: accounts.isEmergencyReserve,
      archived: accounts.archived,
      pluggyId: accounts.pluggyId,
      institution: institutions.name,
      institutionId: accounts.institutionId,
    })
    .from(accounts)
    .leftJoin(institutions, eq(accounts.institutionId, institutions.id))
    .orderBy(asc(accounts.archived), asc(institutions.name), asc(accounts.name))
}

export async function netWorth(months: string[]) {
  // último snapshot de cada mês + o primeiro snapshot de cada conta (âncora da reconstrução)
  const [rows, flows] = await Promise.all([
    db.execute<{ account_id: number; date: string; balance: string }>(sql`
      (select distinct on (s.account_id, to_char(s.date, 'YYYY-MM')) s.account_id, s.date::text as date, s.balance
      from balance_snapshots s join accounts a on a.id = s.account_id
      where not a.archived and s.date <= ${monthEnd(months[months.length - 1])}
      order by s.account_id, to_char(s.date, 'YYYY-MM'), s.date desc)
      union
      (select distinct on (s.account_id) s.account_id, s.date::text as date, s.balance
      from balance_snapshots s join accounts a on a.id = s.account_id
      where not a.archived
      order by s.account_id, s.date)`),
    db.execute<{ account_id: number; month: string; amount: number }>(sql`
      select t.account_id, to_char(t.date, 'YYYY-MM') as month, sum(t.amount)::float8 as amount
      from (select account_id, date, amount from transactions union all select account_id, date, amount from investment_movements) t
      join accounts a on a.id = t.account_id
      join (select account_id, min(date) as d from balance_snapshots group by account_id) f on f.account_id = t.account_id
      where not a.archived and t.date <= f.d
      group by 1, 2`),
  ])
  return netWorthSeries(
    rows.rows.map((r) => ({ accountId: r.account_id, date: r.date, balance: Number(r.balance) })),
    months,
    flows.rows.map((f) => ({ accountId: f.account_id, month: f.month, amount: f.amount })),
  )
}

export async function limitsWithUsage(period: Period) {
  const r = await db.execute<{ id: number; category_id: number; monthly_amount: string; name: string; parent_name: string | null; spent: number }>(sql`
    select l.id, l.category_id, l.monthly_amount, c.name, p.name as parent_name,
      coalesce((
        select -sum(t.amount) from transactions t
        where t.kind = 'EXPENSE' and not t.ignored and t.date between ${period.from} and ${period.to}
          and t.subcategory_id in (select id from categories where id = l.category_id or parent_id = l.category_id)
      ), 0)::float8 as spent
    from spending_limits l join categories c on c.id = l.category_id left join categories p on p.id = c.parent_id
    order by coalesce(p.name, c.name), c.name`)
  return r.rows.map((x) => ({
    id: x.id,
    categoryId: x.category_id,
    label: x.parent_name ? `${x.parent_name} / ${x.name}` : x.name,
    limit: Number(x.monthly_amount),
    spent: x.spent,
  }))
}

export async function goalsWithProgress() {
  const [list, links, contribs, accs] = await Promise.all([
    db.select().from(goals).where(eq(goals.archived, false)).orderBy(asc(goals.deadline)),
    db.select().from(goalAccounts),
    db.select().from(goalContributions).orderBy(desc(goalContributions.date)),
    db.select({ id: accounts.id, balance: accounts.balance }).from(accounts),
  ])
  const balance = new Map(accs.map((a) => [a.id, a.balance]))
  return list.map((g) => {
    const accountIds = links.filter((l) => l.goalId === g.id).map((l) => l.accountId)
    const contributions = contribs.filter((c) => c.goalId === g.id)
    const current =
      g.tracking === "ACCOUNT"
        ? accountIds.reduce((s, id) => s + (balance.get(id) ?? 0), 0)
        : g.initialAmount + contributions.reduce((s, c) => s + c.amount, 0)
    return { ...g, accountIds, contributions, current }
  })
}

/** Despesa média = últimos 12 meses fechados (sem transferências e ignoradas). */
export async function reserveOverview() {
  const now = monthOf(today())
  const [settings] = await db.select().from(reserveSettings).where(eq(reserveSettings.id, 1))
  const s = settings ?? { targetMode: "MONTHS" as const, targetMonths: 6, targetAmount: null }
  const reserveAccounts = await db
    .select({ id: accounts.id, name: accounts.name, balance: accounts.balance })
    .from(accounts)
    .where(and(eq(accounts.isEmergencyReserve, true), eq(accounts.archived, false)))
  const balance = reserveAccounts.reduce((a, b) => a + b.balance, 0)
  const monthly = await monthlyTotals(
    { preset: "custom", page: 1, from: monthStart(addMonths(now, -12)), to: monthEnd(addMonths(now, -1)) },
    { from: monthStart(addMonths(now, -12)), to: monthEnd(addMonths(now, -1)) },
  )
  const avg = averageMonthlyExpense(new Map([...monthly].map(([m, v]) => [m, v.expense])), now, 12)
  return {
    settings: s,
    accounts: reserveAccounts,
    // despesa de cada um dos 12 meses fechados, para o gráfico da reserva
    expenseByMonth: monthsInRange(monthStart(addMonths(now, -12)), monthEnd(addMonths(now, -1))).map((m) => ({ month: m, value: monthly.get(m)?.expense ?? 0 })),
    balance,
    avgMonthlyExpense: avg,
    ...reserveStatus({ balance, avgMonthlyExpense: avg, mode: s.targetMode, targetMonths: s.targetMonths, targetAmount: s.targetAmount }),
  }
}

/** Contadores do shell (sidebar/topo): pendências e estado da sincronização. */
export const shellStatus = cache(async () => {
  const [[counts], [lastRun], insts] = await Promise.all([
    db
      .select({
        uncategorized: sql<number>`(count(*) filter (where ${transactions.subcategoryId} is null and ${transactions.kind} <> 'TRANSFER' and not ${transactions.ignored}))::int`,
        suggested: sql<number>`(count(*) filter (where ${transactions.suggestedSubcategoryId} is not null))::int`,
      })
      .from(transactions),
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1),
    db.select({ id: institutions.id, name: institutions.name, error: institutions.error }).from(institutions),
  ])
  return { ...counts, lastRun, connectionErrors: insts.filter((i) => i.error) }
})

export const PAGE_SIZE = 50

const listWhere = (f: Filters) =>
  and(
    txWhere(f, false),
    f.q ? ilike(transactions.description, `%${f.q}%`) : undefined,
    f.view === "uncategorized" ? and(isNull(transactions.subcategoryId), ne(transactions.kind, "TRANSFER")) : undefined,
    f.view === "suggested" ? isNotNull(transactions.suggestedSubcategoryId) : undefined,
    f.view === "transfers" ? eq(transactions.kind, "TRANSFER") : undefined,
    f.view === "pending" ? eq(transactions.status, "PENDING") : undefined,
  )

export async function listTransactions(f: Filters) {
  const where = listWhere(f)
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        tx: transactions,
        accountName: accounts.name,
        accountSource: accounts.source,
        subName: sub.name,
        parentName: parent.name,
        color: parent.color,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(sub, eq(transactions.subcategoryId, sub.id))
      .leftJoin(parent, eq(sub.parentId, parent.id))
      .where(where)
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db.select({ count: sql<number>`count(*)::int` }).from(transactions).where(where),
  ])
  return { rows, count }
}

/** Para o CSV: mesmo filtro, sem paginação. */
export async function exportTransactions(f: Filters) {
  return db
    .select({
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      kind: transactions.kind,
      status: transactions.status,
      account: accounts.name,
      category: parent.name,
      subcategory: sub.name,
      note: transactions.note,
      ignored: transactions.ignored,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(sub, eq(transactions.subcategoryId, sub.id))
    .leftJoin(parent, eq(sub.parentId, parent.id))
    .where(listWhere(f))
    .orderBy(desc(transactions.date), desc(transactions.id))
}

export const monthsOf = (p: Period) => monthsInRange(p.from, p.to)

/** Todas as categorias, agrupadas: pais com suas subcategorias. */
export async function categoryTree(includeArchived = false) {
  const all = await db.select().from(categories).orderBy(asc(categories.kind), asc(categories.name))
  const visible = all.filter((c) => includeArchived || !c.archived)
  return visible
    .filter((c) => c.parentId == null)
    .map((p) => ({ ...p, subs: visible.filter((s) => s.parentId === p.id) }))
}
