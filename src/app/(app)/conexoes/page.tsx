import { desc } from "drizzle-orm"
import { Banknote, CircleAlert, CircleCheck, ExternalLink, Landmark, Pencil, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Empty, Field, fieldClass, Money, PageTitle } from "@/components/bits"
import { RouteDialog, RouteSheet } from "@/components/route-overlay"
import { SyncButton } from "@/components/shell-client"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db, institutions, syncRuns } from "@/db"
import { ago } from "@/lib/format"
import { listAccounts } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { addInstitution, createManualAccount, removeInstitution, syncNow, updateAccount } from "./actions"

// A sincronização manual roda dentro da Server Action desta página
export const maxDuration = 60

const TYPES = { CHECKING: "Conta corrente", CREDIT_CARD: "Cartão de crédito", SAVINGS_INVESTMENT: "Poupança/investimento", CASH: "Dinheiro" }
const RUN = {
  OK: ["OK", "bg-emerald-500/10 text-income", "bg-emerald-500"],
  PARTIAL: ["Parcial", "bg-amber-500/10 text-amber-700 dark:text-amber-400", "bg-amber-500"],
  ERROR: ["Erro", "bg-red-500/10 text-red-700 dark:text-red-400", "bg-red-500"],
  RUNNING: ["Rodando", "bg-sky-500/10 text-sky-700 dark:text-sky-300", "bg-sky-500"],
} as const
const when = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca")
const initials = (s: string) => s.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"

async function addAndClose(form: FormData) {
  "use server"
  await addInstitution(form)
  redirect("/conexoes")
}
async function createAccountAndClose(form: FormData) {
  "use server"
  await createManualAccount(form)
  redirect("/conexoes")
}
async function updateAndClose(form: FormData) {
  "use server"
  await updateAccount(form)
  redirect("/conexoes")
}

export default async function ConnectionsPage({ searchParams }: PageProps<"/conexoes">) {
  const sp = await searchParams
  const [insts, accs, runs] = await Promise.all([db.select().from(institutions), listAccounts(), db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(8)])
  const manual = accs.filter((a) => a.source === "MANUAL")
  const orphan = accs.filter((a) => a.source === "PLUGGY" && !insts.some((i) => i.id === a.institutionId))
  const last = runs[0]
  const editing = accs.find((a) => a.id === Number(sp.editar))

  const AccountRow = ({ a }: { a: (typeof accs)[number] }) => (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-3 last:border-0", a.archived && "opacity-60")}>
      <span className="grid min-w-40 flex-1">
        <span className="truncate text-sm font-medium">{a.name}</span>
        <span className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {TYPES[a.type]}
          {a.isEmergencyReserve && <span className="rounded-full bg-violet-500/10 px-1.5 text-violet-700 dark:text-violet-300">reserva</span>}
          {a.archived && <span className="rounded-full bg-muted px-1.5">arquivada</span>}
        </span>
      </span>
      <Money value={a.balance} className="text-sm font-medium" />
      <Link href={`/conexoes?editar=${a.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Editar ${a.name}`}>
        <Pencil />
      </Link>
    </div>
  )

  return (
    <div className="grid gap-5">
      <PageTitle title="Contas e conexões" description="Conexões do MeuPluggy, contas importadas e contas manuais.">
        <Link href="/conexoes?conta=1" className={buttonVariants({ variant: "outline" })}>
          <Banknote />
          Conta manual
        </Link>
        <Link href="/conexoes?conexao=1" className={buttonVariants()}>
          <Plus />
          Adicionar conexão
        </Link>
      </PageTitle>

      <Card className="flex-row flex-wrap items-center gap-4 px-5 py-4">
        {last?.status === "ERROR" ? (
          <span className="grid size-10 place-items-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400"><CircleAlert className="size-5" /></span>
        ) : (
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-income"><CircleCheck className="size-5" /></span>
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
            <Empty icon={Landmark} title="Nenhuma conexão cadastrada" action={<Link href="/conexoes?conexao=1" className={buttonVariants()}><Plus />Adicionar conexão</Link>}>
              Conecte o MeuPluggy na sua aplicação da Pluggy e cadastre aqui o Item ID gerado.
            </Empty>
          )}
          {insts.map((i) => {
            const list = accs.filter((a) => a.institutionId === i.id)
            return (
              <Card key={i.id}>
                <CardHeader className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-sm font-semibold">{initials(i.name)}</span>
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
              <Link href="/conexoes?conta=1" className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Nova conta manual">
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
        <RouteDialog closeHref="/conexoes" title="Adicionar conexão" description="Cole o Item ID gerado na sua aplicação da Pluggy (não o do site meu.pluggy.ai).">
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
        <RouteDialog closeHref="/conexoes" title="Nova conta manual" description="Para dinheiro em espécie ou contas sem Open Finance.">
          <form action={createAccountAndClose} className="grid gap-4">
            <Field label="Nome">
              <input name="name" required maxLength={200} placeholder="Ex.: Carteira" className={fieldClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <select name="type" defaultValue="CASH" className={fieldClass}>
                  {Object.entries(TYPES).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Saldo inicial (R$)">
                <input type="number" name="openingBalance" step="0.01" placeholder="0,00" className={fieldClass} />
              </Field>
            </div>
            <Button type="submit" className="h-9">Criar conta</Button>
          </form>
        </RouteDialog>
      )}

      {editing && (
        <RouteSheet closeHref="/conexoes" title="Editar conta" description={editing.source === "PLUGGY" ? `Importada · ${editing.institution ?? "Pluggy"}` : "Conta manual"}>
          <form action={updateAndClose} className="grid gap-4">
            <input type="hidden" name="id" value={editing.id} />
            <Field label="Apelido">
              <input name="name" required maxLength={200} defaultValue={editing.name} className={fieldClass} />
            </Field>
            <Field label="Tipo">
              <select name="type" defaultValue={editing.type} className={fieldClass}>
                {Object.entries(TYPES).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            {editing.source === "MANUAL" ? (
              <Field label="Saldo inicial (R$)" hint={`Saldo atual: ${editing.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}>
                <input type="number" name="openingBalance" step="0.01" defaultValue={editing.openingBalance} className={fieldClass} />
              </Field>
            ) : (
              <div className="flex justify-between rounded-xl bg-muted p-3 text-sm">
                <span className="text-muted-foreground">Saldo (vem do banco)</span>
                <Money value={editing.balance} className="font-medium" />
              </div>
            )}
            <label className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
              <span className="grid">
                <span className="text-sm font-medium">Compõe a reserva de emergência</span>
                <span className="text-xs text-muted-foreground">O saldo entra no cálculo da reserva.</span>
              </span>
              <input type="checkbox" name="isEmergencyReserve" defaultChecked={editing.isEmergencyReserve} className="size-4 accent-primary" />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
              <span className="grid">
                <span className="text-sm font-medium">Arquivada</span>
                <span className="text-xs text-muted-foreground">Some do patrimônio e dos seletores; o histórico fica.</span>
              </span>
              <input type="checkbox" name="archived" defaultChecked={editing.archived} className="size-4 accent-primary" />
            </label>
            <Button type="submit" className="h-9">Salvar</Button>
          </form>
        </RouteSheet>
      )}
    </div>
  )
}
