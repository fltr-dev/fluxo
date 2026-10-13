import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

const allowed = () => process.env.ALLOWED_EMAIL?.trim().toLowerCase()

// Login sem Google para desenvolvimento local; nunca ativo em produção
export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_LOGIN === "1"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    ...(devLoginEnabled
      ? [Credentials({ id: "dev", name: "Dev", credentials: {}, authorize: () => ({ id: "dev", email: allowed(), name: "Dev" }) })]
      : []),
  ],
  // Sessão em cookie JWT criptografado (JWE, httpOnly); sem tabela de sessões
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile?.email_verified !== true) return false
      return !!allowed() && user.email?.toLowerCase() === allowed()
    },
    authorized: ({ auth }) => !!auth?.user,
  },
})

/** Para Server Actions e Route Handlers: o proxy não é fronteira de segurança suficiente. */
export async function requireUser() {
  const session = await auth()
  if (!session?.user?.email || session.user.email.toLowerCase() !== allowed()) throw new Error("Não autorizado")
  return session.user
}
