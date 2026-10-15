import { Pencil, Plus, Target, Trash2 } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Bar, Empty, Field, fieldClass, IconCircle, Money, PageTitle } from "@/components/bits"
import { RouteDialog, RouteSheet } from "@/components/route-overlay"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { goalProgress } from "@/lib/domain/calc"
import { today } from "@/lib/domain/dates"
import { brl, dateBR, monthLabel, pct } from "@/lib/format"
import { goalsWithProgress, listAccounts } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { addContribution, archiveGoal, deleteContribution, saveGoal } from "./actions"

const STATE = {
  done: { label: "Concluída", badge: "bg-muted text-muted-foreground", color: "#71717a" },
  on_track: { label: "No ritmo", badge: "bg-emerald-500/10 text-income", color: "#10b981" },
  late: { label: "Atrasada", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400", color: "#f59e0b" },
} as const

type Goal = Awaited<ReturnType<typeof goalsWithProgress>>[number]

async function saveAndClose(form: FormData) {
  "use server"
  await saveGoal(form)
  redirect("/metas")
}
async function contributeAndClose(form: FormData) {
  "use server"
  await addContribution(form)
  redirect("/metas")
}
async function archiveAndClose(form: FormData) {
  "use server"
  await archiveGoal(form)
  redirect("/metas")
}

function GoalForm({ goal, accounts, action }: { goal?: Goal; accounts: { id: number; name: string }[]; action: (f: FormData) => Promise<void> }) {
  return (
    <form action={action} className="grid gap-4">
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <Field label="Nome">
        <input name="name" required maxLength={200} defaultValue={goal?.name} placeholder="Ex.: Viagem ao Japão" className={fieldClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor alvo (R$)">
          <input type="number" name="targetAmount" required min="0.01" step="0.01" defaultValue={goal?.targetAmount} className={fieldClass} />
        </Field>
        <Field label="Prazo">
          <input type="date" name="deadline" required defaultValue={goal?.deadline} className={fieldClass} />
        </Field>
      </div>
      <Field label="Acompanhar por">
        <select name="tracking" defaultValue={goal?.tracking ?? "CONTRIBUTIONS"} className={fieldClass}>
          <option value="CONTRIBUTIONS">Aportes manuais</option>
          <option value="ACCOUNT">Saldo de conta(s) vinculada(s)</option>
        </select>
      </Field>
      <Field label="Valor inicial (R$)" hint="Só para metas por aportes.">
        <input type="number" name="initialAmount" min="0" step="0.01" defaultValue={goal?.initialAmount ?? ""} className={fieldClass} />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">Contas vinculadas <span className="font-normal text-muted-foreground">(só saldo de conta)</span></legend>
        <div className="grid gap-1.5 rounded-xl border p-3">
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" name="accountIds" value={a.id} defaultChecked={goal?.accountIds.includes(a.id)} className="size-4 accent-primary" />
              {a.name}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" className="h-9">{goal ? "Salvar meta" : "Criar meta"}</Button>
    </form>
  )
}

export default async function GoalsPage({ searchParams }: PageProps<"/metas">) {
  const sp = await searchParams
  const now = today()
  const [goals, accounts] = await Promise.all([goalsWithProgress(), listAccounts()])
  const active = accounts.filter((a) => !a.archived)
  const rows = goals.map((g) => ({ g, p: goalProgress({ target: g.targetAmount, current: g.current, createdAt: g.createdAt.toISOString().slice(0, 10), deadline: g.deadline, today: now }) }))
  const open = rows.filter((r) => r.p.state !== "done")
  const next = open[0]

  const contributeTo = rows.find((r) => r.g.id === Number(sp.aporte))
  const editing = rows.find((r) => r.g.id === Number(sp.editar))

  return (
    <div className="grid gap-5">
      <PageTitle title="Metas" description="Acompanhe o progresso e quanto guardar por mês para chegar no prazo.">
        <Link href="/metas?nova=1" className={buttonVariants()}>
          <Plus />
          Nova meta
        </Link>
      </PageTitle>

      {goals.length === 0 ? (
        <Empty icon={Target} title="Nenhuma meta ainda" action={<Link href="/metas?nova=1" className={buttonVariants()}><Plus />Criar meta</Link>}>
          Defina um valor e um prazo; o sistema calcula quanto guardar por mês.
        </Empty>
      ) : (
        <>
          <Card className="grid gap-0 py-0 sm:grid-cols-3">
            {[
              ["Guardado em metas", brl(rows.reduce((s, r) => s + r.g.current, 0)), <>de <span className="tabular-nums">{brl(rows.reduce((s, r) => s + r.g.targetAmount, 0))}</span> no total</>],
              ["Aporte mensal necessário", brl(open.reduce((s, r) => s + r.p.monthlyNeeded, 0)), "somando as metas em andamento"],
              ["Próximo prazo", next ? monthLabel(next.g.deadline.slice(0, 7)) : "—", next ? `${next.g.name} · ${next.p.monthsLeft} ${next.p.monthsLeft === 1 ? "mês" : "meses"}` : "nenhuma meta em andamento"],
            ].map(([label, value, hint], i) => (
              <div key={String(label)} className={cn("grid gap-0.5 px-5 py-4", i > 0 && "border-t sm:border-t-0 sm:border-l")}>
                <span className="text-sm font-medium text-muted-foreground">{label}</span>
                <span className="text-xl font-semibold tracking-tight tabular-nums">{value}</span>
                <span className="truncate text-xs text-muted-foreground">{hint}</span>
              </div>
            ))}
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ g, p }) => {
              const st = STATE[p.state]
              const linked = active.filter((a) => g.accountIds.includes(a.id)).map((a) => a.name).join(", ")
              return (
                <Card key={g.id}>
                  <CardHeader className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <IconCircle icon={Target} color={st.color} soft />
                      <div className="grid min-w-0">
                        <h2 className="truncate font-semibold">{g.name}</h2>
                        <span className="truncate text-xs text-muted-foreground">
                          {g.tracking === "ACCOUNT" ? `Conta vinculada · ${linked || "—"}` : `Aportes manuais · ${g.contributions.length} aportes`}
                        </span>
                      </div>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", st.badge)}>{st.label}</span>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xl font-semibold tracking-tight tabular-nums">{brl(g.current)}</span>
                        <span className="text-sm text-muted-foreground tabular-nums">de {brl(g.targetAmount)}</span>
                      </div>
                      <Bar value={p.pct} state={p.state === "late" ? "warn" : "ok"} className="h-2.5" />
                      <span className="text-xs text-muted-foreground tabular-nums">{pct(p.pct)} concluído</span>
                    </div>
                    <div className="grid grid-cols-3 rounded-xl border text-sm">
                      {[
                        ["Restante", brl(p.remaining)],
                        ["Prazo", dateBR(g.deadline)],
                        ["Por mês", p.state === "done" ? "—" : brl(p.monthlyNeeded)],
                      ].map(([k, v], i) => (
                        <div key={k} className={cn("grid min-w-0 gap-0.5 px-3 py-2.5", i > 0 && "border-l")}>
                          <span className="text-xs text-muted-foreground">{k}</span>
                          <span className={cn("truncate font-medium tabular-nums", k === "Por mês" && p.state === "late" && "text-amber-700 dark:text-amber-400")}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <div className="mt-auto flex items-center gap-2 border-t px-4 pt-3">
                    {g.tracking === "CONTRIBUTIONS" && p.state !== "done" && (
                      <Link href={`/metas?aporte=${g.id}`} className={buttonVariants({ variant: "outline" })}>
                        <Plus />
                        Novo aporte
                      </Link>
                    )}
                    <Link href={`/metas?editar=${g.id}`} className={buttonVariants({ variant: "ghost", className: "ml-auto" })}>
                      <Pencil />
                      Editar
                    </Link>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {sp.nova && (
        <RouteDialog closeHref="/metas" title="Nova meta" description="Valor alvo, prazo e como acompanhar o progresso.">
          <GoalForm accounts={active} action={saveAndClose} />
        </RouteDialog>
      )}

      {contributeTo && (
        <RouteDialog closeHref="/metas" title="Novo aporte" description={<>{contributeTo.g.name} · <span className="tabular-nums">{brl(contributeTo.g.current)} de {brl(contributeTo.g.targetAmount)}</span></>}>
          <form action={contributeAndClose} className="grid gap-4">
            <input type="hidden" name="goalId" value={contributeTo.g.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor (R$)">
                <input type="number" name="amount" required step="0.01" inputMode="decimal" placeholder="0,00" className={cn(fieldClass, "h-11 text-lg font-semibold tabular-nums")} />
              </Field>
              <Field label="Data">
                <input type="date" name="date" required defaultValue={now} className={cn(fieldClass, "h-11")} />
              </Field>
            </div>
            <Field label="Nota (opcional)">
              <input name="note" maxLength={1000} placeholder="Ex.: parte do 13º" className={fieldClass} />
            </Field>
            <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              Faltam <span className="tabular-nums">{brl(contributeTo.p.remaining)}</span> · hoje o aporte necessário é <span className="tabular-nums">{brl(contributeTo.p.monthlyNeeded)}</span>/mês.
            </p>
            <Button type="submit" className="h-9">Registrar aporte</Button>
          </form>
        </RouteDialog>
      )}

      {editing && (
        <RouteSheet closeHref="/metas" title="Editar meta" description={editing.g.name}>
          <div className="grid gap-6">
            <GoalForm goal={editing.g} accounts={active} action={saveAndClose} />
            {editing.g.contributions.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-medium">Aportes</h3>
                <ul className="grid rounded-xl border text-sm">
                  {editing.g.contributions.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-0">
                      <span className="text-muted-foreground">{dateBR(c.date)}</span>
                      <Money value={c.amount} className="ml-auto font-medium" />
                      <form action={deleteContribution}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Remover aporte">
                          <Trash2 />
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <form action={archiveAndClose} className="border-t pt-4">
              <input type="hidden" name="id" value={editing.g.id} />
              <Button type="submit" variant="destructive">Arquivar meta</Button>
            </form>
          </div>
        </RouteSheet>
      )}
    </div>
  )
}
