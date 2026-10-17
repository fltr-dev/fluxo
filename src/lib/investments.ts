import "server-only"
import { cache } from "react"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { accounts, db, institutions, investments, investmentTargets, investmentTrades, marketSeries } from "@/db"
import { addMonths, monthEnd, monthOf, monthsInRange, today } from "./domain/dates"
import {
  accumulate,
  cdiByMonth,
  CLASS_INFO,
  INCOME_TYPES,
  indexReturnsByMonth,
  isIncome,
  isVariable,
  monthlyReturns,
  positionFromTrades,
  rebalance,
  type AssetClass,
  type IncomeType,
  type TradeType,
} from "./domain/investments"

// Consultas da tela de Investimentos. Cada ativo tem a sua conta (`accounts`), que guarda o saldo e os snapshots.

export type Holding = Awaited<ReturnType<typeof listHoldings>>[number]

/** Ativos da carteira com o saldo da conta e os números derivados (preço médio, resultado). Uma consulta por requisição. */
export const listHoldings = cache(async () => {
  const rows = await db
    .select({
      id: investments.id,
      accountId: investments.accountId,
      pluggyId: investments.pluggyId,
      autoClass: investments.assetClass,
      override: investments.assetClassOverride,
      code: investments.code,
      name: accounts.name,
      broker: investments.broker,
      institution: institutions.name,
      quantity: investments.quantity,
      unitPrice: investments.unitPrice,
      invested: investments.invested,
      rateLabel: investments.rateLabel,
      dueDate: investments.dueDate,
      priceUpdatedAt: investments.priceUpdatedAt,
      value: accounts.balance,
      archived: accounts.archived,
    })
    .from(investments)
    .innerJoin(accounts, eq(accounts.id, investments.accountId))
    .leftJoin(institutions, eq(institutions.id, accounts.institutionId))
    .orderBy(desc(accounts.balance))
  return rows.map((r) => {
    const assetClass: AssetClass = r.override ?? r.autoClass
    const variable = isVariable(assetClass)
    const profit = r.invested != null ? r.value - r.invested : null
    return {
      ...r,
      assetClass,
      variable,
      manual: !r.pluggyId,
      broker: r.broker ?? r.institution ?? (r.pluggyId ? null : "Manual"),
      avgPrice: variable && r.quantity && r.invested != null ? r.invested / r.quantity : null,
      profit,
      profitPct: profit != null && r.invested ? profit / r.invested : null,
    }
  })
})

/** Só o que está na carteira hoje (conta ativa e com saldo ou quantidade). */
export const activeHoldings = cache(async () => (await listHoldings()).filter((h) => !h.archived && (h.value > 0 || (h.quantity ?? 0) > 0)))

export async function targets() {
  const rows = await db.select().from(investmentTargets)
  return new Map(rows.map((r) => [r.assetClass as AssetClass, r.percent]))
}

/** Totais e alocação por categoria (atual × alvo). */
export async function portfolioSummary() {
  const [list, tgt] = await Promise.all([activeHoldings(), targets()])
  const total = list.reduce((s, h) => s + h.value, 0)
  // ativo sem custo conhecido entra com o próprio saldo, para não inflar o lucro
  const invested = list.reduce((s, h) => s + (h.invested ?? h.value), 0)
  const byClass = new Map<AssetClass, number>()
  for (const h of list) byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + h.value)
  return { holdings: list, total, invested, profit: total - invested, profitPct: invested ? (total - invested) / invested : null, allocation: rebalance(byClass, tgt), hasTargets: tgt.size > 0 }
}

// ---------- Operações e proventos ----------

export type TradeRow = Awaited<ReturnType<typeof listTrades>>[number]

