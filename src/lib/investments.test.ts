import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, describe, expect, it, vi } from "vitest"
import * as schema from "@/db/schema"
import { addDays, addMonths, monthEnd, monthOf, today } from "./domain/dates"

// Postgres real em memória com as migrations do projeto: sincronização (Pluggy simulada), consultas e ações da
// tela de Investimentos rodando de ponta a ponta. Sem rede: Pluggy e cotações são substituídas.
const pg = new PGlite()
const testDb = drizzle(pg, { schema, casing: "snake_case" })
vi.mock("server-only", () => ({}))
vi.mock("@/db", () => ({ ...schema, db: testDb }))
vi.mock("@/auth", () => ({ requireUser: async () => ({ role: "owner" }) }))
vi.mock("next/cache", () => ({ refresh: () => {} }))
vi.mock("next/navigation", () => ({ redirect: () => {} }))
vi.mock("./market", async (orig) => ({ ...(await orig<typeof import("./market")>()), updateMarketSeries: async () => [], refreshManualQuotes: async () => ({ updated: 0, failed: [] }) }))

const now = today()
const ym = monthOf(now)
const d = (monthsAgo: number, day = 10) => `${addMonths(ym, -monthsAgo)}-${String(day).padStart(2, "0")}`

vi.mock("./pluggy", () => ({
  pluggyClient: async () => ({
    item: async () => ({ id: "item-1", status: "UPDATED", connector: { name: "XP Investimentos" } }),
    accounts: async () => [{ id: "acc-xp", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Conta XP", balance: 100 }],
    investments: async () => [
      { id: "inv-itsa", name: "ITAUSA PN", code: "ITSA4", type: "EQUITY", subtype: "STOCK", balance: 1084, quantity: 100, value: 10.84, amountOriginal: 900 },
      { id: "inv-cdb", name: "CDB Banco X", type: "FIXED_INCOME", subtype: "CDB", rateType: "CDI", rate: 110, balance: 5300, amountOriginal: 5000, purchaseDate: `${d(6)}T00:00:00.000Z`, dueDate: "2028-08-12T00:00:00.000Z" },
    ],
    investmentTransactions: async (id: string) =>
      id === "inv-itsa"
        ? [
            { id: "t1", type: "BUY", movementType: "CREDIT", quantity: 60, value: 9, amount: 540, date: `${d(5)}T00:00:00.000Z` },
            { id: "t2", type: "BUY", movementType: "CREDIT", quantity: 40, value: 9, amount: 360, date: `${d(3)}T00:00:00.000Z` },
            { id: "t3", type: "TAX", movementType: "DEBIT", amount: 1, date: `${d(3)}T00:00:00.000Z` },
          ]
        : [],
    transactions: async () => [
      { id: "c1", description: "DIVIDENDOS ITSA4", amount: 12.5, type: "CREDIT", date: `${d(1)}T12:00:00.000Z` },
      { id: "c2", description: "PIX RECEBIDO", amount: 50, type: "CREDIT", date: `${d(1)}T12:00:00.000Z` },
    ],
  }),
}))

const { runSync } = await import("./sync")
const inv = await import("./investments")
const actions = await import("@/app/(app)/investimentos/actions")

const form = (o: Record<string, string | number>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, String(v))
  return f
}

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" })
  await testDb.insert(schema.institutions).values({ pluggyItemId: "00000000-0000-4000-8000-000000000009", name: "XP" })
})

