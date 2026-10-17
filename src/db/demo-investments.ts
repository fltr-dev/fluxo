import type { PgliteDatabase } from "drizzle-orm/pglite"
import { addDays, addMonths, monthEnd } from "@/lib/domain/dates"
import { positionFromTrades, type AssetClass, type TradeType } from "@/lib/domain/investments"
import * as s from "./schema"

// Carteira fictícia da demonstração: renda fixa na XP e no Itaú, ações/FIIs/BDRs na XP e cripto lançada à mão.
// Preços e saldos de cada mês saem de fórmulas fixas; só as datas acompanham o dia de hoje.

type Db = PgliteDatabase<typeof import("./schema")>

type Fixed = { kind: "fixed"; cls: AssetClass; name: string; broker: string; rate: string; monthly: number; due: number; buys: [number, number][] }
type Variable = { kind: "variable"; cls: AssetClass; code: string; name: string; broker: string; from: number; to: number; buys: [number, number][] }
type Asset = Fixed | Variable

// buys: [mês relativo ao atual (0 = este mês, −12 = um ano atrás), valor (renda fixa) ou quantidade (renda variável)]
const ASSETS: Asset[] = [
  { kind: "fixed", cls: "POS_FIXADO", name: "Tesouro Selic 2029", broker: "XP Investimentos", rate: "Selic + 0,05%", monthly: 0.0112, due: 30, buys: [[-18, 15000], [-8, 5000]] },
  { kind: "fixed", cls: "POS_FIXADO", name: "LCI Itaú 94% CDI", broker: "Itaú", rate: "94% CDI", monthly: 0.0099, due: 7, buys: [[-9, 15000]] },
  { kind: "fixed", cls: "PRE_FIXADO", name: "Tesouro Prefixado 2029", broker: "XP Investimentos", rate: "13,42% a.a.", monthly: 0.0106, due: 27, buys: [[-10, 12000]] },
  { kind: "fixed", cls: "PRE_FIXADO", name: "CDB C6 13,2% a.a.", broker: "XP Investimentos", rate: "13,2% a.a.", monthly: 0.0104, due: 16, buys: [[-7, 8000]] },
  { kind: "fixed", cls: "INFLACAO", name: "Tesouro IPCA+ 2035", broker: "XP Investimentos", rate: "IPCA + 7,12%", monthly: 0.0093, due: 103, buys: [[-6, 10000]] },
  { kind: "variable", cls: "ACOES", code: "ITSA4", name: "Itaúsa PN", broker: "XP Investimentos", from: 8.95, to: 10.84, buys: [[-11, 400], [-8, 300], [-4, 300], [-1, 100]] },
  { kind: "variable", cls: "ACOES", code: "BBAS3", name: "Banco do Brasil ON", broker: "XP Investimentos", from: 23.5, to: 27.95, buys: [[-10, 300]] },
  { kind: "variable", cls: "ACOES", code: "PETR4", name: "Petrobras PN", broker: "XP Investimentos", from: 30.2, to: 36.72, buys: [[-9, 200]] },
  { kind: "variable", cls: "ACOES", code: "WEGE3", name: "WEG ON", broker: "XP Investimentos", from: 40.1, to: 35.2, buys: [[-7, 150]] },
  { kind: "variable", cls: "FII", code: "MXRF11", name: "Maxi Renda", broker: "XP Investimentos", from: 9.7, to: 10.12, buys: [[-12, 1000], [-6, 500]] },
  { kind: "variable", cls: "FII", code: "HGLG11", name: "CSHG Logística", broker: "XP Investimentos", from: 156, to: 162.4, buys: [[-11, 40]] },
  { kind: "variable", cls: "FII", code: "KNRI11", name: "Kinea Renda Imobiliária", broker: "XP Investimentos", from: 141, to: 136.8, buys: [[-8, 30]] },
  { kind: "variable", cls: "BDR", code: "AAPL34", name: "Apple", broker: "XP Investimentos", from: 50, to: 61.85, buys: [[-9, 80]] },
  { kind: "variable", cls: "BDR", code: "NVDC34", name: "NVIDIA", broker: "XP Investimentos", from: 16, to: 29.1, buys: [[-6, 100]] },
  { kind: "variable", cls: "CRIPTO", code: "BTC", name: "Bitcoin", broker: "Binance", from: 300000, to: 352400, buys: [[-10, 0.0185]] },
  { kind: "variable", cls: "CRIPTO", code: "ETH", name: "Ethereum", broker: "Binance", from: 13800, to: 12150, buys: [[-5, 0.42]] },
]

