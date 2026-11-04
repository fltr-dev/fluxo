import { Calendar, CalendarDays, Check, CircleAlert, HandCoins, Link2, Pencil, Plus, Wallet } from "lucide-react"
import Link from "next/link"
import { Bar, Empty, Field, fieldClass, FormActions, PageTitle } from "@/components/bits"
import { CofyAvatar } from "@/components/cofy-mascot"
import { RouteDialog, RouteSheet } from "@/components/route-overlay"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { addDays, monthOf, today } from "@/lib/domain/dates"
import { dueBetween, payoffMonth, salaryOn, scheduleLabel, type DueRow } from "@/lib/domain/debts"
import { loadDebts, matchPayments, type DebtView } from "@/lib/debts"
import { brl, dateBR, dayMonth, monthLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import { archiveDebtAction, deleteDebtAction, payDebt, saveDebt, undoDebtPayment } from "./actions"
import { DebtForm, EMPTY_DEBT, type DebtFormValue } from "./debt-form"
import { DebtAvatar, StatusBadge } from "./shared"

const TABS = [
  { id: "abertas", label: "Em aberto" },
  { id: "quitadas", label: "Quitadas" },
  { id: "todas", label: "Todas" },
] as const

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined)
const intParam = (v: string | string[] | undefined) => {
  const n = Number(first(v))
  return Number.isInteger(n) && n > 0 ? n : undefined
}

function formValue(v: DebtView): DebtFormValue {
  const open = v.ev.rows.filter((r) => !r.paidOn)
  const s = v.schedule
  const flex = s.kind === "NONE" && v.ev.rows.every((r) => r.paidOn)
  return {
    id: v.debt.id,
    creditor: v.debt.creditor,
    relation: v.debt.relation ?? "",
    description: v.debt.description ?? "",
    items: v.items.map(({ description, quantity, unitAmount }) => ({ description, quantity, unitAmount })),
    mode: flex ? "FLEX" : open.length <= 1 ? "LUMP" : "INSTALLMENTS",
    installments: Math.max(1, open.length),
    kind: s.kind,
    day: s.day ?? 5,
    offsetDays: s.offsetDays,
    date: open[0]?.due ?? s.date ?? "",
    remindDaysBefore: v.debt.remindDaysBefore ?? -1,
  }
}

const installmentOf = (v: DebtView, r: DueRow) => `${r.number} de ${v.ev.rows.length}`
const dueText = (r: DueRow) => (r.due ? `${dayMonth(r.due)}${r.estimated ? " (previsto)" : ""}` : "sem data")