describe("sincronização da Pluggy", () => {
  it("cria os ativos com categoria, taxa, operações e proventos achados na conta", async () => {
    expect((await runSync("MANUAL")).status).toBe("OK")
    const list = await inv.listHoldings()
    const itsa = list.find((h) => h.code === "ITSA4")!
    const cdb = list.find((h) => h.name === "CDB Banco X")!
    expect(itsa).toMatchObject({ assetClass: "ACOES", quantity: 100, unitPrice: 10.84, invested: 900, value: 1084, broker: "XP Investimentos", manual: false })
    expect(itsa.avgPrice).toBe(9)
    expect(itsa.profitPct).toBeCloseTo(184 / 900)
    expect(cdb).toMatchObject({ assetClass: "POS_FIXADO", rateLabel: "110% CDI", dueDate: "2028-08-12", invested: 5000 })

    const trades = await inv.listTrades({ investmentId: itsa.id })
    expect(trades.map((t) => t.type).sort()).toEqual(["BUY", "BUY", "DIVIDEND"]) // imposto fica de fora
    expect(trades.find((t) => t.type === "DIVIDEND")).toMatchObject({ amount: 12.5, pluggyId: expect.stringMatching(/^tx:/) })
    // sem movimentações, a compra do CDB vira uma compra única
    expect(await inv.listTrades({ investmentId: cdb.id })).toMatchObject([{ type: "BUY", amount: 5000, pluggyId: "purchase:inv-cdb" }])
  })

  it("sincronizar de novo não duplica nada e mantém a categoria escolhida pelo usuário", async () => {
    const itsa = (await inv.listHoldings()).find((h) => h.code === "ITSA4")!
    await actions.updateInvestment(form({ id: itsa.id, name: "Itaúsa", assetClass: "ETF" }))
    await runSync("MANUAL")
    const again = (await inv.listHoldings()).find((h) => h.code === "ITSA4")!
    expect(again).toMatchObject({ name: "Itaúsa", assetClass: "ETF", autoClass: "ACOES" })
    expect(await inv.listTrades({ investmentId: itsa.id })).toHaveLength(3)
    await actions.updateInvestment(form({ id: itsa.id, name: "Itaúsa", assetClass: "ACOES" }))
    expect((await inv.listHoldings()).find((h) => h.code === "ITSA4")!.override).toBeNull()
  })
})

describe("ativos manuais", () => {
  it("cria cripto com a primeira compra e recalcula a posição a cada operação", async () => {
    await actions.createInvestment(form({ name: "Bitcoin", code: "btc", assetClass: "CRIPTO", broker: "Binance", date: d(2), quantity: "0.01", price: 300000, fees: 5 }))
    let btc = (await inv.listHoldings()).find((h) => h.code === "BTC")!
    expect(btc).toMatchObject({ manual: true, assetClass: "CRIPTO", quantity: 0.01, invested: 3005, value: 3000 })

    await actions.addTrade(form({ investmentId: btc.id, type: "BUY", date: d(1), quantity: "0.01", price: 320000 }))
    await actions.addTrade(form({ investmentId: btc.id, type: "SELL", date: now, quantity: "0.005", price: 350000 }))
    btc = (await inv.listHoldings()).find((h) => h.code === "BTC")!
    expect(btc.quantity).toBeCloseTo(0.015)
    expect(btc.invested).toBe(4653.75) // 6205 − 0,005 × 310.250
    expect(btc.value).toBe(0.015 * 300000) // cotação = preço informado ao criar, até a sync buscar outra

    // cotação manual
    await actions.updateInvestment(form({ id: btc.id, name: "Bitcoin", code: "BTC", assetClass: "CRIPTO", unitPrice: 340000 }))
    expect((await inv.listHoldings()).find((h) => h.code === "BTC")!.value).toBe(5100)

    // conta do ativo não é recalculada como conta manual comum
    const { refreshManualBalances } = await import("./ledger")
    await refreshManualBalances()
    expect((await inv.listHoldings()).find((h) => h.code === "BTC")!.value).toBe(5100)
  })

  it("renda fixa manual: saldo informado à mão", async () => {
    await actions.createInvestment(form({ name: "LCI Banco Y", assetClass: "POS_FIXADO", date: d(4), amount: 2000, rateLabel: "95% CDI" }))
    const lci = (await inv.listHoldings()).find((h) => h.name === "LCI Banco Y")!
    expect(lci).toMatchObject({ value: 2000, invested: 2000, quantity: null })
    await actions.updateInvestment(form({ id: lci.id, name: "LCI Banco Y", assetClass: "POS_FIXADO", currentValue: 2100 }))
    expect((await inv.listHoldings()).find((h) => h.id === lci.id)).toMatchObject({ value: 2100, profit: 100 })
  })

  it("ativo da Pluggy aceita só proventos; lançamento manual pode ser apagado", async () => {
    const itsa = (await inv.listHoldings()).find((h) => h.code === "ITSA4")!
    await expect(actions.addTrade(form({ investmentId: itsa.id, type: "BUY", date: now, quantity: 1, price: 10 }))).rejects.toThrow(/proventos/)
    await actions.addTrade(form({ investmentId: itsa.id, type: "JCP", date: addDays(now, 20), amount: 8 }))
    const jcp = (await inv.listTrades({ investmentId: itsa.id })).find((t) => t.type === "JCP")!
    const income = await inv.incomeOverview()
    expect(income.upcoming.map((u) => u.id)).toContain(jcp.id)
    expect(income.total).toBe(12.5)
    await actions.deleteTrade(form({ id: jcp.id }))
    expect((await inv.listTrades({ investmentId: itsa.id })).some((t) => t.type === "JCP")).toBe(false)
  })
})

