import { Plus, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { auth, signOut } from "@/auth"
import { Breadcrumb, Logo, MobileNav, SidebarNav, SyncButton, ThemeToggle, UserMenu } from "@/components/shell-client"
import { buttonVariants } from "@/components/ui/button"
import { ago } from "@/lib/format"
import { shellStatus } from "@/lib/queries"
import { syncNow } from "./conexoes/actions"

// O botão "Sincronizar" do topo roda a sync numa Server Action em qualquer tela
export const maxDuration = 60

async function logout() {
  "use server"
  await signOut({ redirectTo: "/login" })
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [session, status] = await Promise.all([auth(), shellStatus()])
  const user = { name: session?.user?.name || "Você", email: session?.user?.email ?? "" }
  const run = status.lastRun
  const syncError = status.connectionErrors.length > 0 || run?.status === "ERROR"

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
          <Logo />
          <div className="grid leading-tight">
            <span className="font-semibold">Finanças</span>
            <span className="text-xs text-muted-foreground">Controle pessoal</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav badges={{ "/transacoes": status.uncategorized, ...(syncError && { "/conexoes": "danger" as const }) }} />
        </div>
        <div className="border-t border-sidebar-border p-2">
          <UserMenu name={user.name} email={user.email} signOut={logout} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:px-6">
          <div className="min-w-0 flex-1">
            <Breadcrumb />
          </div>
          {syncError ? (
            <Link href="/conexoes" className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-red-500/10 px-2 text-sm text-red-700 lg:px-2.5 dark:text-red-400" aria-label="Erro na sincronização">
              <TriangleAlert className="size-4" />
              <span className="hidden lg:inline">Erro na sincronização</span>
            </Link>
          ) : (
            <span className="hidden items-center gap-1.5 text-sm text-muted-foreground lg:flex" title={run?.finishedAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}>
              <span className="size-2 rounded-full bg-emerald-500" />
              {run?.finishedAt ? `Sincronizado ${ago(run.finishedAt)}` : "Nunca sincronizado"}
            </span>
          )}
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
          <ThemeToggle className="hidden md:inline-flex" />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-24 md:px-6 md:pt-6 md:pb-12">{children}</main>
      </div>

      <MobileNav signOut={logout} />
    </div>
  )
}
