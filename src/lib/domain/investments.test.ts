import { describe, expect, it } from "vitest"
import {
  accumulate,
  cdiByMonth,
  classFromCode,
  classifyPluggy,
  detectIncomeFromTransactions,
  incomeTypeOf,
  indexReturnsByMonth,
  monthlyReturns,
  positionFromTrades,
  rateLabelOf,
  rebalance,
  tradeFromPluggy,
  type Trade,
} from "./investments"

describe("categoria do ativo", () => {
  it("pelo ticker da B3", () => {
    expect(classFromCode("MXRF11")).toBe("FII")
    expect(classFromCode("aapl34")).toBe("BDR")
    expect(classFromCode("ITSA4")).toBe("ACOES")
    expect(classFromCode("PETR4F")).toBe("ACOES")
    expect(classFromCode("BTC")).toBeNull()
  })

  it("pelo tipo e indexador da Pluggy", () => {
    expect(classifyPluggy({ name: "MXRF11", type: "EQUITY", subtype: "REAL_ESTATE_FUND" })).toBe("FII")
    expect(classifyPluggy({ name: "AAPL34", type: "EQUITY", subtype: "BDR" })).toBe("BDR")
    expect(classifyPluggy({ name: "BOVA11", type: "ETF" })).toBe("ETF")
    expect(classifyPluggy({ name: "ITSA4", type: "EQUITY", subtype: "STOCK", code: "ITSA4" })).toBe("ACOES")
    expect(classifyPluggy({ name: "CDB Banco Inter", type: "FIXED_INCOME", subtype: "CDB", rateType: "CDI", rate: 110 })).toBe("POS_FIXADO")
    expect(classifyPluggy({ name: "Tesouro IPCA+ 2035", type: "FIXED_INCOME", subtype: "TREASURY" })).toBe("INFLACAO")
    expect(classifyPluggy({ name: "Tesouro Selic 2029", type: "FIXED_INCOME", subtype: "TREASURY" })).toBe("POS_FIXADO")
    expect(classifyPluggy({ name: "Tesouro Prefixado 2029", type: "FIXED_INCOME", subtype: "TREASURY" })).toBe("PRE_FIXADO")
    expect(classifyPluggy({ name: "CDB C6", type: "FIXED_INCOME", fixedAnnualRate: 13.2 })).toBe("PRE_FIXADO")
    expect(classifyPluggy({ name: "Fundo XP Macro", type: "MUTUAL_FUND", subtype: "MULTIMARKET_FUND" })).toBe("FUNDOS")
    expect(classifyPluggy({ name: "PGBL", type: "SECURITY", subtype: "RETIREMENT" })).toBe("OUTROS")
  })

  it("rótulo da taxa", () => {
    expect(rateLabelOf({ name: "", rateType: "CDI", rate: 110 })).toBe("110% CDI")
    expect(rateLabelOf({ name: "", rateType: "IPCA", fixedAnnualRate: 6.5 })).toBe("IPCA + 6,5%")
    expect(rateLabelOf({ name: "", rateType: "SELIC", fixedAnnualRate: 0.05 })).toBe("Selic + 0,05%")
    expect(rateLabelOf({ name: "", fixedAnnualRate: 13.2 })).toBe("13,2% a.a.")
    expect(rateLabelOf({ name: "" })).toBeNull()
  })
})

