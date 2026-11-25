import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, describe, expect, it, vi } from "vitest"
import * as schema from "@/db/schema"

// Categorizar → desfazer, regra aplicada ao salvar e subcategoria criada no seletor, em Postgres em memória.
const pg = new PGlite()
const testDb = drizzle(pg, { schema, casing: "snake_case" })
vi.mock("server-only", () => ({}))
vi.mock("@/db", () => ({ ...schema, db: testDb }))
vi.mock("@/auth", () => ({ requireUser: async () => ({ role: "owner" }) }))
vi.mock("next/cache", () => ({ refresh: () => {} }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
}))

const { setCategory, bulkUpdate, restoreCategories } = await import("./actions")
const { saveRule, saveRuleInPlace, previewRule } = await import("../regras/actions")
const { quickSubcategory } = await import("../categorias/actions")

const form = (fields: Record<string, string | number | (string | number)[]>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, String(x))
  return f
}
const tx = async (id: number) => (await testDb.select().from(schema.transactions).where(eq(schema.transactions.id, id)))[0]

let account: number, parent: number, taxi: number, food: number
const addTx = async (description: string, extra: Partial<typeof schema.transactions.$inferInsert> = {}) =>
  (await testDb.insert(schema.transactions).values({ accountId: account, date: "2026-10-21", amount: -12.7, description, kind: "EXPENSE", ...extra }).returning({ id: schema.transactions.id }))[0].id

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" })
  account = (await testDb.insert(schema.accounts).values({ name: "Nubank", type: "CREDIT_CARD", source: "MANUAL" }).returning({ id: schema.accounts.id }))[0].id
  const cat = async (name: string, parentId?: number) => (await testDb.insert(schema.categories).values({ name, kind: "EXPENSE", parentId, color: "#8b5cf6" }).returning({ id: schema.categories.id }))[0].id
  parent = await cat("Transporte")
  taxi = await cat("App e táxi", parent)
  food = await cat("Delivery", await cat("Alimentação"))
})

describe("desfazer categorização", () => {
  it("volta categoria, origem e sugestão da IA", async () => {
    const id = await addTx("99", { categorySource: "JEV", subcategoryId: food, suggestedSubcategoryId: taxi, suggestionConfidence: 0.7 })
    const before = await tx(id)
    const r = await setCategory(form({ id, subcategoryId: taxi }))
    expect((await tx(id)).categorySource).toBe("USER")
    await restoreCategories(r.undo)
    const after = await tx(id)
    expect([after.subcategoryId, after.categorySource, after.suggestedSubcategoryId, after.suggestionConfidence]).toEqual([before.subcategoryId, "JEV", taxi, 0.7])
  })

  it("em massa: desfaz todas", async () => {
    const ids = [await addTx("A"), await addTx("B")]
    const r = await bulkUpdate(form({ ids, op: "categorizar", subcategoryId: food }))
    expect(r?.message).toBe("2 transações categorizadas")
    await restoreCategories(r!.undo)
    for (const id of ids) expect((await tx(id)).subcategoryId).toBeNull()
  })
})

describe("parcelas", () => {
  const parcels = async (description: string, amount: number) => {
    const ids: number[] = []
    for (const n of [1, 2, 3])
      ids.push(await addTx(description, { amount, date: `2026-0${n}-06`, installmentNumber: n, totalInstallments: 3 }))
    return ids
  }

  it("categorizar uma parcela aplica a categoria a todas as parcelas da compra, e o desfazer volta todas", async () => {
    const ids = await parcels("EC *HARPERCOLLINS", -69.99)
    const other = await addTx("EC *HARPERCOLLINS", { amount: -69.99, date: "2026-02-06", installmentNumber: 1, totalInstallments: 3 }) // outra compra, um mês depois
    const r = await setCategory(form({ id: ids[1], subcategoryId: food }))
    expect(r.message).toBe("Categoria alterada em 3 parcelas")
    for (const id of ids) expect([(await tx(id)).subcategoryId, (await tx(id)).categorySource]).toEqual([food, "USER"])
    expect((await tx(other)).subcategoryId).toBeNull()
    await restoreCategories(r.undo)
    for (const id of ids) expect((await tx(id)).subcategoryId).toBeNull()
  })

  it("em massa: duas parcelas da mesma compra selecionadas não duplicam o desfazer", async () => {
    const ids = await parcels("LIVRARIA", -30)
    const r = await bulkUpdate(form({ ids: [ids[0], ids[2]], op: "categorizar", subcategoryId: taxi }))
    expect(r?.message).toBe("3 transações categorizadas")
    expect(r!.undo.map((u) => u.id).sort()).toEqual([...ids].sort())
    for (const id of ids) expect((await tx(id)).subcategoryId).toBe(taxi)
  })
})

describe("regra", () => {
  it("'Igual a' com aplicar às existentes recategoriza só o que casa e preserva a escolha do usuário", async () => {
    const hit = await addTx("99")
    const pop = await addTx("99 Pop")
    const mine = await addTx(" 99 ", { subcategoryId: food, categorySource: "USER" })
    const draft = { matchType: "EQUALS", pattern: "99", accountId: null, kind: "EXPENSE", minAmount: null, maxAmount: null, priority: 100, subcategoryId: taxi } as const
    const p = await previewRule(draft)
    expect([p.change, p.user]).toEqual([2, 1]) // hit e a "99" do primeiro teste (desfeita, voltou a Delivery/JEV)
    await expect(saveRule(form({ ...draft, kind: "EXPENSE", accountId: "", minAmount: "", maxAmount: "", apply: "on" }))).rejects.toThrow("redirect:/regras?aplicadas=2")
    expect((await tx(hit)).subcategoryId).toBe(taxi)
    expect((await tx(pop)).subcategoryId).toBeNull()
    expect((await tx(mine)).subcategoryId).toBe(food)
  })
})

describe("regra criada na tela de transações", () => {
  const ruleForm = (extra: Record<string, string>) => form({ matchType: "CONTAINS", pattern: "SEBO DO ZE", priority: 100, kind: "EXPENSE", accountId: "", minAmount: "", maxAmount: "", ...extra })

  it("salva e aplica sem redirecionar, devolvendo o aviso", async () => {
    const id = await addTx("SEBO DO ZE LIVROS")
    expect(await saveRuleInPlace(ruleForm({ subcategoryId: String(taxi), apply: "on" }))).toEqual({ message: "Regra criada · 1 transação recategorizada" })
    expect((await tx(id)).subcategoryId).toBe(taxi)
  })

  it("erro de validação volta como mensagem", async () => {
    expect(await saveRuleInPlace(ruleForm({ subcategoryId: "" }))).toEqual({ error: "Escolha a categoria" })
  })
})

describe("nova subcategoria pelo seletor", () => {
  it("cria na categoria com a cor dela e reaproveita nome igual", async () => {
    const a = await quickSubcategory(parent, "Pedágio")
    const b = await quickSubcategory(parent, "pedágio")
    expect(b.id).toBe(a.id)
    const [row] = await testDb.select().from(schema.categories).where(eq(schema.categories.id, a.id))
    expect([row.parentId, row.color, row.kind]).toEqual([parent, "#8b5cf6", "EXPENSE"])
    await expect(quickSubcategory(taxi, "X")).rejects.toThrow("Categoria inválida")
  })
})