// Proventos: [ticker, meses (relativos) em que paga, dia, valor por cota, tipo]; o mês +1 é anúncio, a receber
const INCOME: [string, number[], number, number, TradeType][] = [
  ["MXRF11", [-11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1], 15, 0.1, "YIELD"],
  ["HGLG11", [-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1], 14, 1.1, "YIELD"],
  ["KNRI11", [-7, -6, -5, -4, -3, -2, -1, 0], 10, 1, "YIELD"],
  ["ITSA4", [-10, -7, -4, -1, 0], 1, 0.0483, "JCP"],
  ["ITSA4", [-6], 2, 0.078, "DIVIDEND"],
  ["BBAS3", [-9, -6, -3, 1], 28, 0.1613, "JCP"],
  ["PETR4", [-8, -5, -2], 29, 0.385, "DIVIDEND"],
]

const round2 = (n: number) => Math.round(n * 100) / 100
// Preço no mês: reta do preço de um ano atrás até o de hoje com uma ondulação que zera nas pontas
const priceAt = (a: Variable, offset: number) => {
  if (offset <= -12) return a.from
  const t = (offset + 12) / 12
  return round2(a.from + (a.to - a.from) * t + Math.sin(t * Math.PI * 3) * (a.to + a.from) * 0.025)
}
const heldAt = (a: Asset, offset: number) => a.buys.filter(([m]) => m <= offset).reduce((sum, [, q]) => sum + q, 0)
const fixedValueAt = (a: Fixed, offset: number) => round2(a.buys.filter(([m]) => m <= offset).reduce((sum, [m, amount]) => sum + amount * (1 + a.monthly) ** (offset - m), 0))
const valueAt = (a: Asset, offset: number) => (a.kind === "fixed" ? fixedValueAt(a, offset) : round2(heldAt(a, offset) * priceAt(a, offset)))

