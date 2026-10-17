import "server-only"
import { aliasedTable, and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, notInArray, sql } from "drizzle-orm"
import { cache } from "react"
import { z } from "zod"
import { categories, db, debtInstallments, debtItems, debts, transactions } from "@/db"
import { addDays, addMonths, monthOf, today } from "./domain/dates"
import {
  dueDateOf,
  evaluateDebt,
  itemsTotal,
  round2,
  salaryModel,
  splitAmount,
  type EvaluatedDebt,
  type Schedule,
  type SalaryModel,
} from "./domain/debts"

export type DebtRow = typeof debts.$inferSelect
export type DebtView = {
  debt: DebtRow
  schedule: Schedule
  items: { id: number; description: string; quantity: number; unitAmount: number }[]
  ev: EvaluatedDebt
}

export const scheduleOf = (d: DebtRow): Schedule => ({
  kind: d.scheduleKind,
  day: d.scheduleDay,
  offsetDays: d.salaryOffsetDays,
  date: d.scheduleDate,
  startMonth: d.startMonth,
})

/** Datas das entradas em categoria "Salário" (categoria ou subcategoria) nos últimos 8 meses. */
export async function salaryEntries() {
  const sub = aliasedTable(categories, "sub")
  const parent = aliasedTable(categories, "parent")
  const rows: { day: string; amount: number }[] = await db
    .select({ day: transactions.date, amount: transactions.amount })
    .from(transactions)
    .innerJoin(sub, eq(transactions.subcategoryId, sub.id))
    .leftJoin(parent, eq(sub.parentId, parent.id))
    .where(
      and(
        eq(transactions.kind, "INCOME"),
        eq(transactions.ignored, false),
        gte(transactions.date, `${addMonths(monthOf(today()), -8)}-01`),
        sql`(${sub.name} ilike 'sal_rio%' or ${parent.name} ilike 'sal_rio%')`,
      ),
    )
    .orderBy(asc(transactions.date))
  return rows
}

export const salaryDates = async () => (await salaryEntries()).map((r) => r.day)

export const loadSalary = cache(async () => salaryModel(await salaryDates()))

/** Todas as dívidas ativas (ou também as arquivadas) já avaliadas: totais, vencimentos e situação. */
export const loadDebts = cache(async (): Promise<{ views: DebtView[]; salary: SalaryModel }> => {
  const [list, items, insts, salary] = await Promise.all([
    db.select().from(debts).where(eq(debts.archived, false)).orderBy(asc(debts.createdAt)),
    db.select().from(debtItems).orderBy(asc(debtItems.id)),
    db.select().from(debtInstallments).orderBy(asc(debtInstallments.number)),
    loadSalary(),
  ])
  const now = today()
  const views = list.map((debt): DebtView => {
    const its = items.filter((i) => i.debtId === debt.id)
    const schedule = scheduleOf(debt)
    return {
      debt,
      schedule,
      items: its.map(({ id, description, quantity, unitAmount }) => ({ id, description, quantity, unitAmount })),
      ev: evaluateDebt(
        {
          id: debt.id,
          creditor: debt.creditor,
          schedule,
          items: its,
          installments: insts.filter((i) => i.debtId === debt.id),
          remindDaysBefore: debt.remindDaysBefore,
        },
        salary,
        now,
      ),
    }
  })
  return { views, salary }
})

// ---------- Escrita ----------

const scheduleInput = z.object({
  kind: z.enum(["FIXED_DAY", "AFTER_SALARY", "DATE", "NONE"]),
  day: z.number().int().min(1).max(31).nullish(),
  offsetDays: z.number().int().min(0).max(30).default(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
})

export const debtInput = z
  .object({
    id: z.number().int().positive().optional(),
    creditor: z.string().trim().min(1).max(120),
    relation: z.string().trim().max(60).nullish(),
    description: z.string().trim().max(500).nullish(),
    items: z
      .array(z.object({ description: z.string().trim().min(1).max(200), quantity: z.number().int().min(1).max(1000), unitAmount: z.number().positive().max(10_000_000) }))
      .min(1)
      .max(60),
    /** LUMP = parcela única; INSTALLMENTS = `installments` parcelas; FLEX = sem parcelas, paga quando der. */
    mode: z.enum(["LUMP", "INSTALLMENTS", "FLEX"]),
    installments: z.number().int().min(1).max(120).default(1),
    schedule: scheduleInput,
    remindDaysBefore: z.number().int().min(0).max(30).nullable().default(1),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "FLEX") return
    if (v.schedule.kind === "FIXED_DAY" && !v.schedule.day) ctx.addIssue({ code: "custom", message: "Informe o dia do mês", path: ["schedule", "day"] })
    if (v.schedule.kind === "DATE" && !v.schedule.date) ctx.addIssue({ code: "custom", message: "Informe a data", path: ["schedule", "date"] })
  })
export type DebtInputValue = z.input<typeof debtInput>

