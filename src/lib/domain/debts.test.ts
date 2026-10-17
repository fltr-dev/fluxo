import { describe, expect, it } from "vitest"
import { dueBetween, dueDateOf, evaluateDebt, itemsTotal, payoffMonth, salaryModel, salaryOn, scheduleLabel, splitAmount, type DebtInput, type Schedule } from "./debts"

const none: Schedule = { kind: "NONE", day: null, offsetDays: 1, date: null, startMonth: null }
const salary = salaryModel(["2026-08-05", "2026-09-07", "2026-10-05"])

describe("itens e parcelas", () => {
  it("soma os itens (psicólogo: 4×90 + 2×110)", () => {
    expect(itemsTotal([{ quantity: 4, unitAmount: 90 }, { quantity: 2, unitAmount: 110 }])).toBe(580)
  })
  it("divide em centavos e a soma fecha", () => {
    const p = splitAmount(100, 3)
    expect(p).toEqual([33.34, 33.33, 33.33])
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2)
    expect(splitAmount(900, 3)).toEqual([300, 300, 300])
  })
})

describe("salário", () => {
  it("usa a mediana do dia dos últimos meses e o real quando já caiu", () => {
    expect(salary.typicalDay).toBe(5)
    expect(salaryOn(salary, "2026-10")).toEqual({ date: "2026-10-05", expected: false })
    expect(salaryOn(salary, "2026-11")).toEqual({ date: "2026-11-05", expected: true })
  })
  it("sem histórico o dia típico é 5; em mês curto limita ao fim do mês", () => {
    expect(salaryModel([]).typicalDay).toBe(5)
    expect(salaryOn({ byMonth: new Map(), typicalDay: 31 }, "2026-02").date).toBe("2026-02-28")
  })
})

describe("vencimento por regra", () => {
  it("dia fixo, com mês curto", () => {
    const s: Schedule = { kind: "FIXED_DAY", day: 31, offsetDays: 1, date: null, startMonth: "2026-01" }
    expect(dueDateOf(s, 1, salary).date).toBe("2026-01-31")
    expect(dueDateOf(s, 2, salary).date).toBe("2026-02-28")
  })
  it("após o salário: real quando caiu, estimado quando não", () => {
    const s: Schedule = { kind: "AFTER_SALARY", day: null, offsetDays: 1, date: null, startMonth: "2026-10" }
    expect(dueDateOf(s, 1, salary)).toEqual({ date: "2026-10-06", estimated: false })
    expect(dueDateOf(s, 2, salary)).toEqual({ date: "2026-11-06", estimated: true })
  })
  it("data específica avança mês a mês e sem data é nulo", () => {
    const s: Schedule = { kind: "DATE", day: null, offsetDays: 1, date: "2026-11-30", startMonth: null }
    expect(dueDateOf(s, 2, salary).date).toBe("2026-12-30")
    expect(dueDateOf(none, 1, salary).date).toBeNull()
  })
  it("rótulos", () => {
    expect(scheduleLabel({ ...none, kind: "FIXED_DAY", day: 7 })).toBe("Todo dia 7")
    expect(scheduleLabel({ ...none, kind: "AFTER_SALARY", offsetDays: 1 })).toBe("1 dia após o salário")
    expect(scheduleLabel({ ...none, kind: "AFTER_SALARY", offsetDays: 0 })).toBe("No dia do salário")
    expect(scheduleLabel(none)).toBe("Sem data")
  })
})

const joao: DebtInput = {
  id: 1,
  creditor: "João",
  schedule: { kind: "FIXED_DAY", day: 7, offsetDays: 1, date: null, startMonth: "2026-09" },
  items: [{ quantity: 1, unitAmount: 1500 }],
  installments: [1, 2, 3, 4, 5].map((n) => ({ id: n, number: n, amount: 300, paidOn: n <= 2 ? `2026-${n + 8}-07`.replace("-9-", "-09-") : null, dueOverride: null })),
  remindDaysBefore: 1,
}

describe("situação da dívida", () => {
  it("João: 2 de 5 pagas, próxima em 7/11", () => {
    const ev = evaluateDebt(joao, salary, "2026-10-17")
    expect(ev).toMatchObject({ total: 1500, paid: 600, remaining: 900, paidCount: 2 })
    expect(ev.next?.due).toBe("2026-11-07")
    expect(ev.status).toBe("open")
  })
  it("vence em breve e atrasada", () => {
    expect(evaluateDebt(joao, salary, "2026-11-02").status).toBe("soon")
    const late = evaluateDebt(joao, salary, "2026-11-10")
    expect(late.status).toBe("overdue")
    expect(late.overdue.map((r) => r.number)).toEqual([3])
  })
  it("quitada quando nada resta", () => {
    const paid = { ...joao, installments: joao.installments.map((r) => ({ ...r, paidOn: "2026-10-01" })) }
    expect(evaluateDebt(paid, salary, "2026-10-17").status).toBe("paid")
  })
  it("pagamento livre (sem parcelas): restante = total − pago", () => {
    const mae: DebtInput = { id: 2, creditor: "Mãe", schedule: none, items: [{ quantity: 1, unitAmount: 1000 }], installments: [{ id: 9, number: 1, amount: 200, paidOn: "2026-10-01", dueOverride: null }], remindDaysBefore: null }
    const ev = evaluateDebt(mae, salary, "2026-10-17")
    expect(ev).toMatchObject({ paid: 200, remaining: 800, status: "undated", next: null })
  })
  it("agrega vencimentos no período e o mês em que zera", () => {
    const ev = evaluateDebt(joao, salary, "2026-10-17")
    const list = [{ debt: joao, ev }]
    expect(dueBetween(list, "2026-10-17", "2026-12-31").map((x) => x.row.due)).toEqual(["2026-11-07", "2026-12-07", "2027-01-07"].slice(0, 2))
    expect(payoffMonth([ev])).toBe("2027-01")
  })
})
