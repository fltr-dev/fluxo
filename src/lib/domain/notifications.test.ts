import { describe, expect, it } from "vitest"
import { evaluateDebt, salaryModel, type DebtInput } from "./debts"
import { buildNotifications, DEFAULT_NOTIFY } from "./notifications"

// Intl usa espaço sem quebra entre "R$" e o valor
const plain = <T extends { title: string; body: string }>(n: T) => ({ ...n, title: n.title.replace(/\u00a0/g, " "), body: n.body.replace(/\u00a0/g, " ") })
const salary = salaryModel(["2026-09-05", "2026-10-05"])
const debt = (over: Partial<DebtInput> = {}): DebtInput => ({
  id: 1,
  creditor: "João Silva",
  schedule: { kind: "FIXED_DAY", day: 7, offsetDays: 1, date: null, startMonth: "2026-11" },
  items: [{ quantity: 1, unitAmount: 600 }],
  installments: [1, 2].map((n) => ({ id: n, number: n, amount: 300, paidOn: null, dueOverride: null })),
  remindDaysBefore: 1,
  ...over,
})
const run = (today: string, d: DebtInput = debt(), extra: Partial<Parameters<typeof buildNotifications>[0]> = {}) =>
  buildNotifications({
    today,
    debts: [{ id: d.id, creditor: d.creditor, description: "Passagens", remindDaysBefore: d.remindDaysBefore, afterSalary: d.schedule.kind === "AFTER_SALARY", totalRows: d.installments.length, rows: evaluateDebt(d, salary, today).rows }],
    salary: null,
    limits: [],
    settings: DEFAULT_NOTIFY,
    ...extra,
  }).map(plain)

describe("avisos de dívidas", () => {
  it("avisa 1 dia antes, no dia, e não antes disso", () => {
    expect(run("2026-11-05")).toEqual([])
    const eve = run("2026-11-06")
    expect(eve).toHaveLength(1)
    expect(eve[0]).toMatchObject({ kind: "DEBT_DUE", title: "Amanhã: parcela de João Silva", dedupeKey: "debt-due:1:2026-11-07" })
    expect(eve[0].body).toBe("1 de 2 · R$ 300,00 · Passagens")
    expect(run("2026-11-07")[0].title).toBe("Hoje: parcela de João Silva")
  })
  it("lembrete de 3 dias e sem aviso", () => {
    expect(run("2026-11-04", debt({ remindDaysBefore: 3 }))[0].title).toBe("Em 3 dias: parcela de João Silva")
    expect(run("2026-11-06", debt({ remindDaysBefore: null }))).toEqual([])
  })
  it("atraso gera um aviso por parcela, com chave estável", () => {
    const late = run("2026-11-10")
    expect(late).toHaveLength(1)
    expect(late[0]).toMatchObject({ kind: "DEBT_OVERDUE", dedupeKey: "debt-overdue:1", title: "Dívida atrasada: João Silva · R$ 300,00" })
    expect(run("2026-11-20")[0].dedupeKey).toBe("debt-overdue:1")
  })
  it("parcela paga não gera aviso", () => {
    const paid = debt({ installments: [{ id: 1, number: 1, amount: 300, paidOn: "2026-11-01", dueOverride: null }] })
    expect(run("2026-11-10", paid)).toEqual([])
  })
  it("respeita os tipos desligados", () => {
    expect(run("2026-11-10", debt(), { settings: { ...DEFAULT_NOTIFY, notifyOverdue: false } })).toEqual([])
    expect(run("2026-11-06", debt(), { settings: { ...DEFAULT_NOTIFY, notifyDue: false } })).toEqual([])
  })
})

describe("salário e limites", () => {
  it("salário recente avisa e cita as parcelas da semana", () => {
    const d = debt({ schedule: { kind: "AFTER_SALARY", day: null, offsetDays: 1, date: null, startMonth: "2026-11" } })
    const out = run("2026-11-05", d, { salary: { date: "2026-11-05", amount: 8500 } })
    const sal = out.find((n) => n.kind === "SALARY")!
    expect(sal).toMatchObject({ title: "Salário caiu! R$ 8.500,00", dedupeKey: "salary:2026-11-05" })
    expect(sal.body).toContain("João Silva R$ 300,00")
    expect(run("2026-11-12", d, { salary: { date: "2026-11-05", amount: 8500 } }).some((n) => n.kind === "SALARY")).toBe(false)
  })
  it("limite estourado uma vez por mês", () => {
    const out = run("2026-11-12", debt({ installments: [] }), { limits: [{ categoryId: 4, label: "Lazer", limit: 500, spent: 520 }, { categoryId: 5, label: "Compras", limit: 700, spent: 100 }] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: "LIMIT", title: "Limite estourado: Lazer", dedupeKey: "limit:4:2026-11" })
  })
})