/** Primeiro mês cujo vencimento ainda não passou (ou o mês atual, se nada vence hoje antes). */
function firstMonth(s: Schedule, salary: SalaryModel, now: string) {
  const ym = monthOf(now)
  const due = dueDateOf({ ...s, startMonth: ym }, 1, salary).date
  return due && due < now ? addMonths(ym, 1) : ym
}

function scheduleColumns(v: z.output<typeof debtInput>, salary: SalaryModel, now: string, firstNumber: number) {
  if (v.mode === "FLEX" || v.schedule.kind === "NONE") return { scheduleKind: "NONE" as const, scheduleDay: null, scheduleDate: null, startMonth: null, salaryOffsetDays: v.schedule.offsetDays }
  const s: Schedule = { kind: v.schedule.kind, day: v.schedule.day ?? null, offsetDays: v.schedule.offsetDays, date: v.schedule.date ?? null, startMonth: null }
  // `startMonth` é o mês da parcela 1; a primeira parcela em aberto é a de número `firstNumber`
  const startMonth = s.kind === "DATE" ? null : addMonths(firstMonth(s, salary, now), -(firstNumber - 1))
  const scheduleDate = s.kind === "DATE" && s.date ? (firstNumber > 1 ? addMonthsToDate(s.date, -(firstNumber - 1)) : s.date) : null
  return { scheduleKind: s.kind, scheduleDay: s.kind === "FIXED_DAY" ? s.day : null, scheduleDate, startMonth, salaryOffsetDays: s.offsetDays }
}

function addMonthsToDate(date: string, n: number) {
  const ym = addMonths(monthOf(date), n)
  return `${ym}-${date.slice(8)}`
}

const nowIso = () => today()

/** Cria uma dívida com itens e parcelas. */
export async function createDebt(input: DebtInputValue) {
  const v = debtInput.parse(input)
  const salary = await loadSalary()
  const total = itemsTotal(v.items)
  const n = v.mode === "FLEX" ? 0 : v.mode === "LUMP" ? 1 : v.installments
  const now = nowIso()
  return db.transaction(async (tx) => {
    const [debt] = await tx
      .insert(debts)
      .values({
        creditor: v.creditor,
        relation: v.relation || null,
        description: v.description || null,
        remindDaysBefore: v.remindDaysBefore,
        ...scheduleColumns(v, salary, now, 1),
      })
      .returning({ id: debts.id })
    await tx.insert(debtItems).values(v.items.map((i) => ({ ...i, debtId: debt.id })))
    if (n > 0) await tx.insert(debtInstallments).values(splitAmount(total, n).map((amount, i) => ({ debtId: debt.id, number: i + 1, amount })))
    return debt.id
  })
}

/** Edita a dívida: refaz só as parcelas em aberto (as pagas ficam como estão). */
export async function updateDebt(input: DebtInputValue & { id: number }) {
  const v = debtInput.parse(input)
  const id = v.id!
  const salary = await loadSalary()
  const total = itemsTotal(v.items)
  const now = nowIso()
  await db.transaction(async (tx) => {
    const insts = await tx.select().from(debtInstallments).where(eq(debtInstallments.debtId, id))
    const paid = insts.filter((i) => i.paidOn)
    const paidAmount = round2(paid.reduce((t, i) => t + i.amount, 0))
    const remaining = Math.max(0, round2(total - paidAmount))
    const lastPaid = Math.max(0, ...paid.map((i) => i.number))
    const n = v.mode === "FLEX" || remaining === 0 ? 0 : v.mode === "LUMP" ? 1 : v.installments
    const cols = scheduleColumns(v, salary, now, lastPaid + 1)
    await tx
      .update(debts)
      .set({ creditor: v.creditor, relation: v.relation || null, description: v.description || null, remindDaysBefore: v.remindDaysBefore, ...cols })
      .where(eq(debts.id, id))
    await tx.delete(debtItems).where(eq(debtItems.debtId, id))
    await tx.insert(debtItems).values(v.items.map((i) => ({ ...i, debtId: id })))
    await tx.delete(debtInstallments).where(and(eq(debtInstallments.debtId, id), isNull(debtInstallments.paidOn)))
    if (n > 0) await tx.insert(debtInstallments).values(splitAmount(remaining, n).map((amount, i) => ({ debtId: id, number: lastPaid + 1 + i, amount })))
  })
}

