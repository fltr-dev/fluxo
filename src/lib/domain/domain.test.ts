import { describe, expect, it } from "vitest"
import { averageMonthlyExpense, goalProgress, limitStatus, netWorthSeries, reserveStatus } from "./calc"
import { deriveKind, mapPluggyCategory, matchRule, resolveCategory, type Rule } from "./categorize"
import { monthEnd, previousPeriod, resolvePeriod, samePeriodLastYear, toLocalDate } from "./dates"
import { mergeTransactions, normalizePluggyTx, type Existing, type Incoming } from "./sync-merge"
import { detectTransfers, type TransferCandidate } from "./transfers"

describe("datas", () => {
  it("converte para o fuso de São Paulo", () => {
    expect(toLocalDate("2026-03-01T02:00:00Z")).toBe("2026-02-28")
  })
  it("resolve presets e períodos de comparação", () => {
    expect(resolvePeriod("mes", "2026-03-15")).toEqual({ from: "2026-03-01", to: "2026-03-31" })
    expect(resolvePeriod("3m", "2026-01-10")).toEqual({ from: "2025-11-01", to: "2026-01-31" })
    expect(resolvePeriod("custom", "2026-01-10", "2026-01-05", "2026-01-20")).toEqual({ from: "2026-01-05", to: "2026-01-20" })
    expect(resolvePeriod("custom", "2026-01-10", "2026-02-10", "2026-01-01")).toEqual({ from: "2026-01-01", to: "2026-01-31" }) // invertido → mês atual
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" })
    expect(previousPeriod({ from: "2026-03-10", to: "2026-03-19" })).toEqual({ from: "2026-02-28", to: "2026-03-09" })
    expect(samePeriodLastYear({ from: "2028-02-01", to: "2028-02-29" })).toEqual({ from: "2027-02-01", to: "2027-02-28" })
    expect(monthEnd("2028-02")).toBe("2028-02-29")
  })
})

const rule = (r: Partial<Rule>): Rule => ({
  id: 1, priority: 100, matchType: "CONTAINS", pattern: "", accountId: null, kind: null,
  minAmount: null, maxAmount: null, subcategoryId: 1, active: true, ...r,
})
const tx = { description: "UBER *TRIP São Paulo", amount: -23.5, accountId: 1, pluggyCategory: null, pluggyCategoryId: null }

describe("categorização", () => {
  it("regras: prioridade, acentos, tipo, faixa e regex inválida", () => {
    const rules = [
      rule({ id: 1, priority: 50, pattern: "uber", kind: "INCOME", subcategoryId: 9 }),
      rule({ id: 2, priority: 100, pattern: "sao paulo", subcategoryId: 2 }),
      rule({ id: 3, priority: 10, matchType: "REGEX", pattern: "([", subcategoryId: 3 }),
      rule({ id: 4, priority: 1, pattern: "uber", maxAmount: 10, subcategoryId: 4 }),
    ]
    expect(matchRule(rules, tx)?.id).toBe(2)
    expect(matchRule([rule({ matchType: "STARTS_WITH", pattern: "uber *" })], tx)).toBeDefined()
  })
  it("mapeia pela categoria Pluggy e cai no nível 1", () => {
    const map = new Map([["Groceries", 5], ["Food and drinks", 6]])
    expect(mapPluggyCategory(map, { ...tx, pluggyCategory: "Groceries" })).toBe(5)
    expect(mapPluggyCategory(map, { ...tx, pluggyCategory: "Eating out", pluggyCategoryId: "11010000" })).toBe(6)
    expect(mapPluggyCategory(map, { ...tx, pluggyCategory: "PIX", pluggyCategoryId: "06030000" })).toBeUndefined()
  })
  it("ordem regra → Jev → Pluggy → nenhuma, com sugestão em confiança média", () => {
    const t = { accept: 0.85, suggest: 0.6 }
    expect(resolveCategory({ ...t, ruleSubcategoryId: 1, jev: { subcategoryId: 2, confidence: 0.99 }, mappedSubcategoryId: 3 }))
      .toMatchObject({ subcategoryId: 1, categorySource: "RULE" })
    expect(resolveCategory({ ...t, jev: { subcategoryId: 2, confidence: 0.9 }, mappedSubcategoryId: 3 }))
      .toMatchObject({ subcategoryId: 2, categorySource: "JEV" })
    expect(resolveCategory({ ...t, jev: { subcategoryId: 2, confidence: 0.7 }, mappedSubcategoryId: 3 }))
      .toEqual({ subcategoryId: 3, categorySource: "PLUGGY_MAP", suggestedSubcategoryId: 2, suggestionConfidence: 0.7 })
    expect(resolveCategory({ ...t, jev: { subcategoryId: 2, confidence: 0.3 } }))
      .toEqual({ subcategoryId: null, categorySource: "NONE", suggestedSubcategoryId: null, suggestionConfidence: null })
    expect(resolveCategory({ ...t, jev: null })).toMatchObject({ categorySource: "NONE" })
  })
  it("tipo segue a categoria; sem categoria segue o sinal", () => {
    expect(deriveKind(30, "EXPENSE")).toBe("EXPENSE") // estorno
    expect(deriveKind(-30, null)).toBe("EXPENSE")
    expect(deriveKind(30, null)).toBe("INCOME")
  })
})

const cand = (c: Partial<TransferCandidate>): TransferCandidate => ({
  id: 0, accountId: 1, date: "2026-03-10", amount: 0, kind: "EXPENSE", categorySource: "NONE",
  ignored: false, transferPairId: null, pluggyCategory: null, pluggyCategoryId: null, ...c,
})

