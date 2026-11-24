// npm run backfill [-- --dry]
// Reconstrói o saldo de fim de mês dos investimentos antes do 1º saldo real e grava em balance_snapshots com
// estimated = true (apaga e regrava só esses; saldos reais nunca são tocados). Rodar de novo quando entrar ativo novo
// ou operação antiga. Fontes grátis: Yahoo (renda variável), CVM inf_diario (fundos, por CNPJ), CDI do banco (renda fixa).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { inflateRawSync } from "node:zlib"
import { and, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as s from "../src/db/schema"
import { accrualBack, dailyFactors, type Flow, lastAtOrBefore, parseRate, unitsBack, type UnitFlow } from "../src/lib/domain/backfill"
import { addDays, addMonths, monthEnd, monthOf, monthsInRange, toLocalDate, today } from "../src/lib/domain/dates"
import { isVariable, yahooSymbol } from "../src/lib/domain/investments"

type Point = { date: string; value: number }
const dry = process.argv.includes("--dry")
process.loadEnvFile(".env.local")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool, { schema: s, casing: "snake_case" })

const UA = { "user-agent": "Mozilla/5.0 (fluxo)" }

async function yahooDaily(symbol: string, from: string): Promise<Point[]> {
  const p1 = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000)
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`, { headers: UA })
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`)
  const r = (await res.json()).chart?.result?.[0]
  const ts: number[] = r?.timestamp ?? []
  const close: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? []
  return ts.flatMap((t, i) => (close[i] ? [{ date: toLocalDate(new Date(t * 1000)), value: close[i]! }] : []))
}

/** Único arquivo de um .zip (os da CVM têm um CSV só): diretório central → cabeçalho local → deflate. */
function unzipSingle(buf: Buffer) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const cd = buf.readUInt32LE(eocd + 16)
  const size = buf.readUInt32LE(cd + 20)
  const local = buf.readUInt32LE(cd + 42)
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
  const data = buf.subarray(start, start + size)
  return (buf.readUInt16LE(cd + 10) === 8 ? inflateRawSync(data) : data).toString("latin1")
}

