import { describe, expect, it } from "vitest"
import { type AccountType, cardUsage, groupAccounts } from "./account-types"

const acc = (name: string, type: AccountType, balance: number, extra: { archived?: boolean; investmentId?: number; institution?: string } = {}) => ({
  name,
  type,
  balance,
  archived: extra.archived ?? false,
  investmentId: extra.investmentId ?? null,
  institution: extra.institution ?? null,
})

const ACCS = [
  acc("Carteira", "CASH", 50),
  acc("Conta Itaú", "CHECKING", 300, { institution: "Itaú" }),
  acc("Zeta", "CHECKING", -900),
  acc("Nubank Conta", "CHECKING", 1200, { institution: "Nubank" }),
  acc("Cartão Nubank", "CREDIT_CARD", -2500, { institution: "Nubank" }),
  acc("Tesouro Selic", "SAVINGS_INVESTMENT", 1000, { investmentId: 1 }),
  acc("CDB", "SAVINGS_INVESTMENT", 3000, { investmentId: 2 }),
  acc("Ativo vendido", "SAVINGS_INVESTMENT", 0, { investmentId: 3, archived: true }),
  acc("Conta antiga", "CHECKING", 0, { archived: true }),
]

describe("groupAccounts", () => {
  it("agrupa por tipo na ordem fixa, com subtotal, e some com grupos vazios", () => {
    const { groups } = groupAccounts(ACCS)
    expect(groups.map((g) => [g.type, g.label, g.total])).toEqual([
      ["CHECKING", "Contas correntes", 600],
      ["CREDIT_CARD", "Cartões de crédito", -2500],
      ["SAVINGS_INVESTMENT", "Poupança e investimentos", 4000],
      ["CASH", "Dinheiro", 50],
    ])
    expect(groupAccounts([acc("Carteira", "CASH", 1)]).groups.map((g) => g.type)).toEqual(["CASH"])
  })
  it("junta os ativos de investimento numa linha só e deixa arquivadas à parte (sem ativos)", () => {
    const { groups, archived } = groupAccounts(ACCS)
    expect(groups[2].rows).toEqual([{ portfolio: true, name: "Carteira de investimentos", count: 2, balance: 4000 }])
    expect(archived.map((a) => a.name)).toEqual(["Conta antiga"])
  })
  it("ordena por |saldo|, nome ou banco", () => {
    const names = (order: "saldo" | "nome" | "banco") => groupAccounts(ACCS, order).groups[0].rows.map((r) => r.name)
    expect(names("saldo")).toEqual(["Nubank Conta", "Zeta", "Conta Itaú"])
    expect(names("nome")).toEqual(["Conta Itaú", "Nubank Conta", "Zeta"])
    // pelo que aparece embaixo do nome: Itaú, "Manual" (sem banco nem instituição), Nubank
    expect(names("banco")).toEqual(["Conta Itaú", "Zeta", "Nubank Conta"])
  })
})

describe("cardUsage", () => {
  it("usa o disponível da Pluggy; sem ele, limite − fatura; sem limite, nada", () => {
    const u = cardUsage(-338.81, 8000, 6461.19)!
    expect(u).toMatchObject({ limit: 8000, available: 6461.19 })
    expect(u.used).toBeCloseTo(1538.81, 2)
    expect(u.pct).toBeCloseTo(19.24, 2)
    expect(cardUsage(-2000, 5000, null)).toMatchObject({ available: 3000, used: 2000, pct: 40 })
    expect(cardUsage(-100, null, null)).toBeNull()
    expect(cardUsage(-100, 0, 50)).toBeNull()
  })
  it("limite flexível: passa do limite com disponível negativo e a barra para em 100%", () => {
    expect(cardUsage(-5600, 5000, null)).toMatchObject({ available: -600, used: 5600, pct: 100 })
  })
})
