import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, describe, expect, it, vi } from "vitest"
import * as schema from "@/db/schema"
import { addDays, addMonths, monthOf, today } from "./domain/dates"

// Postgres real em memória com as migrations: criar, pagar, refazer parcelas e vincular transações de dívidas.
const pg = new PGlite()
const testDb = drizzle(pg, { schema, casing: "snake_case" })
vi.mock("server-only", () => ({}))
vi.mock("@/db", () => ({ ...schema, db: testDb }))

const debtsLib = await import("./debts")
const now = today()
const ym = monthOf(now)

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" })
  const [acc] = await testDb.insert(schema.accounts).values({ name: "Itaú", type: "CHECKING", source: "MANUAL" }).returning({ id: schema.accounts.id })
  const [parent] = await testDb.insert(schema.categories).values({ name: "Salário", kind: "INCOME" }).returning({ id: schema.categories.id })
  const [sub] = await testDb.insert(schema.categories).values({ name: "Salário", kind: "INCOME", parentId: parent.id }).returning({ id: schema.categories.id })
  await testDb.insert(schema.transactions).values([
    { accountId: acc.id, date: `${addMonths(ym, -1)}-08`, amount: 8000, description: "SALARIO", kind: "INCOME", subcategoryId: sub.id },
    { accountId: acc.id, date: `${addMonths(ym, -2)}-08`, amount: 8000, description: "SALARIO", kind: "INCOME", subcategoryId: sub.id },
    { accountId: acc.id, date: addDays(now, -2), amount: -300, description: "PIX ENVIADO JOAO SILVA", kind: "EXPENSE" },
    { accountId: acc.id, date: addDays(now, -2), amount: -300, description: "MERCADO", kind: "EXPENSE" },
  ])
})

const joao = {
  creditor: "João Silva",
  relation: "Amigo",
  items: [{ description: "Passagens", quantity: 1, unitAmount: 1500 }],
  mode: "INSTALLMENTS" as const,
  installments: 5,
  schedule: { kind: "FIXED_DAY" as const, day: 7, offsetDays: 1 },
  remindDaysBefore: 1,
}

const find = async (id: number) => (await debtsLib.loadDebts()).views.find((v) => v.debt.id === id)!

describe("dívidas", () => {
  it("detecta o dia do salário pela categoria", async () => {
    const { salary } = await debtsLib.loadDebts()
    expect(salary.typicalDay).toBe(8)
  })

  it("cria dívida parcelada: itens, parcelas iguais e vencimento no dia fixo", async () => {
    const id = await debtsLib.createDebt(joao)
    const v = await find(id)
    expect(v.ev).toMatchObject({ total: 1500, remaining: 1500, paid: 0 })
    expect(v.ev.rows).toHaveLength(5)
    expect(v.ev.rows.every((r) => r.amount === 300)).toBe(true)
    expect(v.ev.next?.due?.slice(8)).toBe("07")
    expect(v.ev.next!.due! >= now).toBe(true)
  })

  it("paga uma parcela vinculando a transação sugerida", async () => {
    const id = await debtsLib.createDebt({ ...joao, creditor: "João Pix" })
    const v = await find(id)
    const row = v.ev.rows[0]
    const [match] = await debtsLib.matchPayments({ amount: row.amount, due: addDays(now, -1) }, "João Pix")
    expect(match.description).toBe("PIX ENVIADO JOAO SILVA") // o nome do credor sobe a transação certa
    await debtsLib.payInstallment({ debtId: id, installmentId: row.id, amount: 300, date: now, transactionId: match.id })
    const after = await find(id)
    expect(after.ev).toMatchObject({ paid: 300, remaining: 1200, paidCount: 1 })
    // a transação já vinculada não aparece mais como sugestão
    expect((await debtsLib.matchPayments({ amount: 300, due: addDays(now, -1) }, "João Pix")).map((m) => m.id)).not.toContain(match.id)
  })

  it("pagamento diferente redistribui o restante; desfazer volta ao normal", async () => {
    const id = await debtsLib.createDebt({ ...joao, creditor: "Redistribui", items: [{ description: "x", quantity: 1, unitAmount: 1000 }], installments: 4 })
    const v = await find(id)
    await debtsLib.payInstallment({ debtId: id, installmentId: v.ev.rows[0].id, amount: 400, date: now })
    let a = await find(id)
    expect(a.ev.remaining).toBe(600)
    expect(a.ev.rows.filter((r) => !r.paidOn).map((r) => r.amount)).toEqual([200, 200, 200])
    await debtsLib.undoPayment(v.ev.rows[0].id)
    a = await find(id)
    expect(a.ev.remaining).toBe(1000)
    expect(a.ev.rows.map((r) => r.amount)).toEqual([250, 250, 250, 250])
  })

  it("pagamento livre: cada pagamento vira uma linha e quita no fim", async () => {
    const id = await debtsLib.createDebt({ creditor: "Mãe", items: [{ description: "Carro", quantity: 1, unitAmount: 1000 }], mode: "FLEX", installments: 1, schedule: { kind: "NONE", offsetDays: 1 }, remindDaysBefore: null })
    await debtsLib.payInstallment({ debtId: id, amount: 200, date: now })
    expect((await find(id)).ev).toMatchObject({ paid: 200, remaining: 800, status: "undated" })
    await debtsLib.payInstallment({ debtId: id, amount: 800, date: now })
    expect((await find(id)).ev.status).toBe("paid")
    // desfazer o último pagamento reabre o saldo
    const last = (await find(id)).ev.rows.at(-1)!
    await debtsLib.undoPayment(last.id)
    expect((await find(id)).ev).toMatchObject({ remaining: 800, paidCount: 1 })
  })

  it("não paga duas vezes a mesma parcela", async () => {
    const id = await debtsLib.createDebt({ ...joao, creditor: "Duplo" })
    const row = (await find(id)).ev.rows[0]
    await debtsLib.payInstallment({ debtId: id, installmentId: row.id, amount: 300, date: now })
    await expect(debtsLib.payInstallment({ debtId: id, installmentId: row.id, amount: 300, date: now })).rejects.toThrow("já foi paga")
  })

  it("editar refaz só as parcelas em aberto e mantém as pagas", async () => {
    const id = await debtsLib.createDebt({ ...joao, creditor: "Edita" })
    const v = await find(id)
    await debtsLib.payInstallment({ debtId: id, installmentId: v.ev.rows[0].id, amount: 300, date: now })
    await debtsLib.updateDebt({ ...joao, id, creditor: "Edita", items: [{ description: "Passagens", quantity: 1, unitAmount: 1800 }], installments: 3 })
    const a = await find(id)
    expect(a.ev).toMatchObject({ total: 1800, paid: 300, remaining: 1500, paidCount: 1 })
    expect(a.ev.rows.filter((r) => !r.paidOn).map((r) => r.amount)).toEqual([500, 500, 500])
    expect(a.ev.rows.map((r) => r.number)).toEqual([1, 2, 3, 4])
    // as datas continuam a sequência mensal depois da parcela paga
    const dues = a.ev.rows.map((r) => r.due!)
    expect(dues).toEqual([...dues].sort())
  })

  it("valida a entrada", async () => {
    await expect(debtsLib.createDebt({ ...joao, creditor: "  " })).rejects.toThrow()
    await expect(debtsLib.createDebt({ ...joao, schedule: { kind: "FIXED_DAY", offsetDays: 1 } })).rejects.toThrow()
    await expect(debtsLib.createDebt({ ...joao, items: [] })).rejects.toThrow()
  })

  it("arquivar tira da lista; excluir apaga em cascata", async () => {
    const id = await debtsLib.createDebt({ ...joao, creditor: "Some" })
    await debtsLib.archiveDebt(id)
    expect((await debtsLib.loadDebts()).views.find((v) => v.debt.id === id)).toBeUndefined()
    await debtsLib.deleteDebt(id)
    expect(await testDb.select().from(schema.debtInstallments).where(eq(schema.debtInstallments.debtId, id))).toHaveLength(0)
  })
})