export async function seedDemoInvestments(
  db: Db,
  ctx: { now: string; thisMonth: string; itauId: number; cdbAccountId: number; snapshots: { date: string; offset: number }[] },
) {
  const { now, thisMonth } = ctx
  const dateOf = (offset: number, day: number) => {
    const ym = addMonths(thisMonth, offset)
    const d = `${ym}-${String(Math.min(day, +monthEnd(ym).slice(8))).padStart(2, "0")}`
    return offset === 0 && d > now ? now : d
  }
  const [xp] = await db
    .insert(s.institutions)
    .values({ pluggyItemId: "00000000-0000-4000-8000-000000000003", name: "XP Investimentos", status: "UPDATED", lastSyncedAt: new Date() })
    .returning({ id: s.institutions.id })

  // O CDB que já existia na demonstração (conta "CDB 110% CDI" no Itaú) vira um ativo de pós-fixado
  const [cdb] = await db
    .insert(s.investments)
    .values({ accountId: ctx.cdbAccountId, pluggyId: "demo-cdb", assetClass: "POS_FIXADO", name: "CDB 110% CDI", broker: "Itaú", rateLabel: "110% CDI", dueDate: `${addMonths(thisMonth, 22)}-12`, invested: 24560, priceUpdatedAt: new Date() })
    .returning({ id: s.investments.id })
  // saldo da conta: 20 mil um ano atrás + R$ 620 por mês (R$ 380 de aporte + rendimento)
  await db.insert(s.investmentTrades).values([
    { investmentId: cdb.id, pluggyId: "demo-cdb-buy", date: `${addMonths(thisMonth, -12)}-03`, type: "BUY", amount: 20000 },
    ...Array.from({ length: 12 }, (_, i) => ({ investmentId: cdb.id, pluggyId: `demo-cdb-buy-${i}`, date: dateOf(i - 11, 6), type: "BUY" as const, amount: 380 })),
  ])

  const codes = new Map<string, { id: number; asset: Variable }>()
  let n = 0
  for (const a of ASSETS) {
    const manual = a.cls === "CRIPTO"
    const slug = (a.kind === "variable" ? a.code : a.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const [acc] = await db
      .insert(s.accounts)
      .values({
        name: a.name,
        type: "SAVINGS_INVESTMENT",
        source: manual ? "MANUAL" : "PLUGGY",
        institutionId: manual ? null : a.broker === "Itaú" ? ctx.itauId : xp.id,
        pluggyId: manual ? null : `inv:demo-${slug}`,
        balance: valueAt(a, 0),
        transactionsSyncedAt: new Date(),
      })
      .returning({ id: s.accounts.id })

    const trades = a.buys.map(([m, q]) => {
      const date = dateOf(m, 5 + (n++ % 20))
      if (a.kind === "fixed") return { date, type: "BUY" as const, quantity: null, price: null, amount: q, fees: 0 }
      const price = priceAt(a, m)
      return { date, type: "BUY" as const, quantity: q, price, amount: round2(q * price), fees: 0 }
    })
    const pos = positionFromTrades(trades)
    const [inv] = await db
      .insert(s.investments)
      .values({
        accountId: acc.id,
        pluggyId: manual ? null : `demo-${slug}`,
        assetClass: a.cls,
        code: a.kind === "variable" ? a.code : null,
        name: a.name,
        broker: a.broker,
        quantity: a.kind === "variable" ? pos.quantity : null,
        unitPrice: a.kind === "variable" ? a.to : null,
        invested: pos.invested,
        rateLabel: a.kind === "fixed" ? a.rate : null,
        dueDate: a.kind === "fixed" ? `${addMonths(thisMonth, a.due)}-15` : null,
        priceUpdatedAt: new Date(Date.now() - 2 * 3600_000),
      })
      .returning({ id: s.investments.id })
    await db.insert(s.investmentTrades).values(trades.map((t, i) => ({ ...t, investmentId: inv.id, pluggyId: manual ? null : `demo-${slug}-${i}` })))
    if (!manual) await db.insert(s.investmentMovements).values(trades.map((t, i) => ({ accountId: acc.id, pluggyId: `demo-mov-${slug}-${i}`, date: t.date, amount: t.amount })))
    await db.insert(s.balanceSnapshots).values(ctx.snapshots.map((x) => ({ accountId: acc.id, date: x.date, balance: valueAt(a, x.offset) })).filter((x) => x.balance > 0))
    if (a.kind === "variable") codes.set(a.code, { id: inv.id, asset: a })
  }

  // Proventos (os da conta da corretora entram sozinhos na sync real; aqui vão direto)
  const income = INCOME.flatMap(([code, offsets, day, unit, type]) => {
    const c = codes.get(code)!
    return offsets.flatMap((m) => {
      const held = heldAt(c.asset, Math.min(m, 0))
      if (!held) return []
      const ym = addMonths(thisMonth, m)
      const date = `${ym}-${String(Math.min(day, +monthEnd(ym).slice(8))).padStart(2, "0")}`
      return [{ investmentId: c.id, pluggyId: `demo-inc-${code}-${type}-${m}`, date, type, quantity: held, amount: round2(held * unit) }]
    })
  })
  await db.insert(s.investmentTrades).values(income)

  await db.insert(s.investmentTargets).values([
    { assetClass: "POS_FIXADO", percent: 35 },
    { assetClass: "ACOES", percent: 20 },
    { assetClass: "FII", percent: 15 },
    { assetClass: "PRE_FIXADO", percent: 10 },
    { assetClass: "INFLACAO", percent: 10 },
    { assetClass: "CRIPTO", percent: 5 },
    { assetClass: "BDR", percent: 5 },
  ])

  // Índices: CDI diário (dias úteis), IPCA mensal e IBOV no fim de cada mês, desde 13 meses atrás
  const cdi: { series: string; date: string; value: number }[] = []
  for (let d = `${addMonths(thisMonth, -13)}-01`; d <= now; d = addDays(d, 1)) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay()
    if (wd !== 0 && wd !== 6) cdi.push({ series: "CDI", date: d, value: 0.0545 })
  }
  const IPCA = [0.39, 0.52, 0.48, 0.16, 0.56, 0.43, 0.38, 0.26, 0.24, 0.29, 0.31, 0.44, 0.36]
  const IBOV = [128900, 131500, 134200, 131300, 127800, 130600, 133400, 131500, 135800, 133900, 137200, 141600, 140900, 141200]
  await db.insert(s.marketSeries).values([
    ...cdi,
    ...IPCA.map((value, i) => ({ series: "IPCA", date: `${addMonths(thisMonth, i - 13)}-01`, value })),
    ...IBOV.map((value, i) => ({ series: "IBOV", date: `${addMonths(thisMonth, i - 13)}-01`, value })),
  ])
}
