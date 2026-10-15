import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { eq } from "drizzle-orm"
import type { db as appDb } from "@/db"
import { appCredentials } from "@/db/schema"

// Login do dono. Sem linha em `app_credentials`, vale OWNER_USER/OWNER_PASSWORD do ambiente; depois que o dono
// altera o login em Configurações › Conta, só a linha do banco vale (as variáveis de ambiente deixam de funcionar).
// A senha é guardada como hash scrypt com sal próprio.

type Db = typeof appDb

export const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest())

const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 64

const derive = (password: string, salt: Buffer, n = N, r = R, p = P) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 256 * n * r }, (e, key) => (e ? reject(e) : resolve(key))),
  )

/** "scrypt$N$r$p$sal$hash" (base64), com tudo o que a verificação precisa. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt)
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$")
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split("$")
  if (alg !== "scrypt" || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64")
  const key = await derive(password, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p))
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/** Tabela ainda não migrada (42P01): trata como "sem login salvo", para a migração poder rodar depois do deploy. */
const missingTable = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === "42P01" || err?.cause?.code === "42P01"
}

export async function readStored(d: Db) {
  try {
    const [row] = await d.select().from(appCredentials).where(eq(appCredentials.id, 1))
    return row ?? null
  } catch (e) {
    if (missingTable(e)) return null
    throw e
  }
}

export async function saveStored(d: Db, v: { username: string; password: string }) {
  const passwordHash = await hashPassword(v.password)
  const set = { username: v.username, passwordHash, updatedAt: new Date() }
  await d.insert(appCredentials).values({ id: 1, ...set }).onConflictDoUpdate({ target: appCredentials.id, set })
}

/**
 * Confere usuário e senha do dono. Devolve a "versão" do login (0 = variáveis de ambiente; senão o instante da
 * última alteração, em ms), que vai no token da sessão para invalidar sessões antigas depois de uma troca; null = recusado.
 */
export async function checkOwner(d: Db, user: string, password: string): Promise<number | null> {
  const stored = await readStored(d)
  if (stored) {
    // as duas conferências sempre rodam, para o tempo de resposta não revelar se o usuário existe
    const okUser = same(user, stored.username)
    const okPassword = await verifyPassword(password, stored.passwordHash)
    return okUser && okPassword ? stored.updatedAt.getTime() : null
  }
  const { OWNER_USER: u, OWNER_PASSWORD: p } = process.env
  return u && p && same(user, u) && same(password, p) ? 0 : null
}

export async function credentialVersion(d: Db) {
  return (await readStored(d))?.updatedAt.getTime() ?? 0
}
