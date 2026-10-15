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

const { listTransactions, limitsWithUsage, netWorth, parseFilters } = await import("./queries")

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

  it("queries com sql`` cru continuam parametrizadas", async () => {
    const period = { from: "2025-01-01'; drop table transactions; --", to: "2025-01-31" }
    await expect(limitsWithUsage(period)).rejects.toThrow() // data inválida vira erro de tipo, nunca SQL executado
    await netWorth(["2025-01"])
    expect(await tableCount()).toBe(3)
  })
})
