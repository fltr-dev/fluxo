import { AsyncLocalStorage } from "node:async_hooks"
import { drizzle } from "drizzle-orm/node-postgres"
import { cache } from "react"
import { Pool } from "pg"
import { auth } from "@/auth"
import { demoClient } from "./demo"
import * as schema from "./schema"

// Reaproveita o pool entre hot reloads do dev server
const g = globalThis as unknown as { pool?: Pool }
const realPool = () =>
  (g.pool ??= (() => {
    const p = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10_000 })
    // O servidor (Neon) derruba conexões ociosas; sem este listener o erro do cliente ocioso derruba o processo
    p.on("error", (e) => console.error("pg pool:", e.message))
    return p
  })())

const sessionRole = cache(async () => {
  try {
    return (await auth())?.user?.role
  } catch {
    return undefined
  }
})

const realScope = new AsyncLocalStorage<true>()

/** Roda `fn` no banco real sem sessão (cron). Só chamar depois de autenticar o chamador. */
export const asOwner = <T>(fn: () => Promise<T>) => realScope.run(true, fn)

/**
 * Falha fechada: só a sessão "owner" (ou o escopo `asOwner`) alcança o banco real. Qualquer outra
 * coisa, inclusive erro ao ler a sessão, cai na demonstração (em memória) e nunca nos dados reais.
 */
async function target() {
  return realScope.getStore() || (await sessionRole()) === "owner" ? realPool() : demoClient
}

// drizzle só reconhece "Pool" pelo nome da classe (para abrir conexão dedicada em transações)
class RoutedPool {
  async query(...args: unknown[]) {
    return (await target()).query(...(args as [string]))
  }
  async connect() {
    return (await target()).connect()
  }
}

export const db = drizzle(new RoutedPool() as unknown as Pool, { schema, casing: "snake_case" })
export * from "./schema"