function DebtCard({ v }: { v: DebtView }) {
  const { debt, ev } = v
  const pctPaid = ev.total ? ev.paid / ev.total : 0
  const next = ev.next
  const summary = debt.description || v.items.map((i) => i.description).join(", ")
  return (
    <article className={cn("grid min-w-0 grid-cols-1 gap-3 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-sm", ev.status === "overdue" && "border-expense/30")}>
      <div className="flex items-start gap-3">
        <DebtAvatar creditor={debt.creditor} />
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/dividas?ver=${debt.id}`} className="truncate font-semibold hover:underline" title={debt.creditor}>
              {debt.creditor}
            </Link>
            {debt.relation && <span className="inline-flex h-5 items-center rounded-md bg-muted px-2 text-xs font-medium text-muted-foreground">{debt.relation}</span>}
            <StatusBadge status={ev.status} />
          </div>
          <p className="truncate text-sm text-muted-foreground" title={summary}>{summary}</p>
        </div>
        <div className="shrink-0 text-right whitespace-nowrap">
          <div className="font-semibold tabular-nums">{brl(ev.remaining)}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{ev.paid > 0 ? `de ${brl(ev.total)}` : "em aberto"}</div>
        </div>
      </div>

      {v.items.length > 1 && (
        <ul className="grid grid-cols-1 gap-0.5 rounded-xl bg-muted/50 px-3 py-2 text-sm">
          {v.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span className="truncate" title={i.description}>
                {i.quantity > 1 && <span className="tabular-nums">{i.quantity}× </span>}
                {i.description}
              </span>
              <span className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">{brl(i.quantity * i.unitAmount)}</span>
            </li>
          ))}
        </ul>
      )}

      <Bar value={pctPaid} state={ev.status === "overdue" ? "over" : "ok"} className="h-1.5" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-4" />
          {scheduleLabel(v.schedule)}
        </span>
        {next ? (
          <span>
            Próxima: <b className="font-semibold text-foreground">{dueText(next)}</b> · {brl(next.amount)} · {installmentOf(v, next)}
          </span>
        ) : ev.remaining > 0 ? (
          <span>Pagamento livre</span>
        ) : (
          <span>Quitada</span>
        )}
        <span className="ml-auto flex gap-2">
          {ev.remaining > 0 && (
            <Link href={`/dividas?pagar=${debt.id}${next ? `&parcela=${next.id}` : ""}`} className={buttonVariants({ size: "sm" })}>
              <Wallet /> Registrar pagamento
            </Link>
          )}
          <Link href={`/dividas?ver=${debt.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Detalhes
          </Link>
        </span>
      </div>
    </article>
  )
}

async function DetailSheet({ v }: { v: DebtView }) {
  const { debt, ev } = v
  const nextOpen = ev.rows.find((r) => !r.paidOn)
  const suggestion = nextOpen && v.schedule.kind !== "NONE" ? (await matchPayments({ amount: nextOpen.amount, due: nextOpen.due }, debt.creditor, 1))[0] : undefined
  return (
    <RouteSheet closeHref="/dividas" title={debt.creditor} description={[debt.relation, debt.description].filter(Boolean).join(" · ") || undefined}>
      <div className="grid grid-cols-1 gap-5">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
          {[
            ["Restante", brl(ev.remaining), ""],
            ["Pago", brl(ev.paid), "text-income"],
            ["Total", brl(ev.total), ""],
            ["Vencimento", scheduleLabel(v.schedule), ""],
          ].map(([l, val, cls]) => (
            <div key={l} className="grid gap-0.5 bg-card px-3.5 py-2.5">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{l}</span>
              <span className={cn("font-semibold tabular-nums", cls)}>{val}</span>
            </div>
          ))}
        </div>

        {v.items.length > 0 && (
          <section className="grid gap-1">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Itens</h3>
            <ul className="divide-y rounded-xl border text-sm">
              {v.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 px-3.5 py-2">
                  <span className="truncate" title={i.description}>
                    {i.quantity > 1 && <span className="tabular-nums">{i.quantity}× </span>}
                    {i.description}
                  </span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">{brl(i.quantity * i.unitAmount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {suggestion && nextOpen && (
          <form action={payDebt} className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-sm">
            <input type="hidden" name="debtId" value={debt.id} />
            <input type="hidden" name="installmentId" value={nextOpen.id} />
            <input type="hidden" name="amount" value={nextOpen.amount} />
            <input type="hidden" name="date" value={suggestion.date} />
            <input type="hidden" name="transactionId" value={suggestion.id} />
            <Link2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="grid flex-1 gap-1.5">
              <span>
                Encontramos uma saída de <b className="tabular-nums">{brl(-suggestion.amount)}</b> em {dateBR(suggestion.date)} ({suggestion.description}). Foi o pagamento da parcela {installmentOf(v, nextOpen)}?
              </span>
              <Button type="submit" size="sm" className="justify-self-start">
                Vincular e marcar como paga
              </Button>
            </div>
          </form>
        )}

        <section className="grid gap-1">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{ev.rows.length ? "Parcelas e pagamentos" : "Pagamentos"}</h3>
          {ev.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {ev.rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2", r.paidOn ? "border-transparent bg-income/15 text-income" : r.id === ev.next?.id ? "border-primary" : "border-muted-foreground/30")}>{r.paidOn && <Check className="size-3.5" strokeWidth={3} />}</span>
                  <div className="grid min-w-0 flex-1">
                    <span className={cn("truncate font-medium", !r.paidOn && r.status !== "overdue" && r.id !== ev.next?.id && "font-normal text-muted-foreground")}>{v.schedule.kind === "NONE" && r.paidOn ? "Pagamento" : `Parcela ${r.number}`}</span>
                    <span className="text-xs text-muted-foreground">{r.paidOn ? `Paga em ${dateBR(r.paidOn)}` : r.due ? `Vence em ${dateBR(r.due)}${r.estimated ? " (previsto)" : ""}` : "Sem data"}</span>
                    {r.transactionId && (
                      <Link href={`/transacoes?tx=${r.transactionId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Link2 className="size-3" /> vinculada a uma transação
                      </Link>
                    )}
                    {!r.paidOn && r.status === "overdue" && <span className="text-xs font-medium text-expense">Em atraso</span>}
                    {!r.paidOn && r.id === ev.next?.id && r.status !== "overdue" && <span className="text-xs font-medium text-primary">Próxima</span>}
                  </div>
                  <b className="whitespace-nowrap tabular-nums">{brl(r.amount)}</b>
                  {r.paidOn ? (
                    <form action={undoDebtPayment}>
                      <input type="hidden" name="debtId" value={debt.id} />
                      <input type="hidden" name="installmentId" value={r.id} />
                      <Button type="submit" variant="ghost" size="xs" aria-label="Desfazer pagamento">
                        Desfazer
                      </Button>
                    </form>
                  ) : (
                    <Link href={`/dividas?pagar=${debt.id}&parcela=${r.id}`} className={buttonVariants({ variant: "outline", size: "xs" })}>
                      Pagar
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <FormActions>
          <Link href={`/dividas?editar=${debt.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Pencil /> Editar
          </Link>
          {ev.remaining > 0 && (
            <Link href={`/dividas?pagar=${debt.id}${nextOpen ? `&parcela=${nextOpen.id}` : ""}`} className={buttonVariants({ size: "lg" })}>
              Registrar pagamento
            </Link>
          )}
        </FormActions>
      </div>
    </RouteSheet>
  )
}

async function PayDialog({ v, installmentId }: { v: DebtView; installmentId?: number }) {
  const row = v.ev.rows.find((r) => r.id === installmentId && !r.paidOn)
  const amount = row?.amount ?? v.ev.remaining
  const matches = row ? await matchPayments({ amount: row.amount, due: row.due }, v.debt.creditor, 3) : []
  return (
    <RouteDialog closeHref={`/dividas?ver=${v.debt.id}`} title="Registrar pagamento" description={`${v.debt.creditor}${row ? ` · parcela ${installmentOf(v, row)}` : ""}`}>
      <form action={payDebt} className="grid gap-4">
        <input type="hidden" name="debtId" value={v.debt.id} />
        {row && <input type="hidden" name="installmentId" value={row.id} />}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor pago (R$)" hint={row ? "Pagou diferente? O restante é redistribuído nas próximas parcelas." : `Falta pagar ${brl(v.ev.remaining)}.`}>
            <input type="number" name="amount" required min="0.01" step="0.01" defaultValue={amount} className={fieldClass} />
          </Field>
          <Field label="Data do pagamento">
            <input type="date" name="date" required defaultValue={today()} max={today()} className={fieldClass} />
          </Field>
        </div>
        {matches.length > 0 && (
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-medium">Vincular a uma transação</legend>
            <label className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm">
              <input type="radio" name="transactionId" value="" defaultChecked className="accent-primary" />
              Não vincular
            </label>
            {matches.map((t) => (
              <label key={t.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm">
                <input type="radio" name="transactionId" value={t.id} className="accent-primary" />
                <span className="min-w-0 flex-1 truncate" title={t.description}>{t.description}</span>
                <span className="text-muted-foreground tabular-nums">{dateBR(t.date)}</span>
                <b className="whitespace-nowrap tabular-nums">{brl(-t.amount)}</b>
              </label>
            ))}
          </fieldset>
        )}
        <FormActions>
          <Link href={`/dividas?ver=${v.debt.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Cancelar
          </Link>
          <Button type="submit" size="lg">
            Confirmar pagamento
          </Button>
        </FormActions>
      </form>
    </RouteDialog>
  )
}

export default async function DebtsPage({ searchParams }: PageProps<"/dividas">) {
  const sp = await searchParams
  const now = today()
  const { views, salary } = await loadDebts()
  const tab = TABS.find((t) => t.id === first(sp.aba))?.id ?? "abertas"
  const open = views.filter((v) => v.ev.status !== "paid")
  const visible = views.filter((v) => (tab === "abertas" ? v.ev.status !== "paid" : tab === "quitadas" ? v.ev.status === "paid" : true))

  const list = views.map((v) => ({ debt: v.debt, ev: v.ev }))
  const upcoming = dueBetween(list, now, addDays(now, 30))
  const overdue = open.flatMap((v) => v.ev.overdue.map((row) => ({ v, row }))).sort((a, b) => a.row.due!.localeCompare(b.row.due!))
  const overdueSum = overdue.reduce((t, o) => t + o.row.amount, 0)
  const nextRow = dueBetween(list, now, "9999-12-31")[0]
  const paidThisMonth = views.flatMap((v) => v.ev.rows).filter((r) => r.paidOn && monthOf(r.paidOn) === monthOf(now)).reduce((t, r) => t + r.amount, 0)
  const remainingSum = open.reduce((t, v) => t + v.ev.remaining, 0)
  const payoff = payoffMonth(open.map((v) => v.ev))
  const salaryEvents = [monthOf(now), monthOf(addDays(now, 31))]
    .map((ym) => salaryOn(salary, ym))
    .filter((s) => s.expected && s.date >= now && s.date <= addDays(now, 30))
  const timeline = [
    ...upcoming.map(({ debt, row }) => ({ date: row.due!, kind: "debt" as const, debt, row })),
    ...salaryEvents.map((s) => ({ date: s.date, kind: "salary" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const byId = new Map(views.map((v) => [v.debt.id, v]))
  const ver = byId.get(intParam(sp.ver) ?? -1)
  const editar = byId.get(intParam(sp.editar) ?? -1)
  const pagar = byId.get(intParam(sp.pagar) ?? -1)

  return (
    <div className="grid gap-5">
      <PageTitle title="Dívidas" description="O que você deve a pessoas e empresas fora do cartão: parcelas, vencimentos e lembretes.">
        <Link href="/calendario" className={buttonVariants({ variant: "outline" })}>
          <Calendar /> Calendário
        </Link>
        <Link href="/dividas?nova=1" className={buttonVariants()}>
          <Plus /> Nova dívida
        </Link>
      </PageTitle>

      {views.length === 0 ? (
        <Empty icon={HandCoins} title="Nenhuma dívida cadastrada" action={<Link href="/dividas?nova=1" className={buttonVariants()}><Plus />Cadastrar dívida</Link>}>
          Registre o que você deve a amigos, profissionais ou lojas. O fluxo calcula os vencimentos, avisa antes de vencer e mostra tudo no calendário.
        </Empty>
      ) : (
        <>
          <Card className="grid gap-0 py-0 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Em aberto", brl(remainingSum), `${open.length} ${open.length === 1 ? "dívida" : "dívidas"}`, ""],
              ["Próximo pagamento", nextRow ? brl(nextRow.row.amount) : "—", nextRow ? `${dayMonth(nextRow.row.due!)} · ${nextRow.debt.creditor}${nextRow.row.estimated ? " (previsto)" : ""}` : "nada agendado", ""],
              [`Pago em ${monthLabel(monthOf(now))}`, brl(paidThisMonth), "parcelas registradas no mês", "text-income"],
              ["Em atraso", brl(overdueSum), overdue.length ? `${overdue.length} ${overdue.length === 1 ? "parcela" : "parcelas"}` : "tudo em dia", overdueSum > 0 ? "text-expense" : ""],
            ].map(([label, value, hint, cls], i) => (
              <div key={label} className={cn("grid gap-0.5 px-5 py-4", i > 0 && "border-t sm:border-l lg:border-t-0", i === 2 && "sm:border-t lg:border-t-0 sm:border-l-0 lg:border-l", i === 1 && "sm:border-t-0")}>
                <span className="text-sm font-medium text-muted-foreground">{label}</span>
                <span className={cn("text-xl font-semibold tracking-tight whitespace-nowrap tabular-nums", cls)}>{value}</span>
                <span className="truncate text-xs text-muted-foreground" title={hint}>{hint}</span>
              </div>
            ))}
          </Card>

          {overdue.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-expense/30 bg-expense/5 px-4 py-3">
              <span className="grid size-8 place-items-center rounded-lg bg-expense/10 text-expense">
                <CircleAlert className="size-4" />
              </span>
              <p className="min-w-0 flex-1 basis-60 text-sm">
                <b>{brl(overdue[0].row.amount)} para {overdue[0].v.debt.creditor}</b> venceu em {dateBR(overdue[0].row.due!)}
                {overdue.length > 1 && <span className="text-muted-foreground"> · e mais {overdue.length - 1} em atraso</span>}
              </p>
              <Link href={`/dividas?pagar=${overdue[0].v.debt.id}&parcela=${overdue[0].row.id}`} className={buttonVariants({ size: "sm" })}>
                Registrar pagamento
              </Link>
            </div>
          )}

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="grid gap-3" aria-label="Dívidas">
              <nav className="flex w-fit rounded-lg bg-muted p-[3px]" aria-label="Filtro">
                {TABS.map((t) => (
                  <Link key={t.id} href={t.id === "abertas" ? "/dividas" : `/dividas?aba=${t.id}`} aria-current={tab === t.id ? "page" : undefined} className={cn("flex h-8 items-center rounded-md px-3.5 text-sm font-semibold text-muted-foreground", tab === t.id && "bg-card text-foreground shadow-sm")}>
                    {t.label}
                  </Link>
                ))}
              </nav>
              {visible.length === 0 ? <Empty title={tab === "quitadas" ? "Nenhuma dívida quitada" : "Nada por aqui"} /> : visible.map((v) => <DebtCard key={v.debt.id} v={v} />)}
            </section>

            <aside className="grid gap-4">
              <Card className="gap-0 py-0">
                <div className="flex items-center gap-2.5 border-b px-4 py-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <CalendarDays className="size-4" />
                  </span>
                  <div className="grid">
                    <h2 className="text-sm font-semibold">Próximos 30 dias</h2>
                    <span className="text-xs text-muted-foreground">{brl(upcoming.reduce((t, u) => t + u.row.amount, 0))} a pagar</span>
                  </div>
                </div>
                {timeline.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum vencimento nos próximos 30 dias.</p>
                ) : (
                  <ul className="divide-y">
                    {timeline.map((t, i) =>
                      t.kind === "debt" ? (
                        <li key={i}>
                          <Link href={`/dividas?ver=${t.debt.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
                            <span className="grid w-11 shrink-0 text-center text-xs leading-tight font-semibold text-warning">
                              <span className="text-base tabular-nums">{+t.date.slice(8)}</span>
                              {dayMonth(t.date).split(" ")[1]}
                            </span>
                            <span className="grid min-w-0 flex-1">
                              <span className="truncate font-medium" title={t.debt.creditor}>{t.debt.creditor}</span>
                              <span className="text-xs text-muted-foreground">
                                Parcela {t.row.number}
                                {t.row.estimated && " · data prevista"}
                              </span>
                            </span>
                            <b className="whitespace-nowrap tabular-nums">{brl(t.row.amount)}</b>
                          </Link>
                        </li>
                      ) : (
                        <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm text-income">
                          <span className="grid w-11 shrink-0 text-center text-xs leading-tight font-semibold">
                            <span className="text-base tabular-nums">{+t.date.slice(8)}</span>
                            {dayMonth(t.date).split(" ")[1]}
                          </span>
                          <span className="flex-1 font-medium">Salário previsto</span>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </Card>

              <Card className="flex-row items-start gap-3 p-4">
                <CofyAvatar size={36} />
                <div className="grid gap-1 text-sm">
                  <b>Dica do Cofy</b>
                  <p className="text-muted-foreground">
                    {open.length === 0
                      ? "Sem dívidas em aberto. Que bom!"
                      : payoff
                        ? `Mantendo os pagamentos agendados, você zera tudo em ${monthLabel(payoff)}.`
                        : `Faltam ${brl(remainingSum)}. Algumas dívidas são de pagamento livre: combine um valor mensal e eu monto o plano.`}
                  </p>
                  <Link href={`/cofy?q=${encodeURIComponent("Monte um plano para quitar minhas dívidas")}`} className="font-semibold text-primary hover:underline">
                    Montar um plano com o Cofy
                  </Link>
                </div>
              </Card>
            </aside>
          </div>
        </>
      )}

      {sp.nova && (
        <RouteDialog closeHref="/dividas" title="Nova dívida" description="Para quem você deve, quanto e quando vence." className="sm:max-w-xl">
          <DebtForm action={saveDebt} initial={EMPTY_DEBT} closeHref="/dividas" />
        </RouteDialog>
      )}
      {editar && (
        <RouteDialog closeHref={`/dividas?ver=${editar.debt.id}`} title="Editar dívida" description="As parcelas já pagas não mudam; o que falta é refeito." className="sm:max-w-xl">
          {/* formulários separados: os botões do rodapé do modal os acionam pelo atributo `form` */}
          <form id="archive-debt" action={archiveDebtAction}>
            <input type="hidden" name="id" value={editar.debt.id} />
          </form>
          <form id="delete-debt" action={deleteDebtAction}>
            <input type="hidden" name="id" value={editar.debt.id} />
          </form>
          <DebtForm
            action={saveDebt}
            initial={formValue(editar)}
            closeHref={`/dividas?ver=${editar.debt.id}`}
            editing
            start={
              <>
                <Button type="submit" form="delete-debt" variant="destructive" size="lg">
                  Excluir
                </Button>
                <Button type="submit" form="archive-debt" variant="ghost" size="lg">
                  Arquivar
                </Button>
              </>
            }
          />
        </RouteDialog>
      )}
      {pagar && <PayDialog v={pagar} installmentId={intParam(sp.parcela)} />}
      {ver && !editar && !pagar && <DetailSheet v={ver} />}
    </div>
  )
}
