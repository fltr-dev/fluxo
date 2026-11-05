import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, describe, expect, it, vi } from "vitest"
import * as schema from "@/db/schema"

// Editar conta como o formulário real envia (inclusive as chaves $ACTION_* que o Next acrescenta), em Postgres em memória.
const pg = new PGlite()
const testDb = drizzle(pg, { schema, casing: "snake_case" })
vi.mock("server-only", () => ({}))
vi.mock("@/db", () => ({ ...schema, db: testDb }))
vi.mock("@/auth", () => ({ requireUser: async () => ({ role: "owner" }) }))
vi.mock("@/lib/sync", () => ({ runSync: async () => {} }))
vi.mock("next/cache", () => ({ refresh: () => {} }))

const { updateAccount, createManualAccount } = await import("./actions")

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  f.set("$ACTION_REF_1", "")
  f.set("$ACTION_1:0", '{"id":"abc","bound":"$@1"}')
  f.set("$ACTION_KEY", "k0")
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const get = async (id: number) => (await testDb.select().from(schema.accounts).where(eq(schema.accounts.id, id)))[0]

let pluggy: number, manual: number, card: number
beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" })
  const rows = await testDb
    .insert(schema.accounts)
    .values([
      { name: "Conta Corrente", type: "CHECKING", source: "PLUGGY", pluggyId: "p1", balance: 100 },
      { name: "Carteira", type: "CASH", source: "MANUAL", openingBalance: 50 },
      { name: "Cartão", type: "CREDIT_CARD", source: "MANUAL", creditLimit: 1000, billDueDate: "2026-11-10" },
    ])
    .returning({ id: schema.accounts.id })
  ;[pluggy, manual, card] = rows.map((r) => r.id)
  await testDb.insert(schema.transactions).values({ accountId: manual, date: "2026-11-01", amount: -20, description: "PADARIA", kind: "EXPENSE" })
})

describe("updateAccount", () => {
  it("conta conectada: o que o formulário envia (banco e cor vazios, sem saldo inicial)", async () => {
    await updateAccount(form({ id: String(pluggy), next: "/contas/1", name: "Corrente Itaú", bank: "", color: "", type: "CHECKING" }))
    expect(await get(pluggy)).toMatchObject({ name: "Corrente Itaú", bank: null, color: null, archived: false, isEmergencyReserve: false, balance: 100 })
  })

  it("conta conectada ignora saldo inicial e limite enviados à mão", async () => {
    await updateAccount(form({ id: String(pluggy), name: "X", type: "CREDIT_CARD", openingBalance: "999", creditLimit: "5", billDueDate: "2026-12-01", bank: "itau", color: "#ff0000", archived: "on", isEmergencyReserve: "on" }))
    expect(await get(pluggy)).toMatchObject({ type: "CREDIT_CARD", openingBalance: 0, creditLimit: null, billDueDate: null, bank: "itau", color: "#ff0000", archived: true, isEmergencyReserve: true })
  })

  it("conta manual: saldo inicial recalcula o saldo", async () => {
    await updateAccount(form({ id: String(manual), name: "Carteira", type: "CASH", openingBalance: "200", bank: "none", color: "" }))
    expect(await get(manual)).toMatchObject({ openingBalance: 200, balance: 180, bank: "none" })
  })

  it("cartão manual: limite e vencimento; vazio volta a null", async () => {
    await updateAccount(form({ id: String(card), name: "Cartão", type: "CREDIT_CARD", openingBalance: "0", creditLimit: "2500.50", billDueDate: "2026-12-15", bank: "nubank", color: "" }))
    expect(await get(card)).toMatchObject({ creditLimit: 2500.5, billDueDate: "2026-12-15" })
    await updateAccount(form({ id: String(card), name: "Cartão", type: "CREDIT_CARD", openingBalance: "0", creditLimit: "", billDueDate: "", bank: "", color: "" }))
    expect(await get(card)).toMatchObject({ creditLimit: null, billDueDate: null })
  })

  it("recusa dados inválidos sem gravar nada", async () => {
    const before = await get(manual)
    await expect(updateAccount(form({ id: String(manual), name: "  ", type: "CASH", bank: "", color: "" }))).rejects.toThrow()
    await expect(updateAccount(form({ id: String(manual), name: "Ok", type: "CASH", bank: "banco-inventado", color: "" }))).rejects.toThrow()
    await expect(updateAccount(form({ id: String(manual), name: "Ok", type: "CASH", bank: "", color: "red" }))).rejects.toThrow()
    await expect(updateAccount(form({ id: String(manual), name: "Ok", type: "CASH", bank: "", color: "", creditLimit: "-1" }))).rejects.toThrow()
    expect(await get(manual)).toEqual(before)
  })

  it("conta inexistente", async () => {
    await expect(updateAccount(form({ id: "99999", name: "X", type: "CASH", bank: "", color: "" }))).rejects.toThrow("Conta não encontrada")
  })
})

describe("createManualAccount", () => {
  it("cria com saldo inicial", async () => {
    await createManualAccount(form({ name: "Poupança", type: "SAVINGS_INVESTMENT", openingBalance: "300", bank: "", color: "" }))
    const [acc] = await testDb.select().from(schema.accounts).where(eq(schema.accounts.name, "Poupança"))
    expect(acc).toMatchObject({ source: "MANUAL", openingBalance: 300, balance: 300 })
  })
})
