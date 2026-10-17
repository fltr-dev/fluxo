import { Plus, TriangleAlert } from "lucide-react"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth, sessionIsCurrent, signOut } from "@/auth"
import { Breadcrumb, MobileNav, PrivacyToggle, SyncButton, ThemeToggle } from "@/components/shell-client"
import { SettingsProvider } from "@/components/settings-dialog"
import { Sidebar } from "@/components/sidebar"
import { buttonVariants } from "@/components/ui/button"
import { APP } from "@/lib/app-info"
import { accountLook } from "@/lib/banks"
import { ago } from "@/lib/format"
import { listAccounts, shellStatus } from "@/lib/queries"
import { DEFAULT_PRIMARY, primaryFromCookie, themeFromCookie } from "@/lib/theme"
import { syncNow } from "./contas/actions"

// O botão "Sincronizar" do topo roda a sync numa Server Action em qualquer tela
export const maxDuration = 60

async function logout() {
  "use server"
  await signOut({ redirectTo: "/login" })
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [session, status, accounts, jar] = await Promise.all([auth(), shellStatus(), listAccounts(), cookies()])
  // Login trocado em Configurações: sessões antigas deixam de valer
  if (!(await sessionIsCurrent(session?.user))) redirect("/login?error=expired")

  const user = { name: session?.user?.name || "Você", email: session?.user?.email ?? "" }
  const demo = session?.user?.role === "demo"
  const run = status.lastRun
  const syncError = status.connectionErrors.length > 0 || run?.status === "ERROR"
  const activeAccounts = accounts
    .filter((a) => !a.archived)
    .map((a) => ({ id: a.id, name: a.name, look: accountLook({ name: a.name, bank: a.bank, color: a.color, institution: a.institution }), investment: a.investmentId != null }))
  // Cada ativo da carteira tem a sua conta; na lista lateral eles ficariam dezenas: aparecem em Investimentos
  const sidebarAccounts = activeAccounts.filter((a) => !a.investment)
  const badges = { "/transacoes": status.uncategorized, ...(syncError && { "/contas": "danger" as const }) }
  const accountsOpen = jar.get("sidebar-accounts")?.value !== "closed"

  return (
    <SettingsProvider
      user={{ ...user, role: session?.user?.role ?? "owner" }}
      app={APP}
      theme={themeFromCookie(jar.get("theme")?.value)}
      primary={primaryFromCookie(jar.get("primary")?.value) ?? DEFAULT_PRIMARY}
    >
      <div className="flex min-h-svh">
        <Sidebar
          badges={badges}
          accounts={sidebarAccounts}
          user={user}
          version={APP.version}
          appName={APP.name}
          collapsed={jar.get("sidebar")?.value === "collapsed"}
          accountsOpen={accountsOpen}
          signOut={logout}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:px-6">
            <div className="min-w-0 flex-1">
              <Breadcrumb accounts={activeAccounts.map((a) => ({ id: a.id, name: a.name }))} />
            </div>
            {syncError ? (
              <Link href="/contas" className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-red-500/10 px-2 text-sm text-red-700 lg:px-2.5 dark:text-red-400" aria-label="Erro na sincronização">
                <TriangleAlert className="size-4" />
                <span className="hidden lg:inline">Erro na sincronização</span>
              </Link>
            ) : (
              <span className="hidden items-center gap-1.5 text-sm text-muted-foreground lg:flex" title={run?.finishedAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}>
                <span className="size-2 rounded-full bg-income" />
                {run?.finishedAt ? `Sincronizado ${ago(run.finishedAt)}` : "Nunca sincronizado"}
              </span>
            )}
            {!demo && (
              <>
                <form action={syncNow} className="hidden md:block">
                  <SyncButton />
                </form>
                <form action={syncNow} className="md:hidden">
                  <SyncButton compact />
                </form>
                <Link href="/transacoes?nova=1" className={buttonVariants({ className: "max-md:hidden" })} aria-label="Nova transação">
                  <Plus />
                  <span className="hidden lg:inline">Transação</span>
                </Link>
              </>
            )}
            <PrivacyToggle />
            <ThemeToggle className="hidden md:inline-flex" />
          </header>
          {demo && <div className="border-b bg-amber-500/10 px-4 py-1.5 text-center text-xs font-medium text-amber-700 md:px-6 dark:text-amber-300">Demonstração · dados fictícios · somente leitura</div>}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-24 md:px-6 md:pt-6 md:pb-12">{children}</main>
        </div>

        <MobileNav signOut={logout} badges={badges} accounts={sidebarAccounts} accountsOpen={accountsOpen} appName={APP.name} version={APP.version} />
      </div>
    </SettingsProvider>
  )
}