describe("operações e proventos", () => {
  it("converte movimentações da Pluggy e ignora impostos", () => {
    expect(tradeFromPluggy({ id: "1", type: "BUY", quantity: 100, value: 10, amount: -1000, date: "2026-01-02" })).toEqual({ type: "BUY", quantity: 100, price: 10, amount: 1000 })
    expect(tradeFromPluggy({ id: "2", movementType: "DEBIT", amount: 500, date: "2026-01-02" })?.type).toBe("SELL")
    expect(tradeFromPluggy({ id: "3", movementType: "CREDIT", description: "Rendimento", amount: 15, date: "2026-01-02" })?.type).toBe("YIELD")
    expect(tradeFromPluggy({ id: "4", type: "TAX", amount: 3, date: "2026-01-02" })).toBeNull()
  })

  it("tipo de provento pela descrição", () => {
    expect(incomeTypeOf("JUROS S/CAPITAL BBAS3")).toBe("JCP")
    expect(incomeTypeOf("Dividendos ITSA4")).toBe("DIVIDEND")
    expect(incomeTypeOf("RENDIMENTO MXRF11")).toBe("YIELD")
    expect(incomeTypeOf("PIX RECEBIDO")).toBeNull()
  })

  it("encontra proventos nos créditos da conta da corretora", () => {
    const codes = new Map([["MXRF11", 7], ["ITSA4", 9]])
    const found = detectIncomeFromTransactions(
      [
        { id: 1, date: "2026-10-15", amount: 150, description: "RENDIMENTO MXRF11" },
        { id: 2, date: "2026-10-01", amount: 58, description: "JUROS S/CAPITAL ITSA4" },
        { id: 3, date: "2026-10-01", amount: 30, description: "RENDIMENTO KNRI11" }, // ativo fora da carteira
        { id: 4, date: "2026-10-01", amount: -20, description: "RENDIMENTO MXRF11" }, // saída
      ],
      codes,
    )
    expect(found).toEqual([
      { pluggyId: "tx:1", investmentId: 7, date: "2026-10-15", type: "YIELD", amount: 150 },
      { pluggyId: "tx:2", investmentId: 9, date: "2026-10-01", type: "JCP", amount: 58 },
    ])
  })

  it("posição: preço médio com taxas, venda pelo preço médio e bonificação", () => {
    const t = (date: string, type: Trade["type"], quantity: number, amount: number, fees = 0): Trade => ({ date, type, quantity, price: null, amount, fees })
    const p = positionFromTrades([
      t("2026-01-10", "BUY", 100, 1000, 5),
      t("2026-02-10", "BUY", 100, 1200),
      t("2026-03-10", "SELL", 50, 700, 2),
      t("2026-04-10", "BONUS", 15, 0),
      t("2026-05-10", "DIVIDEND", 0, 30),
    ])
    expect(p.quantity).toBe(165)
    expect(p.invested).toBe(1653.75) // 2205 − 50 × 11,025
    expect(p.realized).toBe(146.75) // 700 − 2 − 551,25
    expect(p.avgPrice).toBeCloseTo(1653.75 / 165, 6)
  })

  it("renda fixa manual: resgate em reais abate o custo", () => {
    const p = positionFromTrades([
      { date: "2026-01-01", type: "BUY", quantity: null, price: null, amount: 5000, fees: 0 },
      { date: "2026-06-01", type: "SELL", quantity: null, price: null, amount: 2000, fees: 0 },
    ])
    expect(p.invested).toBe(3000)
    expect(p.quantity).toBe(0)
  })
})

describe("rentabilidade", () => {
  it("Dietz modificado desconta aportes e soma proventos", () => {
    const r = monthlyReturns([1000, 1110, 1200], [0, 100, 0], [0, 0, 10])
    expect(r[0]).toBeNull()
    expect(r[1]).toBeCloseTo(10 / 1050, 10)
    expect(r[2]).toBeCloseTo(100 / 1110, 10)
    expect(monthlyReturns([null, 500], [0, 500], [0, 0])[1]).toBeNull()
  })

  it("acumula e repete o acumulado em mês sem dado", () => {
    const acc = accumulate([null, 0.1, null, 0.1])
    expect(acc[0]).toBe(0)
    expect(acc[1]).toBeCloseTo(0.1)
    expect(acc[2]).toBeCloseTo(0.1)
    expect(acc[3]).toBeCloseTo(0.21)
  })

  it("CDI do mês pelas taxas diárias e variação do IBOV", () => {
    const cdi = cdiByMonth([
      { date: "2026-01-02", value: 0.05 },
      { date: "2026-01-03", value: 0.05 },
      { date: "2026-02-02", value: 0.06 },
    ])
    expect(cdi.get("2026-01")).toBeCloseTo(1.0005 ** 2 - 1, 12)
    expect(cdi.get("2026-02")).toBeCloseTo(0.0006, 12)
    const ibov = indexReturnsByMonth([
      { date: "2026-02-01", value: 110 },
      { date: "2026-01-01", value: 100 },
    ])
    expect(ibov.get("2026-02")).toBeCloseTo(0.1)
    expect(ibov.has("2026-01")).toBe(false)
  })
})

describe("rebalanceamento", () => {
  it("peso atual × alvo e quanto aportar", () => {
    const rows = rebalance(
      new Map([
        ["POS_FIXADO", 600],
        ["ACOES", 400],
      ]),
      new Map([
        ["POS_FIXADO", 50],
        ["ACOES", 30],
        ["FII", 20],
      ]),
    )
    expect(rows.map((r) => r.assetClass)).toEqual(["POS_FIXADO", "ACOES", "FII"])
    expect(rows[0]).toMatchObject({ pct: 0.6, target: 0.5, need: 0 })
    expect(rows[0].diff).toBeCloseTo(0.1)
    expect(rows[1].need).toBe(0)
    expect(rows[2]).toMatchObject({ value: 0, pct: 0, target: 0.2, need: 200 })
  })
})