export async function listTrades(filter: { investmentId?: number; types?: TradeType[]; from?: string; to?: string } = {}) {
  return db
    .select({
      id: investmentTrades.id,
      investmentId: investmentTrades.investmentId,
      date: investmentTrades.date,
      type: investmentTrades.type,
      quantity: investmentTrades.quantity,
      price: investmentTrades.price,
      amount: investmentTrades.amount,
      fees: investmentTrades.fees,
      note: investmentTrades.note,
      pluggyId: investmentTrades.pluggyId,
      code: investments.code,
      name: accounts.name,
      autoClass: investments.assetClass,
      override: investments.assetClassOverride,
    })
    .from(investmentTrades)
    .innerJoin(investments, eq(investments.id, investmentTrades.investmentId))
    .innerJoin(accounts, eq(accounts.id, investments.accountId))
    .where(
      and(
        filter.investmentId ? eq(investmentTrades.investmentId, filter.investmentId) : undefined,
        filter.types ? inArray(investmentTrades.type, filter.types) : undefined,
        filter.from ? sql`${investmentTrades.date} >= ${filter.from}` : undefined,
        filter.to ? sql`${investmentTrades.date} <= ${filter.to}` : undefined,
      ),
    )
    .orderBy(desc(investmentTrades.date), desc(investmentTrades.id))
}

/** Proventos: recebidos nos últimos 12 meses (por mês e tipo, por ativo) e os anunciados, a receber. */
export async function incomeOverview(months = 12) {
  const now = today()
  const window = monthsInRange(`${addMonths(monthOf(now), 1 - months)}-01`, now)
  const [rows, list] = await Promise.all([listTrades({ types: [...INCOME_TYPES] }), activeHoldings()])
  const received = rows.filter((r) => r.date <= now)
  const upcoming = rows.filter((r) => r.date > now).reverse()
  const inWindow = received.filter((r) => r.date >= `${window[0]}-01`)
  const byMonth = window.map((month) => {
    const m = inWindow.filter((r) => r.date.startsWith(month))
    const sum = (types: IncomeType[]) => m.filter((r) => types.includes(r.type as IncomeType)).reduce((s, r) => s + r.amount, 0)
    return { month, fii: sum(["YIELD"]), dividend: sum(["DIVIDEND"]), jcp: sum(["JCP"]), interest: sum(["INTEREST"]) }
  })
  const assets = new Map<number, { id: number; code: string | null; name: string; assetClass: AssetClass; total: number }>()
  for (const r of inWindow) {
    const a = assets.get(r.investmentId) ?? { id: r.investmentId, code: r.code, name: r.name, assetClass: r.override ?? r.autoClass, total: 0 }
    a.total += r.amount
    assets.set(r.investmentId, a)
  }
  const total = inWindow.reduce((s, r) => s + r.amount, 0)
  // Yield on cost: proventos de 12 meses sobre o custo do que paga proventos (renda variável)
  const payingCost = list.filter((h) => h.variable && h.assetClass !== "CRIPTO").reduce((s, h) => s + (h.invested ?? 0), 0)
  const prevStart = `${addMonths(window[0], -months)}-01`
  const prevTotal = received.filter((r) => r.date >= prevStart && r.date < `${window[0]}-01`).reduce((s, r) => s + r.amount, 0)
  const best = byMonth.reduce((b, m) => (m.fii + m.dividend + m.jcp + m.interest > b.total ? { month: m.month, total: m.fii + m.dividend + m.jcp + m.interest } : b), { month: "", total: 0 })
  return {
    total,
    average: total / months,
    best,
    yieldOnCost: payingCost ? total / payingCost : null,
    payingCost,
    growth: prevTotal ? (total - prevTotal) / prevTotal : null,
    byMonth,
    byAsset: [...assets.values()].sort((a, b) => b.total - a.total),
    upcoming,
    upcomingTotal: upcoming.reduce((s, r) => s + r.amount, 0),
    received,
    count: rows.length,
  }
}

// ---------- Histórico e rentabilidade ----------

