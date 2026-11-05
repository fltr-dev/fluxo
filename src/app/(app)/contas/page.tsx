import { desc } from "drizzle-orm"
import { Archive, Banknote, ChartPie, ChevronRight, CircleAlert, CircleCheck, CreditCard as CreditCardIcon, ExternalLink, Landmark, Pencil, PiggyBank, Plus, ShieldCheck, Trash2, Wallet } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AccountAvatar } from "@/components/account-avatar"
import { AccountFields } from "@/components/account-fields"
import { CreditCard } from "@/components/credit-card"
import { CancelLink, Empty, Field, fieldClass, FormActions, IconCircle, Money, PageTitle } from "@/components/bits"
import { FormSelect } from "@/components/form-select"
import { InlineName } from "@/components/inline-name"
import { RouteDialog } from "@/components/route-overlay"
import { SyncButton } from "@/components/shell-client"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db, institutions, syncRuns } from "@/db"
import { ACCOUNT_ORDERS, ACCOUNT_TYPES, accountOrder, accountSubline, groupAccounts, type PortfolioRow } from "@/lib/account-types"
import { accountLook } from "@/lib/banks"
import { brl, ago } from "@/lib/format"
import { listAccounts, withParams } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { AccountEditSheet } from "./account-edit"
import { addInstitution, createManualAccount, removeInstitution, renameAccount, renameInstitution, syncNow } from "./actions"

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
  const last = runs[0]
  const editing = accs.find((a) => a.id === Number(sp.editar))
  const order = accountOrder(sp.ordem)
  const { groups, archived } = groupAccounts(accs, order)
  const here = (patch: Record<string, string | number | undefined>) => `/contas${withParams(sp, patch)}`

  // Resumo geral: patrimônio e como ele se divide (contas ativas; cartão entra com a fatura aberta como dívida)
  const active = accs.filter((a) => !a.archived)
  const sum = (types: string[]) => active.filter((a) => types.includes(a.type)).reduce((t, a) => t + a.balance, 0)
  const summary = [
    { label: "Patrimônio", hint: "Tudo somado", value: active.reduce((t, a) => t + a.balance, 0), icon: Landmark, color: "#0ea5e9" },
    { label: "Disponível", hint: "Contas correntes e dinheiro", value: sum(["CHECKING", "CASH"]), icon: Wallet, color: "#22c55e" },
    { label: "Investido", hint: "Poupança e investimentos", value: sum(["SAVINGS_INVESTMENT"]), icon: PiggyBank, color: "#8b5cf6" },
    { label: "Cartões", hint: "Fatura aberta", value: sum(["CREDIT_CARD"]), icon: CreditCardIcon, color: "#f43f5e" },
  ]

  // A linha inteira é um link para o detalhe; o nome (renomear) e o lápis (editar) ficam por cima (z-10)
  const AccountRow = ({ a }: { a: (typeof accs)[number] }) => (
    <div className="relative flex min-h-14 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <Link href={`/contas/${a.id}`} className="absolute inset-0 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none" aria-label={`Abrir ${a.name}`} />
      <AccountAvatar look={accountLook(a)} size={36} />
      <span className="grid min-w-0 flex-1">
        <InlineName id={a.id} value={a.name} action={renameAccount} label="conta" className="text-sm font-medium" />
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{accountSubline(a)}</span>
          {a.isEmergencyReserve && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/10 px-1.5 text-violet-700 dark:text-violet-300">
              <ShieldCheck className="size-3" />
              Reserva
            </span>
          )}
        </span>
      </span>
      <Money value={a.balance} className="text-sm font-medium" />
      <Link href={here({ editar: a.id })} scroll={false} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "relative z-10 size-10 md:size-8")} aria-label={`Editar ${a.name}`}>
        <Pencil />
      </Link>
    </div>
  )

  // Cartões ativos: o cartão na cor do banco (fatura, limite, vencimento); arquivados continuam como linha
  const AccountCard = ({ a }: { a: (typeof accs)[number] }) => (
    <CreditCard
      look={accountLook(a)}
      name={<InlineName id={a.id} value={a.name} action={renameAccount} label="conta" />}
      label={a.name}
      balance={a.balance}
      creditLimit={a.creditLimit}
      availableCreditLimit={a.availableCreditLimit}
      billDueDate={a.billDueDate}
      href={`/contas/${a.id}`}
    >
      <Link href={here({ editar: a.id })} scroll={false} className="relative z-10 grid size-10 shrink-0 place-items-center rounded-lg hover:bg-black/10 md:size-8 [&_svg]:size-4" aria-label={`Editar ${a.name}`}>
        <Pencil />
      </Link>
    </CreditCard>
  )

  const PortfolioLine = ({ p }: { p: PortfolioRow }) => (
    <Link href="/investimentos" className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <IconCircle icon={ChartPie} color="#8b5cf6" soft className="size-9 rounded-lg" />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-medium">{p.name}</span>
        <span className="text-xs text-muted-foreground">
          {p.count} {p.count === 1 ? "ativo" : "ativos"}
        </span>
      </span>
      <Money value={p.balance} className="text-sm font-medium" />
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  )

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
            {insts.length} {insts.length === 1 ? "conexão" : "conexões"} · {active.length} contas ativas · sincronização automática 1x por dia
          </span>
        </div>
        <form action={syncNow}>
          <SyncButton />
        </form>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          {accs.length === 0 ? (
            <Empty
              icon={Landmark}
              title="Nenhuma conta ainda"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/contas?conexao=1" className={buttonVariants()}><Plus />Adicionar conexão</Link>
                  <Link href="/contas?conta=1" className={buttonVariants({ variant: "outline" })}><Banknote />Conta manual</Link>
                </div>
              }
            >
              Conecte um banco pelo MeuPluggy ou crie uma conta manual para dinheiro em espécie e contas sem Open Finance.
            </Empty>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-muted-foreground">Ordenar por</h2>
                <nav className="inline-flex rounded-lg bg-muted p-[3px]" aria-label="Ordenar contas">
                  {(Object.keys(ACCOUNT_ORDERS) as (keyof typeof ACCOUNT_ORDERS)[]).map((k) => (
                    <Link
                      key={k}
                      href={here({ ordem: k === "saldo" ? undefined : k })}
                      scroll={false}
                      aria-current={k === order ? "true" : undefined}
                      className={cn("inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold text-muted-foreground hover:text-foreground", k === order && "bg-card text-foreground shadow-sm ring-1 ring-border")}
                    >
                      {ACCOUNT_ORDERS[k]}
                    </Link>
                  ))}
                </nav>
              </div>
              {groups.map((g) => (
                <Card key={g.type} className="@container gap-2">
                  <CardHeader className="flex items-center justify-between gap-3">
                    <CardTitle className="font-semibold">{g.label}</CardTitle>
                    <Money value={g.total} className="text-sm font-semibold" />
                  </CardHeader>
                  {g.type === "CREDIT_CARD" ? (
                    <CardContent className="grid gap-3 @lg:grid-cols-2">
                      {g.rows.map((r) => ("portfolio" in r ? null : <AccountCard key={r.id} a={r} />))}
                    </CardContent>
                  ) : (
                    <CardContent className="grid grid-cols-1 px-2 sm:px-4">
                      {g.rows.map((r) => ("portfolio" in r ? <PortfolioLine key="portfolio" p={r} /> : <AccountRow key={r.id} a={r} />))}
                    </CardContent>
                  )}
                </Card>
              ))}
              {archived.length > 0 && (
                <details className="group rounded-xl border bg-card">
                  <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-sm font-medium text-muted-foreground select-none hover:text-foreground">
                    <Archive className="size-4" />
                    Arquivadas ({archived.length})
                    <ChevronRight className="ml-auto size-4 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="grid grid-cols-1 px-2 pb-2 opacity-70 sm:px-4">
                    {archived.map((a) => <AccountRow key={a.id} a={a} />)}
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="font-semibold">Conexões</CardTitle>
              <Link href="/contas?conexao=1" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-10 md:size-8")} aria-label="Adicionar conexão">
                <Plus />
              </Link>
            </CardHeader>
            <CardContent className="grid grid-cols-1">
              {insts.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">
                  Nenhuma conexão. Conecte o MeuPluggy na sua aplicação da Pluggy e cadastre o Item ID.{" "}
                  <Link href="/contas?conexao=1" className="font-medium text-primary underline-offset-4 hover:underline">Adicionar conexão</Link>
                </p>
              )}
              {insts.map((i) => {
                const n = accs.filter((a) => a.institutionId === i.id).length
                return (
                  <div key={i.id} className="grid gap-2 border-b py-3 first:pt-0 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <AccountAvatar look={accountLook({ name: i.name })} size={36} />
                      <div className="grid min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <InlineName id={i.id} value={i.name} action={renameInstitution} label="conexão" className="text-sm font-medium" />
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", i.error ? RUN.ERROR[1] : RUN.OK[1])}>{i.error ? "Com erro" : "Ativa"}</span>
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {n} {n === 1 ? "conta" : "contas"} · sincronizado {i.lastSyncedAt ? ago(i.lastSyncedAt) : "nunca"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          Item ID <span className="font-mono">{i.pluggyItemId.slice(0, 8)}…</span>
                        </span>
                      </div>
                      <form action={removeInstitution}>
                        <input type="hidden" name="id" value={i.id} />
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Remover conexão ${i.name}`} className="size-10 text-muted-foreground hover:text-destructive md:size-8">
                          <Trash2 />
                        </Button>
                      </form>
                    </div>
                    {i.error && (
                      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                        <CircleAlert className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-40 flex-1">{i.error}</span>
                        <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                          Abrir MeuPluggy
                          <ExternalLink />
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-semibold">Histórico de sincronizações</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1">
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
            <FormActions>
              <CancelLink href="/contas" />
              <Button type="submit" size="lg">Adicionar conexão</Button>
            </FormActions>
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
            <FormActions>
              <CancelLink href="/contas" />
              <Button type="submit" size="lg">Criar conta</Button>
            </FormActions>
          </form>
        </RouteDialog>
      )}

      {editing && <AccountEditSheet account={editing} closeHref={here({ editar: undefined })} />}
    </div>
  )
}
