import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ensureDefaultCategories } from "./default-categories"
import * as schema from "./schema"
import { SEED_PLUGGY_MAP } from "./seed-data"

const pg = new PGlite()
const db = drizzle(pg, { schema, casing: "snake_case" })
const count = async (table: string) => (await pg.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" })
})
beforeEach(async () => {
  await pg.exec("delete from pluggy_category_map; delete from categories; delete from app_state")
})

describe("categorias padrão na subida", () => {
  it("cria uma vez só, com o mapa da Pluggy, e não recria depois de apagadas", async () => {
    await ensureDefaultCategories(db)
    const created = await count("categories")
    expect(created).toBeGreaterThan(0)
    expect(await count("pluggy_category_map")).toBe(Object.keys(SEED_PLUGGY_MAP).length)

    await ensureDefaultCategories(db)
    expect(await count("categories")).toBe(created) // não duplica

    await pg.exec("delete from categories")
    await ensureDefaultCategories(db)
    expect(await count("categories")).toBe(0) // o usuário apagou tudo: não volta
  })

  it("instalação que já tem categorias só ganha a marca", async () => {
    await pg.exec("insert into categories (name, kind) values ('Minha', 'EXPENSE')")
    await ensureDefaultCategories(db)
    expect(await count("categories")).toBe(1)
    await pg.exec("delete from categories")
    await ensureDefaultCategories(db)
    expect(await count("categories")).toBe(0)
  })
})
