import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import * as schema from "@/db/schema"
import { checkOwner, credentialVersion, hashPassword, readOwnerName, readStored, saveOwnerName, saveStored, verifyPassword } from "./credentials"

// Postgres real em memória com as migrations do projeto (inclui a tabela app_credentials)
const pg = new PGlite()
const db = drizzle(pg, { schema, casing: "snake_case" }) as never

beforeAll(async () => {
  await migrate(drizzle(pg, { schema, casing: "snake_case" }), { migrationsFolder: "./drizzle" })
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await pg.exec("delete from app_credentials")
})

describe("hash de senha", () => {
  it("guarda scrypt com sal único e confere certo/errado", async () => {
    const a = await hashPassword("senha-forte-123")
    const b = await hashPassword("senha-forte-123")
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/)
    expect(a).not.toContain("senha-forte-123")
    expect(a).not.toBe(b) // sal diferente a cada hash
    expect(await verifyPassword("senha-forte-123", a)).toBe(true)
    expect(await verifyPassword("senha-forte-124", a)).toBe(false)
    expect(await verifyPassword("", a)).toBe(false)
    expect(await verifyPassword("x", "lixo")).toBe(false)
    expect(await verifyPassword("x", "md5$1$2$3$4$5")).toBe(false)
  })
})

describe("login do dono", () => {
  it("sem login salvo vale OWNER_USER/OWNER_PASSWORD (versão 0)", async () => {
    vi.stubEnv("OWNER_USER", "dono")
    vi.stubEnv("OWNER_PASSWORD", "da-env-123")
    expect(await readStored(db)).toBeNull()
    expect(await checkOwner(db, "dono", "da-env-123")).toBe(0)
    expect(await checkOwner(db, "dono", "outra")).toBeNull()
    expect(await checkOwner(db, "outro", "da-env-123")).toBeNull()
    expect(await credentialVersion(db)).toBe(0)
  })
  it("sem variáveis e sem login salvo ninguém entra", async () => {
    vi.stubEnv("OWNER_USER", "")
    vi.stubEnv("OWNER_PASSWORD", "")
    expect(await checkOwner(db, "", "")).toBeNull()
    expect(await checkOwner(db, "dono", "x")).toBeNull()
  })
  it("depois de salvo, só o banco vale e as variáveis de ambiente deixam de funcionar", async () => {
    vi.stubEnv("OWNER_USER", "dono")
    vi.stubEnv("OWNER_PASSWORD", "da-env-123")
    await saveStored(db, { username: "fernando", password: "nova-senha-123" })
    const stored = await readStored(db)
    expect(stored?.username).toBe("fernando")
    expect(stored?.passwordHash).not.toContain("nova-senha-123")
    const version = await checkOwner(db, "fernando", "nova-senha-123")
    expect(version).toBe(stored!.updatedAt.getTime())
    expect(version).toBeGreaterThan(0)
    expect(await checkOwner(db, "dono", "da-env-123")).toBeNull() // senha antiga morreu
    expect(await checkOwner(db, "fernando", "da-env-123")).toBeNull()
    expect(await checkOwner(db, "dono", "nova-senha-123")).toBeNull()
    expect(await checkOwner(db, "fernando", "errada")).toBeNull()
  })
  it("trocar de novo atualiza a linha única e muda a versão (encerra sessões antigas)", async () => {
    await saveStored(db, { username: "a", password: "primeira-senha-1" })
    const v1 = await credentialVersion(db)
    await new Promise((r) => setTimeout(r, 5))
    await saveStored(db, { username: "b", password: "segunda-senha-2" })
    const { rows } = await pg.query<{ n: number }>("select count(*)::int as n from app_credentials")
    expect(rows[0].n).toBe(1)
    expect(await credentialVersion(db)).toBeGreaterThan(v1)
    expect(await checkOwner(db, "a", "primeira-senha-1")).toBeNull()
    expect(await checkOwner(db, "b", "segunda-senha-2")).not.toBeNull()
  })
  it("tabela ainda não migrada = sem login salvo (a migração roda depois do deploy)", async () => {
    const empty = new PGlite()
    const d = drizzle(empty, { schema, casing: "snake_case" }) as never
    vi.stubEnv("OWNER_USER", "dono")
    vi.stubEnv("OWNER_PASSWORD", "da-env-123")
    expect(await readStored(d)).toBeNull()
    expect(await checkOwner(d, "dono", "da-env-123")).toBe(0)
  })
  it("nome de exibição: salva, limpa e não mexe na versão do login (não encerra sessões)", async () => {
    await saveStored(db, { username: "fernando", password: "senha-forte-123" })
    const v = await credentialVersion(db)
    expect(await readOwnerName(db)).toBeNull()
    await saveOwnerName(db, "  Fernando  ")
    expect(await readOwnerName(db)).toBe("Fernando")
    await saveOwnerName(db, "   ")
    expect(await readOwnerName(db)).toBeNull()
    expect(await credentialVersion(db)).toBe(v)
    const empty = drizzle(new PGlite(), { schema, casing: "snake_case" }) as never
    expect(await readOwnerName(empty)).toBeNull() // tabela ainda não migrada
  }, 20_000)
  it("qualquer outro erro do banco propaga (o login falha fechado, nunca cai nas variáveis de ambiente)", async () => {
    const broken = { select: () => { throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }) } } as never
    await expect(readStored(broken)).rejects.toThrow("connection refused")
  })
})
