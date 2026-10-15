import { createHash, timingSafeEqual } from "node:crypto"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

export type Role = "owner" | "demo"

declare module "next-auth" {
  interface User {
    role?: Role
  }
  interface Session {
    user: { role: Role; name: string; email: string }
  }
}

const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest())

/**
 * Sem cadastro e sem OAuth: usuário e senha de cada papel vêm do ambiente. Papel com variável
 * faltando não existe.
 */
function roleFor(user: string, password: string): Role | null {
  const env = process.env
  const candidates: [Role, string | undefined, string | undefined][] = [
    ["owner", env.OWNER_USER, env.OWNER_PASSWORD],
    ["demo", env.DEMO_USER, env.DEMO_PASSWORD],
  ]
  for (const [role, u, p] of candidates) if (u && p && same(user, u) && same(password, p)) return role
  return null
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { user: {}, password: {} },
      authorize: (c) => {
        const user = String(c.user ?? "").trim()
        const role = roleFor(user, String(c.password ?? ""))
        return role ? { id: role, name: role === "owner" ? user : "Demonstração", email: user, role } : null
      },
    }),
  ],
  // Sessão em cookie JWT criptografado (JWE, httpOnly); sem tabela de sessões
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = user.role
      return token
    },
    session({ session, token }) {
      session.user.role = token.role as Role
      return session
    },
    authorized: ({ auth }) => !!auth?.user,
  },
})

/**
 * Para Server Actions e Route Handlers: o proxy não é fronteira de segurança suficiente.
 * A demonstração é somente leitura: só passa com `allowDemo`.
 */
export async function requireUser({ allowDemo = false } = {}) {
  const user = (await auth())?.user
  if (user?.role === "owner" || (allowDemo && user?.role === "demo")) return user
  throw new Error(user?.role === "demo" ? "A demonstração é somente leitura" : "Não autorizado")
}