describe("alocação-alvo", () => {
  it("exige soma 100 e calcula quanto aportar", async () => {
    await expect(actions.saveTargets(form({ t_POS_FIXADO: 50, t_ACOES: 30 }))).rejects.toThrow(/100%/)
    await actions.saveTargets(form({ t_POS_FIXADO: 50, t_ACOES: 30, t_CRIPTO: 20 }))
    const s = await inv.portfolioSummary()
    const sum = s.allocation.reduce((a, b) => a + b.pct, 0)
    expect(sum).toBeCloseTo(1)
    const acoes = s.allocation.find((a) => a.assetClass === "ACOES")!
    expect(acoes.target).toBe(0.3)
    expect(acoes.need).toBeCloseTo(0.3 * s.total - acoes.value)
    await actions.saveTargets(form({}))
    expect((await inv.portfolioSummary()).hasTargets).toBe(false)
  })
})

describe("histórico e rentabilidade", () => {
  it("Dietz modificado com aporte no meio e índices acumulados na mesma janela", async () => {
    // carteira isolada: um CDB que vale 1000 no fim de m-2, 1010 em m-1 e recebe 500 de aporte em m-1 (fecha em 1515)
    const [acc] = await testDb.insert(schema.accounts).values({ name: "CDB teste", type: "SAVINGS_INVESTMENT", source: "MANUAL", balance: 1530 }).returning()
    const [i] = await testDb.insert(schema.investments).values({ accountId: acc.id, assetClass: "POS_FIXADO", name: "CDB teste", invested: 1500 }).returning()
    await testDb.insert(schema.investmentTrades).values([
      { investmentId: i.id, date: d(3, 5), type: "BUY", amount: 1000 },
      { investmentId: i.id, date: d(1, 15), type: "BUY", amount: 500 },
    ])
    await testDb.insert(schema.balanceSnapshots).values([
      { accountId: acc.id, date: monthEnd(addMonths(ym, -2)), balance: 1010 },
      { accountId: acc.id, date: monthEnd(addMonths(ym, -1)), balance: 1525 },
    ])
    await testDb.insert(schema.marketSeries).values([
      { series: "CDI", date: d(1, 2), value: 0.5 },
      { series: "CDI", date: d(1, 3), value: 0.5 },
      { series: "CDI", date: `${ym}-01`, value: 1 },
    ])
    const months = [addMonths(ym, -1), ym]
    const h = await inv.portfolioHistory(months, i.id)
    const [base, prev, cur] = h.points
    expect(base).toMatchObject({ month: addMonths(ym, -2), value: 1010, applied: 1000 })
    expect(prev).toMatchObject({ value: 1525, applied: 1500 })
    expect(prev.ret).toBeCloseTo((1525 - 1010 - 500) / (1010 + 250), 10)
    expect(cur.ret).toBeCloseTo(5 / 1525, 10)
    expect(cur.acc).toBeCloseTo((1 + prev.ret!) * (1 + cur.ret!) - 1, 10)
    expect(prev.cdiAcc).toBeCloseTo(1.005 ** 2 - 1, 10)
    expect(cur.cdiAcc).toBeCloseTo(1.005 ** 2 * 1.01 - 1, 10)
    expect(h.pctOfCdi).toBeCloseTo(cur.acc! / cur.cdiAcc!, 10)
    await testDb.delete(schema.accounts).where(eq(schema.accounts.id, acc.id))
  })
})