describe("transferências", () => {
  it("pareia mesmo valor, sinais opostos, contas diferentes, ≤ 3 dias, o mais próximo", () => {
    const { pairs, singles } = detectTransfers([
      cand({ id: 1, accountId: 1, amount: -500, date: "2026-03-10" }),
      cand({ id: 2, accountId: 2, amount: 500, date: "2026-03-13", kind: "INCOME" }),
      cand({ id: 3, accountId: 3, amount: 500, date: "2026-03-11", kind: "INCOME" }),
      cand({ id: 4, accountId: 1, amount: 500, date: "2026-03-10", kind: "INCOME" }), // mesma conta
      cand({ id: 5, accountId: 1, amount: -80, date: "2026-03-01" }),
      cand({ id: 6, accountId: 2, amount: 80, date: "2026-03-05", kind: "INCOME" }), // 4 dias
      cand({ id: 7, accountId: 1, amount: -1200, pluggyCategory: "Credit card payment", pluggyCategoryId: "05090000" }),
      cand({ id: 8, accountId: 1, amount: -300, pluggyCategory: "Fixed income", pluggyCategoryId: "03020000" }),
      cand({ id: 9, accountId: 1, amount: 12, pluggyCategory: "Proceeds interests and dividends", pluggyCategoryId: "03060000", kind: "INCOME" }),
      cand({ id: 10, accountId: 2, amount: 1000, categorySource: "USER", kind: "INCOME" }),
      cand({ id: 11, accountId: 1, amount: -1000, date: "2026-03-10" }),
    ])
    expect(pairs).toEqual([[1, 3]])
    expect(singles).toEqual([7, 8])
  })
})

describe("merge da sincronização", () => {
  const inc = (i: Partial<Incoming>): Incoming => ({
    pluggyId: "x", date: "2026-03-10", amount: -10, description: "d", status: "POSTED",
    pluggyCategory: null, pluggyCategoryId: null, installmentNumber: null, totalInstallments: null, ...i,
  })
  const ex = (e: Partial<Existing>): Existing => ({
    id: 1, pluggyId: "x", date: "2026-03-10", amount: -10, status: "POSTED", subcategoryId: null,
    categorySource: "NONE", note: null, ignored: false, ...e,
  })

  it("normaliza sinal pelo type e data no fuso local", () => {
    const n = normalizePluggyTx({ id: "a", description: "x", amount: 50, type: "DEBIT", date: "2026-03-01T01:00:00.000Z", status: "PENDING", creditCardMetadata: { installmentNumber: 2, totalInstallments: 10 } })
    expect(n).toMatchObject({ amount: -50, date: "2026-02-28", status: "PENDING", installmentNumber: 2, totalInstallments: 10 })
  })
  it("insere novas, atualiza só campos do banco e troca pendente por confirmada herdando edições", () => {
    const existing = [
      ex({ id: 1, pluggyId: "a", categorySource: "USER", subcategoryId: 7, note: "minha nota" }),
      ex({ id: 2, pluggyId: "p", status: "PENDING", amount: -99.9, categorySource: "USER", subcategoryId: 8, date: "2026-03-08" }),
      ex({ id: 3, pluggyId: "old", status: "PENDING", date: "2026-01-01" }), // fora da janela
    ]
    const r = mergeTransactions(existing, [inc({ pluggyId: "a", amount: -11 }), inc({ pluggyId: "n", amount: -99.9, date: "2026-03-10" })], "2026-03-01")
    expect(r.updates).toEqual([{ id: 1, data: expect.objectContaining({ amount: -11 }) }])
    expect(r.updates[0].data).not.toHaveProperty("note")
    expect(r.deletes).toEqual([2])
    expect(r.inserts).toEqual([expect.objectContaining({ pluggyId: "n", carry: { subcategoryId: 8, categorySource: "USER", note: null, ignored: false } })])
  })
})

describe("limites, metas, reserva e patrimônio", () => {
  it("estados do limite", () => {
    expect(limitStatus(79, 100).state).toBe("ok")
    expect(limitStatus(80, 100).state).toBe("warn")
    expect(limitStatus(100, 100).state).toBe("over")
  })
  it("meta: aporte mensal necessário conta o mês atual", () => {
    const g = goalProgress({ target: 10000, current: 4000, createdAt: "2026-01-01", deadline: "2026-12-31", today: "2026-10-05" })
    expect(g).toMatchObject({ remaining: 6000, monthsLeft: 3, monthlyNeeded: 2000, state: "late" })
    expect(goalProgress({ target: 100, current: 100, createdAt: "2026-01-01", deadline: "2026-02-01", today: "2026-10-05" }).state).toBe("done")
  })
  it("reserva: média só de meses com dado e meses de cobertura", () => {
    const avg = averageMonthlyExpense(new Map([["2026-09", 3000], ["2026-08", 5000], ["2026-10", 99999]]), "2026-10")
    expect(avg).toBe(4000)
    expect(reserveStatus({ balance: 12000, avgMonthlyExpense: avg, mode: "MONTHS", targetMonths: 6, targetAmount: null }))
      .toEqual({ target: 24000, pct: 0.5, coverageMonths: 3 })
  })
  it("patrimônio carrega o último saldo de cada conta", () => {
    const s = netWorthSeries(
      [{ accountId: 1, date: "2026-01-05", balance: 100 }, { accountId: 2, date: "2026-02-01", balance: -30 }, { accountId: 1, date: "2026-03-02", balance: 150 }],
      ["2026-01", "2026-02", "2026-03"],
    )
    expect(s.map((p) => p.value)).toEqual([100, 70, 120])
  })
})
