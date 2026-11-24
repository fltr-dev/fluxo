import { describe, expect, it } from "vitest"
import { accrualBack, dailyFactors, lastAtOrBefore, parseRate, unitsBack } from "./backfill"
import { addDays } from "./dates"

describe("taxa pelo rótulo", () => {
  it("pós, pré e o resto a 100% do CDI", () => {
    expect(parseRate("115% CDI")).toEqual({ kind: "CDI", pct: 1.15 })
    expect(parseRate("16,76% a.a.")).toEqual({ kind: "PRE", annual: expect.closeTo(0.1676, 10) })
    expect(parseRate("IPCA + 6,5%")).toEqual({ kind: "CDI", pct: 1 })
    expect(parseRate(null)).toEqual({ kind: "CDI", pct: 1 })
  })
  it("fator diário", () => {
    const cdi = [{ date: "2026-01-02", value: 0.05 }]
    expect(dailyFactors(cdi, { kind: "CDI", pct: 1.2 }).get("2026-01-02")).toBeCloseTo(1.0006, 10)
    expect(dailyFactors(cdi, { kind: "PRE", annual: 0.1 }).get("2026-01-02")! ** 252).toBeCloseTo(1.1, 10)
  })
})

// todos os dias de jan a abr/2026 rendendo 0,1%
const days: string[] = []
for (let d = "2026-01-01"; d <= "2026-04-30"; d = addDays(d, 1)) days.push(d)
const factor = new Map(days.map((d) => [d, 1.001]))

describe("renda fixa voltando no tempo", () => {
  it("bate com o saldo calculado para frente e é null antes da aplicação", () => {
    // aplica 1000 em 10/02, resgata 200 em 15/03; saldo real em 30/04
    const flows = [
      { date: "2026-02-10", amount: 1000 },
      { date: "2026-03-15", amount: -200 },
    ]
    let v = 0
    const fwd = new Map<string, number>()
    for (const d of days) {
      v = v * 1.001 + (flows.find((f) => f.date === d)?.amount ?? 0)
      fwd.set(d, v)
    }
    const got = accrualBack({ date: "2026-04-30", value: fwd.get("2026-04-30")! }, flows, factor, ["2026-01-31", "2026-02-28", "2026-03-31"])
    expect(got[0]).toBeNull()
    expect(got[1]).toBeCloseTo(fwd.get("2026-02-28")!, 2)
    expect(got[2]).toBeCloseTo(fwd.get("2026-03-31")!, 2)
  })
  it("ativo hoje zerado tem saldo antes do resgate total", () => {
    const got = accrualBack({ date: "2026-04-30", value: 0 }, [{ date: "2026-03-15", amount: -500 }], new Map(), ["2026-02-28", "2026-03-31"])
    expect(got).toEqual([500, 0])
  })
})

describe("unidades × preço voltando no tempo", () => {
  const price = (d: string) => (d < "2026-02-01" ? null : d < "2026-03-01" ? 10 : 12)
  it("ancora no saldo real e tira as compras posteriores", () => {
    // 5 unidades compradas em 10/03; saldo real 15 × 12 = 180 em 30/04
    const got = unitsBack({ date: "2026-04-30", value: 180 }, [{ date: "2026-03-10", quantity: 5 }], price, ["2026-01-31", "2026-02-28", "2026-03-31"])
    expect(got).toEqual([null, 100, 180])
  })
  it("vendeu tudo: zerado hoje, posição antes da venda; leading zeros viram null", () => {
    const got = unitsBack(
      { date: "2026-04-30", value: 0 },
      [
        { date: "2026-02-20", quantity: 4 },
        { date: "2026-04-10", quantity: -4 },
      ],
      price,
      ["2026-02-15", "2026-02-28", "2026-03-31"],
    )
    expect(got).toEqual([null, 40, 48])
  })
  it("sem preço na data real não ancora", () => {
    expect(unitsBack({ date: "2026-01-15", value: 100 }, [], price, ["2026-01-31"])).toEqual([null])
  })
})

it("último valor até a data", () => {
  const s = [
    { date: "2026-01-02", value: 1 },
    { date: "2026-01-05", value: 2 },
  ]
  expect(lastAtOrBefore(s, "2026-01-01")).toBeNull()
  expect(lastAtOrBefore(s, "2026-01-04")).toBe(1)
  expect(lastAtOrBefore(s, "2026-01-09")).toBe(2)
})