export type HistoryPoint = {
  month: string
  value: number | null
  applied: number | null
  /** rentabilidade do mês (Dietz modificado) e acumulada desde o início da janela */
  ret: number | null
  acc: number | null
  cdi: number | null
  cdiAcc: number | null
  ibovAcc: number | null
  ipcaAcc: number | null
}

/** Primeiro mês com saldo registrado de algum investimento (início do histórico). */
export async function firstHistoryMonth() {
  const r = await db.execute<{ d: string | null }>(sql`
    select min(s.date)::text as d from balance_snapshots s join investments i on i.account_id = s.account_id`)
  return r.rows[0]?.d ? monthOf(r.rows[0].d) : null
}

/**
 * Carteira mês a mês: saldo no fim do mês (último snapshot de cada conta de investimento; o mês atual usa o saldo de hoje),
 * valor aplicado (custo pelas operações), rentabilidade pelo Dietz modificado e os índices acumulados na mesma janela.
 * Meses antes do primeiro saldo registrado ficam sem valor: a rentabilidade só usa dado real.
 */
export async function portfolioHistory(months: string[], investmentId?: number) {
  const now = today()
  const scope = investmentId ? sql`and i.id = ${investmentId}` : sql``
  const [snaps, holdings, trades, market] = await Promise.all([
    db.execute<{ account_id: number; month: string; balance: string; first: boolean }>(sql`
      select s.account_id, to_char(s.date, 'YYYY-MM') as month, s.balance,
        s.date = min(s.date) over (partition by s.account_id) as first
      from (
        select distinct on (s.account_id, to_char(s.date, 'YYYY-MM')) s.account_id, s.date, s.balance
        from balance_snapshots s join investments i on i.account_id = s.account_id join accounts a on a.id = s.account_id
        where not a.archived ${scope}
        order by s.account_id, to_char(s.date, 'YYYY-MM'), s.date desc
      ) s`),
    listHoldings(),
    db
      .select({ investmentId: investmentTrades.investmentId, date: investmentTrades.date, type: investmentTrades.type, quantity: investmentTrades.quantity, price: investmentTrades.price, amount: investmentTrades.amount, fees: investmentTrades.fees })
      .from(investmentTrades)
      .where(investmentId ? eq(investmentTrades.investmentId, investmentId) : undefined)
      .orderBy(asc(investmentTrades.date)),
    db.select().from(marketSeries).where(sql`${marketSeries.date} >= ${`${addMonths(months[0], -1)}-01`}`),
  ])
  const current = monthOf(now)
  const accounts = holdings.filter((h) => !h.archived && (!investmentId || h.id === investmentId))
  const accountOf = new Map(accounts.map((h) => [h.id, h.accountId]))

  // saldo de cada conta no fim de cada mês; o mês atual sempre pelo saldo de hoje
  const balance = new Map<string, number>()
  const firstMonth = new Map<number, string>()
  for (const s of snaps.rows) {
    balance.set(`${s.account_id}|${s.month}`, Number(s.balance))
    if (s.first) firstMonth.set(s.account_id, s.month)
  }
  for (const h of accounts) {
    balance.set(`${h.accountId}|${current}`, h.value)
    if (!firstMonth.has(h.accountId)) firstMonth.set(h.accountId, current)
  }
  // conta sem snapshot num mês intermediário repete o último saldo conhecido
  const valueAt = (accountId: number, month: string) => {
    const first = firstMonth.get(accountId)
    if (!first || month < first) return null
    for (let m = month; m >= first; m = addMonths(m, -1)) {
      const v = balance.get(`${accountId}|${m}`)
      if (v != null) return v
    }
    return null
  }

  const all = [addMonths(months[0], -1), ...months]
  const values = all.map((m) => {
    if (m > current) return null
    const vs = accounts.map((h) => valueAt(h.accountId, m)).filter((v) => v != null)
    return vs.length ? vs.reduce((a, b) => a + b, 0) : null
  })
  const flows = all.map((m) => {
    let f = 0
    for (const t of trades) {
      if (!t.date.startsWith(m) || !accountOf.has(t.investmentId)) continue
      if (t.type === "BUY") f += t.amount + t.fees
      else if (t.type === "SELL") f -= t.amount - t.fees
    }
    // conta que entra na carteira sem operação registrada no mês: o saldo inicial conta como aporte
    for (const h of accounts) {
      if (firstMonth.get(h.accountId) !== m || m === all[0]) continue
      const hasTrade = trades.some((t) => t.investmentId === h.id && t.date <= monthEnd(m) && (t.type === "BUY" || t.type === "SELL"))
      if (!hasTrade) f += valueAt(h.accountId, m) ?? 0
    }
    return f
  })
  const income = all.map((m) => trades.filter((t) => accountOf.has(t.investmentId) && isIncome(t.type) && t.date.startsWith(m) && t.date <= now).reduce((s, t) => s + t.amount, 0))
  const applied = all.map((m, i) => {
    if (values[i] == null) return null
    let sum = 0
    for (const h of accounts) {
      if (valueAt(h.accountId, m) == null) continue
      const own = trades.filter((t) => t.investmentId === h.id && t.date <= monthEnd(m))
      sum += own.length ? positionFromTrades(own).invested : (h.invested ?? valueAt(h.accountId, m) ?? 0)
    }
    return sum
  })

  const rets = monthlyReturns(values, flows, income)
  // a janela começa no primeiro mês com rentabilidade; os índices acumulam a partir do mesmo ponto
  const startIdx = rets.findIndex((r) => r != null)
  const cdi = cdiByMonth(market.filter((r) => r.series === "CDI"))
  const ibov = indexReturnsByMonth(market.filter((r) => r.series === "IBOV"))
  const ipca = new Map(market.filter((r) => r.series === "IPCA").map((r) => [monthOf(r.date), r.value / 100]))
  const within = (i: number) => startIdx > 0 && i >= startIdx - 1
  const bench = (map: Map<string, number>) => {
    const acc = accumulate(all.map((m, i) => (within(i) && i >= startIdx ? (map.get(m) ?? null) : null)))
    const has = all.some((m, i) => i >= startIdx && map.has(m))
    return all.map((_, i) => (within(i) && has ? acc[i] : null))
  }
  const accRet = accumulate(rets)
  const cdiAcc = bench(cdi)
  const ibovAcc = bench(ibov)
  const ipcaAcc = bench(ipca)

  const points: HistoryPoint[] = all.map((month, i) => ({
    month,
    value: values[i],
    applied: applied[i],
    ret: rets[i],
    acc: within(i) ? accRet[i] : null,
    cdi: within(i) && i >= startIdx ? (cdi.get(month) ?? null) : null,
    cdiAcc: cdiAcc[i],
    ibovAcc: ibovAcc[i],
    ipcaAcc: ipcaAcc[i],
  }))
  const last = points[points.length - 1]
  const withRet = points.filter((p) => p.ret != null)
  return {
    points,
    /** rentabilidade acumulada na janela e em % do CDI */
    accReturn: last.acc,
    cdiReturn: last.cdiAcc,
    pctOfCdi: last.acc != null && last.cdiAcc ? last.acc / last.cdiAcc : null,
    since: startIdx > 0 ? all[startIdx] : null,
    monthsAboveCdi: withRet.filter((p) => p.cdi != null && p.ret! > p.cdi).length,
    monthsWithCdi: withRet.filter((p) => p.cdi != null).length,
  }
}

/** Índices disponíveis (para dizer na tela quando o CDI/IPCA/IBOV ainda não foram buscados). */
export async function marketStatus() {
  const r = await db.execute<{ series: string; last: string }>(sql`select series, max(date)::text as last from market_series group by series`)
  return new Map(r.rows.map((x) => [x.series, x.last]))
}

export const classLabel = (c: AssetClass) => CLASS_INFO[c].label
