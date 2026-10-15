import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, describe, expect, it, vi } from "vitest"
import * as schema from "@/db/schema"

// Postgres real em memória com as migrations do projeto; as queries de produção rodam sobre ele.
const pg = new PGlite()
const testDb = drizzle(pg, { schema, casing: "snake_case" })
vi.mock("server-only", () => ({}))
vi.mock("@/db", () => ({ ...schema, db: testDb }))

const { accountBalanceSeries, dailyTotals, listTransactions, limitsWithUsage, netWorth, parseFilters } = await import("./queries")

const PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE transactions; --",
  "x'); DELETE FROM transactions; --",
  "' UNION SELECT NULL,NULL,NULL --",
  "1 OR 1=1",
  "\\'; select pg_sleep(5); --",
]

const tableCount = async () => (await pg.query<{ n: number }>("select count(*)::int as n from transactions")).rows[0].n

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" })
  const [acc] = await testDb.insert(schema.accounts).values({ name: "Conta", type: "CHECKING", source: "MANUAL" }).returning()
  await testDb.insert(schema.transactions).values([
    { accountId: acc.id, date: "2025-01-10", amount: -10, description: "Mercado", kind: "EXPENSE" },
    { accountId: acc.id, date: "2025-01-11", amount: -20, description: "Padaria", kind: "EXPENSE" },
    { accountId: acc.id, date: "2025-01-12", amount: -5, description: PAYLOADS[1], kind: "EXPENSE" },
  ])
})

describe("SQL injection", () => {
  it.each(PAYLOADS)("busca por texto (q) trata %j como dado, não como SQL", async (payload) => {
    const f = parseFilters({ q: payload, periodo: "personalizado", de: "2025-01-01", ate: "2025-01-31" })
    const { rows } = await listTransactions(f)
    // só casa a linha cuja descrição contém literalmente o payload; nenhum payload devolve a tabela inteira
    expect(rows.every((r) => r.tx.description.includes(payload))).toBe(true)
    expect(await tableCount()).toBe(3)
  })

  it.each(PAYLOADS)("filtros numéricos/data da URL rejeitam %j", (payload) => {
    const f = parseFilters({ conta: payload, categoria: payload, de: payload, ate: payload })
    expect(f.accountId).toBeUndefined()
    expect(f.categoryId).toBeUndefined()
    expect(f.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(f.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it.each(PAYLOADS)("lista de categorias do calendário (categorias=) rejeita %j", async (payload) => {
    const f = parseFilters({ categorias: payload, periodo: "custom", de: "2025-01-01", ate: "2025-01-31" })
    expect(f.categoryIds).toBeUndefined()
    expect((await dailyTotals(f)).size).toBe(3)
    expect(await tableCount()).toBe(3)
  })

  it("queries com sql`` cru continuam parametrizadas", async () => {
    const period = { from: "2025-01-01'; drop table transactions; --", to: "2025-01-31" }
    await expect(limitsWithUsage(period)).rejects.toThrow() // data inválida vira erro de tipo, nunca SQL executado
    await netWorth(["2025-01"])
    expect(await tableCount()).toBe(3)
  })

  it("histórico de saldo da conta é parametrizado", async () => {
    expect(await accountBalanceSeries(1, 12)).toEqual([])
    await expect(accountBalanceSeries("1; drop table transactions" as never, 12)).rejects.toThrow()
    expect(await tableCount()).toBe(3)
  })
})

describe("totais por dia (calendário)", () => {
  const f = (extra: Record<string, string> = {}) => parseFilters({ periodo: "custom", de: "2025-01-01", ate: "2025-01-31", ...extra })

  it("soma receitas e despesas por dia, sem transferências nem ignoradas", async () => {
    const [acc] = await testDb.select().from(schema.accounts)
    const [cat] = await testDb.insert(schema.categories).values({ name: "Mercado", kind: "EXPENSE" }).returning()
    const [sub] = await testDb.insert(schema.categories).values({ name: "Feira", kind: "EXPENSE", parentId: cat.id }).returning()
    await testDb.insert(schema.transactions).values([
      { accountId: acc.id, date: "2025-01-20", amount: -40, description: "A", kind: "EXPENSE", subcategoryId: sub.id },
      { accountId: acc.id, date: "2025-01-20", amount: -10, description: "B", kind: "EXPENSE", subcategoryId: sub.id },
      { accountId: acc.id, date: "2025-01-20", amount: 100, description: "C", kind: "INCOME" },
      { accountId: acc.id, date: "2025-01-20", amount: -500, description: "transferência", kind: "TRANSFER" },
      { accountId: acc.id, date: "2025-01-21", amount: -7, description: "ignorada", kind: "EXPENSE", ignored: true },
    ])
    const day = (await dailyTotals(f())).get("2025-01-20")
    expect(day).toMatchObject({ income: 100, expense: 50, count: 3 })
    expect((await dailyTotals(f())).has("2025-01-21")).toBe(false)
  })

  it("filtra por várias categorias (a categoria inclui as subcategorias) e por conta", async () => {
    const cats = await testDb.select().from(schema.categories)
    const parent = cats.find((c) => c.name === "Mercado")!
    const child = cats.find((c) => c.name === "Feira")!
    for (const ids of [`${parent.id}`, `${child.id}`, `${parent.id},${child.id}`, `999999,${parent.id}`]) {
      expect((await dailyTotals(f({ categorias: ids }))).get("2025-01-20"), ids).toMatchObject({ expense: 50, income: 0, count: 2 })
    }
    expect((await dailyTotals(f({ categorias: "999999" }))).size).toBe(0)
    const [acc] = await testDb.select().from(schema.accounts)
    expect((await dailyTotals(f({ conta: String(acc.id) }))).get("2025-01-20")?.count).toBe(3)
    expect((await dailyTotals(f({ conta: "999999" }))).size).toBe(0)
  })

  it("parseFilters: lista de categorias só aceita inteiros positivos, sem repetição", () => {
    expect(f({ categorias: "3,7,3,12" }).categoryIds).toEqual([3, 7, 12])
    expect(f({ categorias: "3,x,-1,0,2.5,8" }).categoryIds).toEqual([3, 8])
    expect(f({ categorias: "" }).categoryIds).toBeUndefined()
    expect(f({ categorias: Array.from({ length: 300 }, (_, i) => i + 1).join(",") }).categoryIds).toHaveLength(100)
  })
})
