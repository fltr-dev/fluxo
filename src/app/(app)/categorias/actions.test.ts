import { PGlite } from "@electric-sql/pglite"
import { eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, describe, expect, it, vi } from "vitest"
import * as schema from "@/db/schema"

// Arquivar/excluir com transações e sugestões das categorias padrão, em Postgres em memória.
const pg = new PGlite()
const testDb = drizzle(pg, { schema, casing: "snake_case" })
vi.mock("server-only", () => ({}))
vi.mock("@/db", () => ({ ...schema, db: testDb }))
vi.mock("@/auth", () => ({ requireUser: async () => ({ role: "owner" }) }))
vi.mock("next/cache", () => ({ refresh: () => {} }))

const { toggleArchived, retireCategory, addSuggestion } = await import("./actions")
const { missingDefaults } = await import("@/db/default-categories")

const form = (fields: Record<string, string | number>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v))
  return f
}
const cat = async (id: number) => (await testDb.select().from(schema.categories).where(eq(schema.categories.id, id)))[0]
const subOf = async (ids: number[]) => (await testDb.select().from(schema.transactions).where(inArray(schema.transactions.id, ids))).map((t) => [t.subcategoryId, t.categorySource])

let account: number
const addCat = async (name: string, parentId?: number) =>
  (await testDb.insert(schema.categories).values({ name, kind: "EXPENSE", parentId }).returning({ id: schema.categories.id }))[0].id
const addTx = async (subcategoryId: number) =>
  (await testDb.insert(schema.transactions).values({ accountId: account, date: "2026-11-01", amount: -10, description: "X", kind: "EXPENSE", subcategoryId, categorySource: "RULE" }).returning({ id: schema.transactions.id }))[0].id

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" })
  account = (await testDb.insert(schema.accounts).values({ name: "Carteira", type: "CASH", source: "MANUAL" }).returning({ id: schema.accounts.id }))[0].id
})

describe("arquivar e excluir", () => {
  it("não arquiva direto com transações; move para o destino e depois exclui", async () => {
    const p = await addCat("Serviços")
    const s = await addCat("Assessor", p)
    const dest = await addCat("Diversos", await addCat("Outros"))
    const t = await addTx(s)
    await testDb.insert(schema.categoryRules).values({ pattern: "XP", matchType: "CONTAINS", subcategoryId: s })

    await expect(toggleArchived(form({ id: p }))).rejects.toThrow(/transações/)
    await expect(retireCategory(form({ id: p, action: "delete", targetId: "" }))).rejects.toThrow(/Arquive/)

    await retireCategory(form({ id: p, action: "archive", targetId: dest }))
    expect((await cat(p)).archived).toBe(true)
    expect(await subOf([t])).toEqual([[dest, "RULE"]])
    expect((await testDb.select().from(schema.categoryRules))[0].subcategoryId).toBe(dest)

    await retireCategory(form({ id: p, action: "delete", targetId: "" }))
    expect(await cat(p)).toBeUndefined()
    expect(await cat(s)).toBeUndefined()
    expect(await subOf([t])).toEqual([[dest, "RULE"]])
  })

  it("sem destino a transação fica a categorizar e as regras param", async () => {
    const s = await addCat("Pet", await addCat("Casa"))
    const t = await addTx(s)
    const [rule] = await testDb.insert(schema.categoryRules).values({ pattern: "PET", matchType: "CONTAINS", subcategoryId: s }).returning()
    await retireCategory(form({ id: s, action: "archive", targetId: "" }))
    expect(await subOf([t])).toEqual([[null, "NONE"]])
    expect((await testDb.select().from(schema.categoryRules).where(eq(schema.categoryRules.id, rule.id)))[0].active).toBe(false)
    await toggleArchived(form({ id: s })) // reativa sem perguntar
    expect((await cat(s)).archived).toBe(false)
  })
})

describe("sugestões", () => {
  it("sugere só as padrão que faltam (sem caixa nem acento) e adiciona com subcategorias", async () => {
    await addCat("saude")
    const suggested = async () => missingDefaults(await testDb.select().from(schema.categories)).map((c) => c.name)
    expect(await suggested()).not.toContain("Saúde")
    expect(await suggested()).toContain("Serviços") // a do primeiro teste foi excluída

    await addSuggestion(form({ name: "Serviços" }))
    await addSuggestion(form({ name: "Serviços" })) // segundo clique não duplica
    const [p, ...more] = await testDb.select().from(schema.categories).where(eq(schema.categories.name, "Serviços"))
    expect(more).toHaveLength(0)
    expect(await testDb.select().from(schema.categories).where(eq(schema.categories.parentId, p.id))).toHaveLength(7)
    expect(await suggested()).not.toContain("Serviços")
  })
})
