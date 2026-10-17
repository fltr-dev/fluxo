import "server-only"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { accounts, db, investments, investmentTrades, marketSeries } from "@/db"
import { addDays, addMonths, monthOf, today } from "./domain/dates"
import { isVariable, positionFromTrades, type AssetClass } from "./domain/investments"

// Dados de mercado públicos e sem chave: CDI e IPCA do Banco Central (SGS) e IBOV e cotações do Yahoo Finance.
// Tudo opcional: falha de rede mantém o que já está no banco e nunca derruba a sincronização.

const TIMEOUT = 8_000
const json = async <T>(url: string) => {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT), headers: { "user-agent": "Mozilla/5.0 (fluxo)", accept: "application/json" } })
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`)
  return (await res.json()) as T
}

const brDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const isoFromBr = (d: string) => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`

/** Série do SGS do Banco Central (12 = CDI diário em % a.d.; 433 = IPCA mensal em %). */
async function sgs(code: number, from: string, to: string) {
  const rows = await json<{ data: string; valor: string }[]>(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${brDate(from)}&dataFinal=${brDate(to)}`,
  )
  return rows.map((r) => ({ date: isoFromBr(r.data), value: Number(r.valor) })).filter((r) => Number.isFinite(r.value))
}

type YahooChart = {
  chart: {
    result?: { meta?: { regularMarketPrice?: number }; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[]
  }
}
async function yahoo(symbol: string, range: string, interval: string) {
  const r = await json<YahooChart>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`)
  return r.chart.result?.[0]
}

async function lastDate(series: string) {
  const [r] = await db.select({ date: marketSeries.date }).from(marketSeries).where(eq(marketSeries.series, series)).orderBy(desc(marketSeries.date)).limit(1)
  return r?.date
}

async function upsert(series: string, rows: { date: string; value: number }[]) {
  for (let i = 0; i < rows.length; i += 500)
    await db
      .insert(marketSeries)
      .values(rows.slice(i, i + 500).map((r) => ({ series, ...r })))
      .onConflictDoUpdate({ target: [marketSeries.series, marketSeries.date], set: { value: sql`excluded.value` } })
}

// Histórico buscado na primeira vez (o SGS limita séries diárias a 10 anos por consulta)
const HISTORY_YEARS = 5

/** Atualiza CDI, IPCA e IBOV desde o último dado salvo. Cada série falha sozinha. */
export async function updateMarketSeries() {
  const now = today()
  const start = `${+now.slice(0, 4) - HISTORY_YEARS}-01-01`
  const errors: string[] = []
  const run = async (name: string, fn: () => Promise<void>) => fn().catch((e: Error) => void errors.push(`${name}: ${e.message}`))
  await Promise.all([
    run("CDI", async () => {
      const last = await lastDate("CDI")
      await upsert("CDI", await sgs(12, last ? addDays(last, 1) : start, now))
    }),
    run("IPCA", async () => {
      const last = await lastDate("IPCA")
      // IPCA sai no mês seguinte e pode ser revisto: busca de novo os últimos 3 meses
      const from = last ? `${addMonths(monthOf(last), -3)}-01` : start
      await upsert("IPCA", await sgs(433, from, now))
    }),
    run("IBOV", async () => {
      const r = await yahoo("^BVSP", `${HISTORY_YEARS}y`, "1mo")
      const closes = r?.indicators?.quote?.[0]?.close ?? []
      // um ponto por mês, no dia 1; o mês corrente leva a última cotação
      const rows = (r?.timestamp ?? []).flatMap((ts, i) => {
        const v = closes[i]
        return v ? [{ date: `${new Date(ts * 1000).toISOString().slice(0, 7)}-01`, value: v }] : []
      })
      if (r?.meta?.regularMarketPrice) rows.push({ date: `${monthOf(now)}-01`, value: r.meta.regularMarketPrice })
      await upsert("IBOV", rows)
    }),
  ])
  return errors
}

/** Símbolo no Yahoo: ativos da B3 levam ".SA"; cripto vira par com o real ("BTC-BRL"). */
export const yahooSymbol = (code: string, assetClass: AssetClass) => (assetClass === "CRIPTO" ? `${code.toUpperCase()}-BRL` : `${code.toUpperCase()}.SA`)

/**
 * Cotação dos ativos manuais de renda variável e saldo recalculado (quantidade × cotação). Os da Pluggy já vêm
 * com o saldo da corretora. Devolve quantos foram atualizados e os que falharam.
 */
export async function refreshManualQuotes() {
  const rows = await db
    .select({ id: investments.id, accountId: investments.accountId, code: investments.code, cls: investments.assetClass, override: investments.assetClassOverride })
    .from(investments)
    .innerJoin(accounts, eq(accounts.id, investments.accountId))
    .where(and(isNull(investments.pluggyId), eq(accounts.archived, false)))
  let updated = 0
  const failed: string[] = []
  for (const r of rows) {
    const cls = r.override ?? r.cls
    if (!r.code || !isVariable(cls)) continue
    try {
      const price = (await yahoo(yahooSymbol(r.code, cls), "1d", "1d"))?.meta?.regularMarketPrice
      if (!price) throw new Error("sem cotação")
      await db.update(investments).set({ unitPrice: price, priceUpdatedAt: new Date() }).where(eq(investments.id, r.id))
      await refreshManualPosition(r.id)
      updated++
    } catch {
      failed.push(r.code)
    }
  }
  return { updated, failed }
}

/**
 * Recalcula a posição de um ativo manual pelas operações (quantidade e custo) e o saldo da conta dele:
 * renda variável = quantidade × cotação (ou o preço da última compra, enquanto não há cotação);
 * renda fixa mantém o saldo informado, ou o valor aplicado quando ainda não foi informado.
 */
export async function refreshManualPosition(investmentId: number) {
  const [inv] = await db.select().from(investments).where(eq(investments.id, investmentId))
  if (!inv || inv.pluggyId) return
  const trades = await db.select().from(investmentTrades).where(eq(investmentTrades.investmentId, investmentId))
  const pos = positionFromTrades(trades)
  const cls = inv.assetClassOverride ?? inv.assetClass
  const lastPrice = trades.filter((t) => t.type === "BUY" && t.price).sort((a, b) => b.date.localeCompare(a.date))[0]?.price ?? null
  const price = inv.unitPrice ?? lastPrice
  await db.update(investments).set({ quantity: isVariable(cls) ? pos.quantity : null, invested: pos.invested }).where(eq(investments.id, investmentId))
  if (isVariable(cls)) {
    await db.update(accounts).set({ balance: Math.round(pos.quantity * (price ?? 0) * 100) / 100 }).where(eq(accounts.id, inv.accountId))
  } else if (!inv.priceUpdatedAt) {
    await db.update(accounts).set({ balance: pos.invested }).where(eq(accounts.id, inv.accountId))
  }
}
