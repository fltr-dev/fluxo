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
  occurrences,
  recurRows,
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
  items: { id: number; description: string; quantity: number; unitAmount: number; date: string | null }[]
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
  await materializeRecurring()
  const [list, items, insts, salary] = await Promise.all([
    db.select().from(debts).where(eq(debts.archived, false)).orderBy(asc(debts.createdAt)),
    db.select().from(debtItems).orderBy(asc(debtItems.date), asc(debtItems.id)),
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
      items: its.map(({ id, description, quantity, unitAmount, date }) => ({ id, description, quantity, unitAmount, date })),
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

/**
 * Dívidas recorrentes: cria os itens (e parcelas) das ocorrências cuja data já chegou, até o fim, se houver. Roda a
 * cada carga das dívidas; o compare-and-set em `recurNext` impede que duas cargas simultâneas gerem em dobro.
 */
export async function materializeRecurring() {
  const now = today()
  const due = await db.select().from(debts).where(and(eq(debts.archived, false), isNotNull(debts.recurNext), lte(debts.recurNext, now)))
  for (const d of due) {
    if (!d.recurEvery || !d.recurUnit || d.recurAmount == null) continue
    const until = d.recurEnd && d.recurEnd < now ? d.recurEnd : now
    const { dates, next } = occurrences(d.recurNext!, { every: d.recurEvery, unit: d.recurUnit }, until)
    await db.transaction(async (tx) => {
      const won = await tx
        .update(debts)
        .set({ recurNext: d.recurEnd && next > d.recurEnd ? null : next })
        .where(and(eq(debts.id, d.id), eq(debts.recurNext, d.recurNext!)))
        .returning({ id: debts.id })
      if (!won.length || !dates.length) return
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${debtInstallments.number}), 0)::int` }).from(debtInstallments).where(eq(debtInstallments.debtId, d.id))
      await tx.insert(debtItems).values(dates.map((date) => ({ debtId: d.id, description: d.recurLabel || "Ocorrência", quantity: 1, unitAmount: d.recurAmount!, date })))
      await tx.insert(debtInstallments).values(dates.map((date, i) => ({ debtId: d.id, number: max + 1 + i, amount: d.recurAmount!, dueOverride: date })))
    })
  }
}

// ---------- Escrita ----------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const scheduleInput = z.object({
  kind: z.enum(["FIXED_DAY", "AFTER_SALARY", "DATE", "NONE"]),
  day: z.number().int().min(1).max(31).nullish(),
  offsetDays: z.number().int().min(0).max(30).default(1),
  date: isoDate.nullish(),
})

const recurInput = z.object({
  every: z.number().int().min(1).max(52),
  unit: z.enum(["WEEK", "MONTH"]),
  label: z.string().trim().min(1).max(200),
  amount: z.number().positive().max(10_000_000),
  /** Próxima ocorrência a gerar sozinha; null = não gera mais. */
  next: isoDate.nullable(),
  end: isoDate.nullish(),
})

export const debtInput = z
  .object({
    id: z.number().int().positive().optional(),
    creditor: z.string().trim().min(1).max(120),
    relation: z.string().trim().max(60).nullish(),
    description: z.string().trim().max(500).nullish(),
    items: z
      .array(z.object({ description: z.string().trim().min(1).max(200), quantity: z.number().int().min(1).max(1000), unitAmount: z.number().positive().max(10_000_000), date: isoDate.nullish() }))
      .max(500),
    /**
     * LUMP = parcela única; INSTALLMENTS = `installments` parcelas; FLEX = sem parcelas, paga quando der;
     * RECUR = cada item datado é uma parcela e `recur` gera um item novo a cada período.
     */
    mode: z.enum(["LUMP", "INSTALLMENTS", "FLEX", "RECUR"]),
    installments: z.number().int().min(1).max(120).default(1),
    schedule: scheduleInput,
    recur: recurInput.nullish(),
    remindDaysBefore: z.number().int().min(0).max(30).nullable().default(1),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "RECUR") {
      if (!v.recur) ctx.addIssue({ code: "custom", message: "Informe a recorrência", path: ["recur"] })
      v.items.forEach((it, i) => it.date || ctx.addIssue({ code: "custom", message: "Informe a data do item", path: ["items", i, "date"] }))
      return
    }
    if (!v.items.length) ctx.addIssue({ code: "custom", message: "Inclua ao menos um item", path: ["items"] })
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
  if (v.mode === "FLEX" || v.mode === "RECUR" || v.schedule.kind === "NONE") return { scheduleKind: "NONE" as const, scheduleDay: null, scheduleDate: null, startMonth: null, salaryOffsetDays: v.schedule.offsetDays }
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Input = z.output<typeof debtInput>

function recurColumns(v: Input) {
  const r = v.mode === "RECUR" ? v.recur : null
  if (!r) return { recurEvery: null, recurUnit: null, recurLabel: null, recurAmount: null, recurNext: null, recurEnd: null }
  return { recurEvery: r.every, recurUnit: r.unit, recurLabel: r.label, recurAmount: r.amount, recurNext: r.end && r.next && r.next > r.end ? null : r.next, recurEnd: r.end ?? null }
}

const itemRows = (v: Input, debtId: number) => v.items.map((i) => ({ ...i, date: v.mode === "RECUR" ? i.date! : null, debtId }))

/** Recorrente: refaz as parcelas a partir dos itens datados, em ordem de data; as pagas ficam (casadas pela data). */
async function writeRecurRows(tx: Tx, debtId: number, v: Input) {
  const paid = await tx.select().from(debtInstallments).where(and(eq(debtInstallments.debtId, debtId), isNotNull(debtInstallments.paidOn)))
  const rows = recurRows(v.items.map((i) => ({ date: i.date!, amount: round2(i.quantity * i.unitAmount) })), paid)
  await tx.delete(debtInstallments).where(eq(debtInstallments.debtId, debtId))
  if (!rows.length) return
  await tx.insert(debtInstallments).values(
    rows.map((r, i) =>
      r.paid
        ? { debtId, number: i + 1, amount: r.paid.amount, paidOn: r.paid.paidOn, transactionId: r.paid.transactionId, dueOverride: r.paid.dueOverride }
        : { debtId, number: i + 1, amount: r.amount, dueOverride: r.date },
    ),
  )
}

/** Cria uma dívida com itens e parcelas. */
export async function createDebt(input: DebtInputValue) {
  const v = debtInput.parse(input)
  const salary = await loadSalary()
  const total = itemsTotal(v.items)
  const n = v.mode === "FLEX" || v.mode === "RECUR" ? 0 : v.mode === "LUMP" ? 1 : v.installments
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
        ...recurColumns(v),
      })
      .returning({ id: debts.id })
    if (v.items.length) await tx.insert(debtItems).values(itemRows(v, debt.id))
    if (v.mode === "RECUR") await writeRecurRows(tx, debt.id, v)
    else if (n > 0) await tx.insert(debtInstallments).values(splitAmount(total, n).map((amount, i) => ({ debtId: debt.id, number: i + 1, amount })))
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
    if (v.mode === "RECUR") {
      await tx
        .update(debts)
        .set({ creditor: v.creditor, relation: v.relation || null, description: v.description || null, remindDaysBefore: v.remindDaysBefore, ...scheduleColumns(v, salary, now, 1), ...recurColumns(v) })
        .where(eq(debts.id, id))
      await tx.delete(debtItems).where(eq(debtItems.debtId, id))
      if (v.items.length) await tx.insert(debtItems).values(itemRows(v, id))
      await writeRecurRows(tx, id, v)
      return
    }
    const insts = await tx.select().from(debtInstallments).where(eq(debtInstallments.debtId, id))
    const paid = insts.filter((i) => i.paidOn)
    const paidAmount = round2(paid.reduce((t, i) => t + i.amount, 0))
    const remaining = Math.max(0, round2(total - paidAmount))
    const lastPaid = Math.max(0, ...paid.map((i) => i.number))
    const n = v.mode === "FLEX" || remaining === 0 ? 0 : v.mode === "LUMP" ? 1 : v.installments
    const cols = scheduleColumns(v, salary, now, lastPaid + 1)
    await tx
      .update(debts)
      .set({ creditor: v.creditor, relation: v.relation || null, description: v.description || null, remindDaysBefore: v.remindDaysBefore, ...cols, ...recurColumns(v) })
      .where(eq(debts.id, id))
    await tx.delete(debtItems).where(eq(debtItems.debtId, id))
    await tx.insert(debtItems).values(itemRows(v, id))
    await tx.delete(debtInstallments).where(and(eq(debtInstallments.debtId, id), isNull(debtInstallments.paidOn)))
    if (n > 0) await tx.insert(debtInstallments).values(splitAmount(remaining, n).map((amount, i) => ({ debtId: id, number: lastPaid + 1 + i, amount })))
  })
}

/** Reparte o que falta pagar igualmente entre as parcelas em aberto (depois de pagamento parcial, a maior ou desfeito). */
async function reflow(tx: Pick<typeof db, "select" | "update" | "delete" | "insert">, debtId: number) {
  // Recorrente: cada parcela é o valor da sua ocorrência; nada a repartir
  const [debt] = await tx.select({ recurUnit: debts.recurUnit }).from(debts).where(eq(debts.id, debtId))
  if (debt?.recurUnit) return
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
    if (debt.scheduleKind === "NONE" && !debt.recurUnit && !(await hasOpenRows(tx, row.debtId))) await tx.delete(debtInstallments).where(eq(debtInstallments.id, row.id))
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
