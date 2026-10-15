import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { checkOwner, credentialVersion, same } from "@/lib/credentials"

export type Role = "owner" | "demo"

declare module "next-auth" {
  interface User {
    role?: Role
    /** Versão do login do dono (ver credentials.ts); sessões com versão antiga deixam de valer. */
    cv?: number
  }
  interface Session {
    user: { role: Role; name: string; email: string; cv?: number }
  }
}

/**
 * Sem cadastro e sem OAuth. A demonstração vem do ambiente (DEMO_USER/DEMO_PASSWORD; sem as variáveis ela não
 * existe). O dono vem do login salvo no banco (Configurações › Conta) ou, enquanto não houver, de
 * OWNER_USER/OWNER_PASSWORD. Falha ao ler o login salvo recusa a entrada, nunca cai nas variáveis de ambiente
 * (senão a senha antiga voltaria a valer).
 */
async function authenticate(user: string, password: string): Promise<{ role: Role; cv?: number } | null> {
  const { DEMO_USER: du, DEMO_PASSWORD: dp, DATABASE_URL } = process.env
  if (du && dp && same(user, du) && same(password, dp)) return { role: "demo" }
  if (!DATABASE_URL) {
    // sem banco não existe login salvo: só as variáveis de ambiente
    const { OWNER_USER: u, OWNER_PASSWORD: p } = process.env
    return u && p && same(user, u) && same(password, p) ? { role: "owner", cv: 0 } : null
  }
  try {
    // import dinâmico: @/db importa este módulo; e o login ainda não tem sessão, então precisa de asOwner
    const { asOwner, db } = await import("@/db")
    const cv = await asOwner(() => checkOwner(db, user, password))
    return cv === null ? null : { role: "owner", cv }
  } catch (e) {
    console.error("login:", e instanceof Error ? e.message : e)
    return null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { user: {}, password: {} },
      authorize: async (c) => {
        const user = String(c.user ?? "").trim()
        const found = await authenticate(user, String(c.password ?? ""))
        return found ? { id: found.role, name: found.role === "owner" ? user : "Demonstração", email: user, ...found } : null
      },
    }),
  ],
  // Sessão em cookie JWT criptografado (JWE, httpOnly); sem tabela de sessões
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.cv = user.cv
      }
      return token
    },
    session({ session, token }) {
      session.user.role = token.role as Role
      session.user.cv = token.cv as number | undefined
      return session
    },
    authorized: ({ auth }) => !!auth?.user,
  },
})

/**
 * A sessão do dono só vale enquanto o login não mudou desde que ela foi criada: trocar login ou senha em
 * Configurações encerra as outras sessões (o JWT carrega a versão do login). Demonstração não muda.
 */
export async function sessionIsCurrent(user?: { role: Role; cv?: number }) {
  if (!user) return false
  if (user.role !== "owner" || !process.env.DATABASE_URL) return true
  try {
    const { db } = await import("@/db")
    return (user.cv ?? 0) === (await credentialVersion(db))
  } catch {
    return false
  }
}

/**
 * Para Server Actions e Route Handlers: o proxy não é fronteira de segurança suficiente.
 * A demonstração é somente leitura: só passa com `allowDemo`.
 */
export async function requireUser({ allowDemo = false } = {}) {
  const user = (await auth())?.user
  if (user?.role === "owner" && (await sessionIsCurrent(user))) return user
  if (allowDemo && user?.role === "demo") return user
  throw new Error(user?.role === "demo" ? "A demonstração é somente leitura" : "Não autorizado")
}