describe("dívida recorrente", () => {
  // Psicólogo: sessão a cada 2 semanas desde 6 semanas atrás; uma remarcada à mão, a 1ª já paga
  const start = addDays(now, -42)
  const psi = (items: { date: string }[], next: string | null) => ({
    creditor: "Dra. Lia",
    items: items.map((i) => ({ description: "Sessão", quantity: 1, unitAmount: 200, date: i.date })),
    mode: "RECUR" as const,
    schedule: { kind: "NONE" as const, offsetDays: 1 },
    recur: { every: 2, unit: "WEEK" as const, label: "Sessão", amount: 200, next, end: null },
    remindDaysBefore: 1,
  })

  it("cada item vira parcela na sua data; a próxima entra sozinha quando a data chega", async () => {
    const dates = [start, addDays(start, 16), addDays(start, 28)] // a 2ª remarcada (+2 dias)
    const id = await debtsLib.createDebt(psi(dates.map((date) => ({ date })), addDays(start, 42)))
    const v = await find(id)
    // a 4ª ocorrência (hoje) foi gerada na carga
    expect(v.items.map((i) => i.date)).toEqual([...dates, now])
    expect(v.ev.rows.map((r) => [r.due, r.amount])).toEqual([...dates, now].map((d) => [d, 200]))
    expect(v.ev.total).toBe(800)
    expect(v.debt.recurNext).toBe(addDays(now, 14))
    // carregar de novo não duplica
    expect((await find(id)).items).toHaveLength(4)
  })

  it("editar mantém a parcela paga casada pela data e não reparte valores", async () => {
    const id = await debtsLib.createDebt(psi([{ date: start }, { date: addDays(start, 14) }], addDays(start, 28)))
    let v = await find(id)
    await debtsLib.payInstallment({ debtId: id, installmentId: v.ev.rows[0].id, amount: 200, date: start })
    v = await find(id)
    expect(v.ev.rows.map((r) => r.amount)).toEqual([200, 200, 200, 200])
    // remove a sessão de 14 dias depois do início (cancelada) e salva
    const keep = v.items.filter((i) => i.date !== addDays(start, 14)).map((i) => ({ date: i.date! }))
    await debtsLib.updateDebt({ ...psi(keep, v.debt.recurNext), id })
    v = await find(id)
    expect(v.ev.rows).toHaveLength(3)
    expect(v.ev.rows[0]).toMatchObject({ due: start, paidOn: start })
    expect(v.ev).toMatchObject({ total: 600, paid: 200, remaining: 400 })
  })

  it("com data final, para de gerar depois dela", async () => {
    const id = await debtsLib.createDebt({ ...psi([], start), recur: { every: 2, unit: "WEEK", label: "Sessão", amount: 200, next: start, end: addDays(start, 20) } })
    const v = await find(id)
    expect(v.items.map((i) => i.date)).toEqual([start, addDays(start, 14)])
    expect(v.debt.recurNext).toBeNull()
  })
})
