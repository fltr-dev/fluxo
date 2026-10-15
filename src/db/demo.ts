import path from "node:path"
import { PGlite, types } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { seedDemo } from "./demo-seed"
import * as schema from "./schema"

// Banco da demonstração: Postgres embutido (PGlite) em memória, criado e populado com os dados
// fictícios no primeiro acesso de cada instância. Não existe nenhuma conexão externa.

const g = globalThis as unknown as { demoDb?: Promise<PGlite> }

function open() {
  return (g.demoDb ??= (async () => {
    const pg = new PGlite()
    const db = drizzle(pg, { schema, casing: "snake_case" })
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") })
    await seedDemo(db)
    return pg
  })().catch((e) => {
    g.demoDb = undefined
    throw e
  }))
}

// Datas e arrays voltam como texto, como no driver do node-postgres: o Drizzle faz a conversão
const asText = (v: string) => v
const PARSERS = { [types.TIMESTAMP]: asText, [types.TIMESTAMPTZ]: asText, [types.INTERVAL]: asText, [types.DATE]: asText, 1231: asText, 1115: asText, 1185: asText, 1187: asText, 1182: asText }

type Config = string | { text: string; rowMode?: string }

/** Mesma interface de `query`/`connect` do Pool do node-postgres, que é o que o Drizzle usa. */
export const demoClient = {
  async query(config: Config, params?: unknown[]) {
    const pg = await open()
    const { text, rowMode } = typeof config === "string" ? { text: config, rowMode: undefined } : config
    const r = await pg.query(text, params, { rowMode: rowMode === "array" ? "array" : "object", parsers: PARSERS })
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length, fields: r.fields }
  },
  async connect() {
    return { query: demoClient.query, release() {} }
  },
}
