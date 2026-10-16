import { desc } from "drizzle-orm"
import { Banknote, ChevronRight, CircleAlert, CircleCheck, CreditCard, ExternalLink, Landmark, Pencil, PiggyBank, Plus, Trash2, Wallet } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AccountAvatar } from "@/components/account-avatar"
import { AccountFields } from "@/components/account-fields"
import { Empty, Field, fieldClass, IconCircle, Money, PageTitle } from "@/components/bits"
import { FormSelect } from "@/components/form-select"
import { RouteDialog } from "@/components/route-overlay"
import { SyncButton } from "@/components/shell-client"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db, institutions, syncRuns } from "@/db"
import { ACCOUNT_TYPES } from "@/lib/account-types"
import { accountLook } from "@/lib/banks"
import { brl, ago } from "@/lib/format"
import { listAccounts } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { AccountEditSheet } from "./account-edit"
import { addInstitution, createManualAccount, removeInstitution, syncNow } from "./actions"

// A sincronização manual roda dentro da Server Action desta página
export const maxDuration = 60

const TYPES = ACCOUNT_TYPES
const RUN = {
  OK: ["OK", "bg-income/10 text-income", "bg-income"],
  PARTIAL: ["Parcial", "bg-amber-500/10 text-warning", "bg-amber-500"],
  ERROR: ["Erro", "bg-red-500/10 text-red-700 dark:text-red-400", "bg-red-500"],
  RUNNING: ["Rodando", "bg-sky-500/10 text-sky-700 dark:text-sky-300", "bg-sky-500"],
} as const
const when = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca")

async function addAndClose(form: FormData) {
  "use server"
  await addInstitution(form)
  redirect("/contas")
}
async function createAccountAndClose(form: FormData) {
  "use server"
  await createManualAccount(form)
  redirect("/contas")
}