/** Cota diária dos fundos (CNPJ → série) nos meses pedidos. Meses fechados ficam em cache no tmp; os 2 últimos sempre baixam de novo. */
async function cvmQuotas(cnpjs: Set<string>, months: string[]) {
  const dir = path.join(tmpdir(), "fluxo-cvm")
  mkdirSync(dir, { recursive: true })
  const out = new Map<string, Point[]>([...cnpjs].map((c) => [c, []]))
  const fresh = addMonths(monthOf(today()), -1)
  for (const m of months) {
    const name = `inf_diario_fi_${m.replace("-", "")}.zip`
    const file = path.join(dir, name)
    if (!existsSync(file) || m >= fresh) {
      process.stdout.write(`CVM ${m}… `)
      const res = await fetch(`https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/${name}`, { headers: UA })
      if (!res.ok) throw new Error(`CVM ${name}: HTTP ${res.status}`)
      writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    }
    // TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;…  (subclasse: fica a primeira do dia)
    const seen = new Set<string>()
    for (const line of unzipSingle(readFileSync(file)).split("\n")) {
      const [, cnpj, , date, , quota] = line.split(";")
      if (!out.has(cnpj) || seen.has(cnpj + date)) continue
      seen.add(cnpj + date)
      out.get(cnpj)!.push({ date, value: Number(quota) })
    }
  }
  process.stdout.write("\n")
  for (const v of out.values()) v.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

async function main() {
  const assets = await db
    .select({
      id: s.investments.id,
      accountId: s.investments.accountId,
      name: s.investments.name,
      code: s.investments.code,
      cls: s.investments.assetClass,
      override: s.investments.assetClassOverride,
      rateLabel: s.investments.rateLabel,
      balance: s.accounts.balance,
    })
    .from(s.investments)
    .innerJoin(s.accounts, eq(s.accounts.id, s.investments.accountId))
    .where(eq(s.accounts.archived, false))
  const accountIds = assets.map((a) => a.accountId)
  if (!accountIds.length) return console.log("Nenhum investimento.")

  const [reals, trades, moves, cdi] = await Promise.all([
    db
      .selectDistinctOn([s.balanceSnapshots.accountId], { accountId: s.balanceSnapshots.accountId, date: s.balanceSnapshots.date, value: s.balanceSnapshots.balance })
      .from(s.balanceSnapshots)
      .where(and(inArray(s.balanceSnapshots.accountId, accountIds), eq(s.balanceSnapshots.estimated, false)))
      .orderBy(s.balanceSnapshots.accountId, s.balanceSnapshots.date),
    db.select().from(s.investmentTrades).where(inArray(s.investmentTrades.investmentId, assets.map((a) => a.id))),
    db.select().from(s.investmentMovements).where(inArray(s.investmentMovements.accountId, accountIds)),
    db.select({ date: s.marketSeries.date, value: s.marketSeries.value }).from(s.marketSeries).where(eq(s.marketSeries.series, "CDI")),
  ])
  const realOf = new Map(reals.map((r) => [r.accountId, r]))
  const earliest = [...trades, ...moves].map((t) => t.date).sort()[0]
  if (!earliest) return console.log("Sem operações nem movimentações: nada para reconstruir.")
  // um fim de mês antes da 1ª operação, para o gráfico ter o ponto de partida
  const months = monthsInRange(`${addMonths(monthOf(earliest), -1)}-01`, today())
  const allEnds = months.map(monthEnd)

  const funds = new Set(assets.filter((a) => (a.override ?? a.cls) === "FUNDOS" && a.code && /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(a.code)).map((a) => a.code!))
  const quotas = funds.size ? await cvmQuotas(funds, months) : new Map<string, Point[]>()

  const rows: (typeof s.balanceSnapshots.$inferInsert)[] = []
  const report: Record<string, string | number>[] = []
  for (const a of assets) {
    const cls = a.override ?? a.cls
    const r = realOf.get(a.accountId)
    const real = r ? { date: r.date, value: r.value } : { date: today(), value: a.balance }
    const ends = allEnds.filter((e) => e < real.date)
    const own = trades.filter((t) => t.investmentId === a.id)
    const ownMoves = moves.filter((m) => m.accountId === a.accountId)
    // aplicações/resgates em reais: movimentações da Pluggy, ou as operações (ativos manuais)
    const flows: Flow[] = ownMoves.length
      ? ownMoves.map((m) => ({ date: m.date, amount: m.amount }))
      : own.flatMap((t) => (t.type === "BUY" ? [{ date: t.date, amount: t.amount + t.fees }] : t.type === "SELL" ? [{ date: t.date, amount: -(t.amount - t.fees) }] : []))

    let method: string
    let values: (number | null)[]
    try {
      if (isVariable(cls) && a.code) {
        method = "Yahoo"
        const prices = await yahooDaily(yahooSymbol(a.code, cls), addDays(allEnds[0], -10))
        const units: UnitFlow[] = own.flatMap((t) => {
          const q = t.quantity ?? (t.price ? t.amount / t.price : null)
          if (!q || !(t.type === "BUY" || t.type === "BONUS" || t.type === "SELL")) return []
          return [{ date: t.date, quantity: t.type === "SELL" ? -q : q }]
        })
        // ponytail: preço do Yahoo já vem ajustado por desdobramento; perto de um, a quantidade antiga das operações erra o mês
        values = unitsBack(real, units, (d) => lastAtOrBefore(prices, d), ends)
      } else if (a.code && quotas.get(a.code)?.length) {
        method = "CVM"
        const q = quotas.get(a.code)!
        const price = (d: string) => lastAtOrBefore(q, d)
        const units = flows.flatMap((f) => {
          const p = price(f.date)
          return p ? [{ date: f.date, quantity: f.amount / p }] : []
        })
        values = unitsBack(real, units, price, ends)
      } else {
        const rate = parseRate(a.rateLabel)
        method = rate.kind === "PRE" ? `pré ${a.rateLabel}` : `${Math.round(rate.pct * 100)}% CDI`
        values = accrualBack(real, flows, dailyFactors(cdi, rate), ends)
      }
    } catch (e) {
      report.push({ ativo: a.name.slice(0, 32), classe: cls, fonte: `ERRO: ${(e as Error).message}` })
      continue
    }
    ends.forEach((date, i) => {
      if (values[i] != null) rows.push({ accountId: a.accountId, date, balance: values[i]!, estimated: true })
    })
    const firstIdx = values.findIndex((v) => v != null)
    if (firstIdx >= 0 || real.value > 0)
      report.push({
        ativo: a.name.slice(0, 32),
        classe: cls,
        fonte: method,
        primeiro: firstIdx >= 0 ? `${values[firstIdx]} em ${ends[firstIdx]}` : "—",
        ultimo: values.at(-1) != null ? `${values.at(-1)} em ${ends.at(-1)}` : "—",
        real: `${real.value} em ${real.date}`,
      })
  }
  console.table(report)
  console.log(`${rows.length} saldos estimados${dry ? " (--dry: nada gravado)" : ""}`)
  if (dry) return

  await db.transaction(async (tx) => {
    await tx.delete(s.balanceSnapshots).where(and(inArray(s.balanceSnapshots.accountId, accountIds), eq(s.balanceSnapshots.estimated, true)))
    for (let i = 0; i < rows.length; i += 500) await tx.insert(s.balanceSnapshots).values(rows.slice(i, i + 500)).onConflictDoNothing()
  })
  console.log("Gravado.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