/** Reparte o que falta pagar igualmente entre as parcelas em aberto (depois de pagamento parcial, a maior ou desfeito). */
async function reflow(tx: Pick<typeof db, "select" | "update" | "delete" | "insert">, debtId: number) {
  const [its, insts] = await Promise.all([tx.select().from(debtItems).where(eq(debtItems.debtId, debtId)), tx.select().from(debtInstallments).where(eq(debtInstallments.debtId, debtId)).orderBy(asc(debtInstallments.number))])
  const total = itemsTotal(its)
  const paid = round2(insts.filter((i) => i.paidOn).reduce((t, i) => t + i.amount, 0))
  const open = insts.filter((i) => !i.paidOn)
  const remaining = Math.max(0, round2(total - paid))
  if (remaining === 0) {
    if (open.length) await tx.delete(debtInstallments).where(inArray(debtInstallments.id, open.map((o) => o.id)))
    return
  }
  if (!open.length) return // dívida de pagamento livre: nada a repartir
  const parts = splitAmount(remaining, open.length)
  await Promise.all(open.map((o, i) => (o.amount === parts[i] ? undefined : tx.update(debtInstallments).set({ amount: parts[i] }).where(eq(debtInstallments.id, o.id)))))
}

export const payInput = z.object({
  debtId: z.number().int().positive(),
  /** Sem `installmentId` (dívida de pagamento livre) o pagamento cria a sua própria linha. */
  installmentId: z.number().int().positive().nullish(),
  amount: z.number().positive().max(10_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transactionId: z.number().int().positive().nullish(),
})
export type PayInput = z.input<typeof payInput>

export async function payInstallment(input: PayInput) {
  const v = payInput.parse(input)
  await db.transaction(async (tx) => {
    const [debt] = await tx.select({ id: debts.id }).from(debts).where(eq(debts.id, v.debtId))
    if (!debt) throw new Error("Dívida não encontrada")
    if (v.installmentId) {
      const [row] = await tx.select().from(debtInstallments).where(and(eq(debtInstallments.id, v.installmentId), eq(debtInstallments.debtId, v.debtId)))
      if (!row) throw new Error("Parcela não encontrada")
      if (row.paidOn) throw new Error("Esta parcela já foi paga")
      await tx.update(debtInstallments).set({ amount: v.amount, paidOn: v.date, transactionId: v.transactionId ?? null }).where(eq(debtInstallments.id, row.id))
    } else {
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${debtInstallments.number}), 0)::int` }).from(debtInstallments).where(eq(debtInstallments.debtId, v.debtId))
      await tx.insert(debtInstallments).values({ debtId: v.debtId, number: max + 1, amount: v.amount, paidOn: v.date, transactionId: v.transactionId ?? null })
    }
    await reflow(tx, v.debtId)
  })
}

/** Desfaz um pagamento: a parcela volta a ficar em aberto (pagamento livre apaga a linha). */
export async function undoPayment(installmentId: number) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(debtInstallments).where(eq(debtInstallments.id, installmentId))
    if (!row?.paidOn) return
    const [debt] = await tx.select().from(debts).where(eq(debts.id, row.debtId))
    if (debt.scheduleKind === "NONE" && !(await hasOpenRows(tx, row.debtId))) await tx.delete(debtInstallments).where(eq(debtInstallments.id, row.id))
    else await tx.update(debtInstallments).set({ paidOn: null, transactionId: null }).where(eq(debtInstallments.id, row.id))
    await reflow(tx, row.debtId)
  })
}

async function hasOpenRows(tx: Pick<typeof db, "select">, debtId: number) {
  const rows = await tx.select({ id: debtInstallments.id }).from(debtInstallments).where(and(eq(debtInstallments.debtId, debtId), isNull(debtInstallments.paidOn))).limit(1)
  return rows.length > 0
}

export const archiveDebt = (id: number) => db.update(debts).set({ archived: true }).where(eq(debts.id, id))
export const deleteDebt = (id: number) => db.delete(debts).where(eq(debts.id, id))

// ---------- Vínculo com transações ----------

/**
 * Saídas que parecem o pagamento da parcela: mesmo valor, perto do vencimento (−5 a +10 dias; sem data, últimos 30
 * dias), ainda não ligadas a nenhuma parcela. O nome do credor no texto sobe a transação na lista.
 */
export async function matchPayments(row: { amount: number; due: string | null }, creditor: string, limit = 3) {
  const now = today()
  const from = row.due ? addDays(row.due, -5) : addDays(now, -30)
  const to = row.due ? addDays(row.due, 10) : now
  const linked = db.select({ id: debtInstallments.transactionId }).from(debtInstallments).where(isNotNull(debtInstallments.transactionId))
  const found = await db
    .select({ id: transactions.id, date: transactions.date, description: transactions.description, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.kind, "EXPENSE"),
        eq(transactions.ignored, false),
        eq(transactions.amount, -row.amount),
        gte(transactions.date, from),
        lte(transactions.date, to),
        notInArray(transactions.id, linked),
      ),
    )
    .orderBy(desc(transactions.date))
    .limit(20)
  const name = creditor.toLowerCase().split(/\s+/)[0]
  return found
    .map((t) => ({ t, score: (t.description.toLowerCase().includes(name) ? 0 : 1) * 100 + (row.due ? Math.abs((Date.parse(t.date) - Date.parse(row.due)) / 86_400_000) : 0) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.t)
}
