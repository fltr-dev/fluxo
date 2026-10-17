import { addDays, addMonths, daysBetween, monthEnd, monthOf, shiftDateMonths } from "./dates"

// Dívidas (pendências que não são fatura de cartão). Funções puras: vencimento de cada parcela pela regra
// escolhida, situação e totais. As datas são "YYYY-MM-DD" no fuso de São Paulo.

export type ScheduleKind = "FIXED_DAY" | "AFTER_SALARY" | "DATE" | "NONE"
export type Schedule = { kind: ScheduleKind; day: number | null; offsetDays: number; date: string | null; startMonth: string | null }

export type InstallmentRow = { id: number; number: number; amount: number; paidOn: string | null; dueOverride: string | null; transactionId?: number | null }
export type DebtInput = {
  id: number
  creditor: string
  schedule: Schedule
  items: { quantity: number; unitAmount: number }[]
  installments: InstallmentRow[]
  remindDaysBefore: number | null
}

export type Status = "paid" | "overdue" | "soon" | "open" | "undated"
/** Parcela com vencimento calculado: `estimated` quando depende de um salário que ainda não caiu. */
export type DueRow = InstallmentRow & { due: string | null; estimated: boolean; status: Status }

/** Dias de antecedência para a parcela contar como "vence em breve". */
export const SOON_DAYS = 7

const cents = (n: number) => Math.round(n * 100)
export const round2 = (n: number) => cents(n) / 100

export const itemsTotal = (items: { quantity: number; unitAmount: number }[]) => round2(items.reduce((t, i) => t + cents(i.unitAmount) * i.quantity, 0) / 100)

/** Divide `total` em `n` parcelas em centavos; as sobras vão para as primeiras. */
export function splitAmount(total: number, n: number) {
  if (n < 1) return []
  const t = cents(total)
  const base = Math.floor(t / n)
  const rest = t - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / 100)
}

// ---------- Salário ----------

export type SalaryModel = { byMonth: Map<string, string>; typicalDay: number }

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/** `dates`: datas das entradas de salário já recebidas (categoria "Salário"). Sem histórico, o dia típico é 5. */
export function salaryModel(dates: string[]): SalaryModel {
  const byMonth = new Map<string, string>()
  for (const d of [...dates].sort()) if (!byMonth.has(monthOf(d))) byMonth.set(monthOf(d), d)
  const recent = [...byMonth.values()].slice(-6).map((d) => Number(d.slice(8)))
  return { byMonth, typicalDay: recent.length ? median(recent) : 5 }
}

/** Dia do salário no mês: o real, se já caiu; senão a estimativa pelo dia típico. */
export function salaryOn(model: SalaryModel, ym: string) {
  const actual = model.byMonth.get(ym)
  if (actual) return { date: actual, expected: false }
  const day = Math.min(model.typicalDay, Number(monthEnd(ym).slice(8)))
  return { date: `${ym}-${String(day).padStart(2, "0")}`, expected: true }
}

// ---------- Vencimento ----------

/** Vencimento da parcela `number` (1, 2, 3…) pela regra; `date` null = sem data. */
export function dueDateOf(s: Schedule, number: number, salary: SalaryModel): { date: string | null; estimated: boolean } {
  const n = Math.max(1, number)
  switch (s.kind) {
    case "FIXED_DAY": {
      if (!s.startMonth || !s.day) return { date: null, estimated: false }
      const ym = addMonths(s.startMonth, n - 1)
      return { date: `${ym}-${String(Math.min(s.day, Number(monthEnd(ym).slice(8)))).padStart(2, "0")}`, estimated: false }
    }
    case "AFTER_SALARY": {
      if (!s.startMonth) return { date: null, estimated: false }
      const sal = salaryOn(salary, addMonths(s.startMonth, n - 1))
      return { date: addDays(sal.date, s.offsetDays), estimated: sal.expected }
    }
    case "DATE":
      return s.date ? { date: shiftDateMonths(s.date, n - 1), estimated: false } : { date: null, estimated: false }
    default:
      return { date: null, estimated: false }
  }
}

export function rowStatus(due: string | null, paidOn: string | null, today: string): Status {
  if (paidOn) return "paid"
  if (!due) return "undated"
  if (due < today) return "overdue"
  return daysBetween(today, due) <= SOON_DAYS ? "soon" : "open"
}

export type EvaluatedDebt = {
  id: number
  total: number
  paid: number
  remaining: number
  rows: DueRow[]
  paidCount: number
  /** Próxima parcela a pagar com data (a mais antiga em aberto). */
  next: DueRow | null
  overdue: DueRow[]
  status: Status
}

export function evaluateDebt(d: DebtInput, salary: SalaryModel, today: string): EvaluatedDebt {
  const total = itemsTotal(d.items)
  const rows = [...d.installments]
    .sort((a, b) => a.number - b.number)
    .map((r): DueRow => {
      const calc = dueDateOf(d.schedule, r.number, salary)
      const due = r.dueOverride ?? calc.date
      return { ...r, due, estimated: !r.dueOverride && calc.estimated, status: rowStatus(due, r.paidOn, today) }
    })
  const paid = round2(rows.filter((r) => r.paidOn).reduce((t, r) => t + cents(r.amount), 0) / 100)
  const remaining = Math.max(0, round2(total - paid))
  const open = rows.filter((r) => !r.paidOn)
  const dated = open.filter((r) => r.due).sort((a, b) => a.due!.localeCompare(b.due!))
  const overdue = dated.filter((r) => r.status === "overdue")
  const next = dated[0] ?? null
  const status: Status = remaining === 0 ? "paid" : overdue.length ? "overdue" : next?.status === "soon" ? "soon" : next ? "open" : "undated"
  return { id: d.id, total, paid, remaining, rows, paidCount: rows.length - open.length, next, overdue, status }
}

/** Parcelas em aberto com vencimento em [from, to], da mais próxima para a mais distante. */
export function dueBetween<T extends { id: number }>(list: { debt: T; ev: EvaluatedDebt }[], from: string, to: string) {
  return list
    .flatMap(({ debt, ev }) => ev.rows.filter((r) => !r.paidOn && r.due && r.due >= from && r.due <= to).map((row) => ({ debt, row })))
    .sort((a, b) => a.row.due!.localeCompare(b.row.due!) || a.row.number - b.row.number)
}

/** Texto curto da regra: "Todo dia 7", "1 dia após o salário", "Em 07/11/2026", "Sem data". */
export function scheduleLabel(s: Schedule) {
  switch (s.kind) {
    case "FIXED_DAY":
      return s.day ? `Todo dia ${s.day}` : "Sem data"
    case "AFTER_SALARY":
      return s.offsetDays === 0 ? "No dia do salário" : s.offsetDays === 1 ? "1 dia após o salário" : `${s.offsetDays} dias após o salário`
    case "DATE":
      return s.date ? `Em ${s.date.slice(8)}/${s.date.slice(5, 7)}/${s.date.slice(0, 4)}` : "Sem data"
    default:
      return "Sem data"
  }
}

/** Dica de quando a dívida zera: último vencimento agendado (ou null se algo depende de pagamento livre). */
export function payoffMonth(evs: EvaluatedDebt[]) {
  let last: string | null = null
  for (const ev of evs) {
    if (ev.remaining === 0) continue
    const dues = ev.rows.filter((r) => !r.paidOn && r.due).map((r) => r.due!)
    if (!dues.length) return null
    const m = dues.sort().at(-1)!
    if (!last || m > last) last = m
  }
  return last ? monthOf(last) : null
}