export default async function ConnectionsPage({ searchParams }: PageProps<"/contas">) {
  const sp = await searchParams
  const [insts, accs, runs] = await Promise.all([db.select().from(institutions), listAccounts(), db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(8)])
  const manual = accs.filter((a) => a.source === "MANUAL")
  const orphan = accs.filter((a) => a.source === "PLUGGY" && !insts.some((i) => i.id === a.institutionId))
  const last = runs[0]
  const editing = accs.find((a) => a.id === Number(sp.editar))

  // Resumo geral: patrimônio e como ele se divide (contas ativas; cartão entra com a fatura aberta como dívida)
  const active = accs.filter((a) => !a.archived)
  const sum = (types: string[]) => active.filter((a) => types.includes(a.type)).reduce((t, a) => t + a.balance, 0)
  const summary = [
    { label: "Patrimônio", hint: "Tudo somado", value: active.reduce((t, a) => t + a.balance, 0), icon: Landmark, color: "#0ea5e9" },
    { label: "Disponível", hint: "Contas correntes e dinheiro", value: sum(["CHECKING", "CASH"]), icon: Wallet, color: "#22c55e" },
    { label: "Investido", hint: "Poupança e investimentos", value: sum(["SAVINGS_INVESTMENT"]), icon: PiggyBank, color: "#8b5cf6" },
    { label: "Cartões", hint: "Fatura aberta", value: sum(["CREDIT_CARD"]), icon: CreditCard, color: "#f43f5e" },
  ]

  const AccountRow = ({ a }: { a: (typeof accs)[number] }) => {
    const look = accountLook({ name: a.name, bank: a.bank, color: a.color, institution: a.institution })
    return (
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-0", a.archived && "opacity-60")}>
        <Link href={`/contas/${a.id}`} className="group flex min-w-40 flex-1 items-center gap-3 rounded-lg py-1 pr-2 hover:bg-muted/50">
          <AccountAvatar look={look} size={36} />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-sm font-medium group-hover:underline">{a.name}</span>
            <span className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {TYPES[a.type]}
              {a.isEmergencyReserve && <span className="rounded-full bg-violet-500/10 px-1.5 text-violet-700 dark:text-violet-300">reserva</span>}
              {a.archived && <span className="rounded-full bg-muted px-1.5">arquivada</span>}
            </span>
          </span>
          <Money value={a.balance} className="text-sm font-medium" />
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
        <Link href={`/contas?editar=${a.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Editar ${a.name}`}>
          <Pencil />
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <PageTitle title="Contas" description="Resumo geral. Clique numa conta para ver os detalhes e o histórico de transações.">
        <Link href="/contas?conta=1" className={buttonVariants({ variant: "outline" })}>
          <Banknote />
          Conta manual
        </Link>
        <Link href="/contas?conexao=1" className={buttonVariants()}>
          <Plus />
          Adicionar conexão
        </Link>
      </PageTitle>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" aria-label="Resumo">
        {summary.map((k) => (
          <Card key={k.label} className="gap-3 px-4 py-4">
            <div className="flex items-center gap-2.5">
              <IconCircle icon={k.icon} color={k.color} soft className="size-8" />
              <span className="text-sm font-medium text-muted-foreground">{k.label}</span>
            </div>
            <div className="grid gap-0.5">
              <span className={cn("text-xl font-semibold tracking-tight tabular-nums", k.value < 0 && "text-expense")} aria-label={brl(k.value)}>{brl(k.value)}</span>
              <span className="text-xs text-muted-foreground">{k.hint}</span>
            </div>
          </Card>
        ))}
      </section>

      <Card className="flex-row flex-wrap items-center gap-4 px-5 py-4">
        {last?.status === "ERROR" ? (
          <span className="grid size-10 place-items-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400"><CircleAlert className="size-5" /></span>
        ) : (
          <span className="grid size-10 place-items-center rounded-xl bg-income/10 text-income"><CircleCheck className="size-5" /></span>
        )}
        <div className="grid min-w-56 flex-1">
          <span className="font-medium">
            {last ? `Última sincronização ${last.finishedAt ? ago(last.finishedAt) : "em andamento"} (${last.trigger === "CRON" ? "automática" : "manual"})` : "Nenhuma sincronização ainda"}
          </span>
          <span className="text-sm text-muted-foreground">
            {insts.length} {insts.length === 1 ? "conexão" : "conexões"} · {accs.filter((a) => !a.archived).length} contas ativas · sincronização automática 1x por dia
          </span>
        </div>
        <form action={syncNow}>
          <SyncButton />
        </form>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="grid gap-4">
          {insts.length === 0 && (
            <Empty icon={Landmark} title="Nenhuma conexão cadastrada" action={<Link href="/contas?conexao=1" className={buttonVariants()}><Plus />Adicionar conexão</Link>}>
              Conecte o MeuPluggy na sua aplicação da Pluggy e cadastre aqui o Item ID gerado.
            </Empty>
          )}
          {insts.map((i) => {
            const list = accs.filter((a) => a.institutionId === i.id)
            return (
              <Card key={i.id}>
                <CardHeader className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <AccountAvatar look={accountLook({ name: i.name })} size={40} className="rounded-xl" />
                    <div className="grid min-w-0">
                      <span className="flex items-center gap-2">
                        <CardTitle className="truncate font-semibold">{i.name}</CardTitle>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", i.error ? RUN.ERROR[1] : RUN.OK[1])}>{i.error ? "Com erro" : "Ativa"}</span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        Item ID <span className="font-mono">{i.pluggyItemId.slice(0, 8)}…</span> · sincronizado {i.lastSyncedAt ? ago(i.lastSyncedAt) : "nunca"}
                      </span>
                    </div>
                  </div>
                  <form action={removeInstitution}>
                    <input type="hidden" name="id" value={i.id} />
                    <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Remover conexão ${i.name}`} className="text-muted-foreground hover:text-destructive">
                      <Trash2 />
                    </Button>
                  </form>
                </CardHeader>
                <CardContent className="grid">
                  {i.error && (
                    <div className="mb-2 flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-48 flex-1">{i.error}</span>
                      <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                        Abrir MeuPluggy
                        <ExternalLink />
                      </a>
                    </div>
                  )}
                  {list.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nenhuma conta ainda. Sincronize para listar as contas desta conexão.</p>}
                  {list.map((a) => <AccountRow key={a.id} a={a} />)}
                </CardContent>
              </Card>
            )
          })}
          {orphan.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-semibold">Contas de conexões removidas</CardTitle>
              </CardHeader>
              <CardContent className="grid">{orphan.map((a) => <AccountRow key={a.id} a={a} />)}</CardContent>
            </Card>
          )}
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div className="grid gap-1">
                <CardTitle className="font-semibold">Contas manuais</CardTitle>
                <p className="text-sm text-muted-foreground">Saldo = saldo inicial + lançamentos</p>
              </div>
              <Link href="/contas?conta=1" className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Nova conta manual">
                <Plus />
              </Link>
            </CardHeader>
            <CardContent className="grid">
              {manual.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nenhuma conta manual.</p>}
              {manual.map((a) => <AccountRow key={a.id} a={a} />)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-semibold">Histórico de sincronizações</CardTitle>
            </CardHeader>
            <CardContent className="grid">
              {runs.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nenhuma sincronização ainda.</p>}
              {runs.map((r) => {
                const [label, badge, dot] = RUN[r.status as keyof typeof RUN] ?? RUN.RUNNING
                return (
                  <div key={r.id} className="flex items-start gap-3 border-b py-2.5 last:border-0">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", dot)} />
                    <span className="grid min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium tabular-nums">
                        {when(r.startedAt)}
                        <span className="rounded-full bg-muted px-1.5 text-xs font-normal text-muted-foreground">{r.trigger === "CRON" ? "Automática" : "Manual"}</span>
                      </span>
                      {r.error && <span className="text-xs break-words text-muted-foreground">{r.error}</span>}
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", badge)}>{label}</span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {sp.conexao && (
        <RouteDialog closeHref="/contas" title="Adicionar conexão" description="Cole o Item ID gerado na sua aplicação da Pluggy (não o do site meu.pluggy.ai).">
          <form action={addAndClose} className="grid gap-4">
            <Field label="Item ID" hint="dashboard.pluggy.ai › sua aplicação › Ir para Demo › ⋮ › Copiar Item ID.">
              <input name="pluggyItemId" required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" pattern="[0-9a-fA-F-]{36}" className={cn(fieldClass, "font-mono")} />
            </Field>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">Como configurar</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Em meu.pluggy.ai, crie sua conta e conecte seus bancos (consentimento Open Finance).</li>
                <li>Em dashboard.pluggy.ai, crie uma aplicação e coloque o Client ID/Secret no ambiente.</li>
                <li>Na aplicação, clique em “Ir para Demo”, conecte o conector MeuPluggy e autorize com a sua conta do MeuPluggy.</li>
                <li>No menu ⋮ do Demo, use “Copiar Item ID”, cole aqui e clique em “Sincronizar”. O ID que aparece no site meu.pluggy.ai não funciona (HTTP 404).</li>
              </ol>
            </details>
            <Button type="submit" className="h-9">Adicionar conexão</Button>
          </form>
        </RouteDialog>
      )}

      {sp.conta && (
        <RouteDialog closeHref="/contas" title="Nova conta manual" description="Para dinheiro em espécie ou contas sem Open Finance.">
          <form action={createAccountAndClose} className="grid gap-4">
            <AccountFields defaultBank={null} defaultColor={null} placeholder="Ex.: Carteira" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <FormSelect name="type" defaultValue="CASH" options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Saldo inicial (R$)">
                <input type="number" name="openingBalance" step="0.01" placeholder="0,00" className={fieldClass} />
              </Field>
            </div>
            <Button type="submit" className="h-9">Criar conta</Button>
          </form>
        </RouteDialog>
      )}

      {editing && <AccountEditSheet account={editing} closeHref="/contas" />}
    </div>
  )
}
