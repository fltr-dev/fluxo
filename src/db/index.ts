import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// Reaproveita o pool entre hot reloads do dev server
const g = globalThis as unknown as { pool?: Pool }
const pool = (g.pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10_000 }))
// O servidor (Neon) derruba conexões ociosas; sem este listener o erro do cliente ocioso derruba o processo
pool.on("error", (e) => console.error("pg pool:", e.message))

export const db = drizzle(pool, { schema, casing: "snake_case" })
export * from "./schema"
