import { ArrowLeftRight, ChevronLeft, ChevronRight, HandCoins, Wallet, X } from "lucide-react"
import Link from "next/link"
import { AccountAvatar } from "@/components/account-avatar"
import { Money, PageTitle } from "@/components/bits"
import { AccountFilter, CategoryFilter } from "@/components/calendar-filters"
import { RouteSheet } from "@/components/route-overlay"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { accountLook } from "@/lib/banks"
import { addMonths, monthEnd, monthOf, monthStart, today } from "@/lib/domain/dates"
import { dueBetween, salaryOn } from "@/lib/domain/debts"
import { loadDebts } from "@/lib/debts"
import { brl, dateBR, dayLabel } from "@/lib/format"
import { categoryTree, dailyTotals, listAccounts, listTransactions, parseFilters, withParams } from "@/lib/queries"
import { cn } from "@/lib/utils"

const WEEKDAYS = [
  ["dom", "D"],
  ["seg", "S"],
  ["ter", "T"],
  ["qua", "Q"],
  ["qui", "Q"],
  ["sex", "S"],
  ["sáb", "S"],
] as const
const MONTH = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
// "−298", "1,2 mil": no celular a célula é estreita, então sem casas decimais abaixo de mil
const compact = (n: number) => (n < 1000 ? Math.round(n).toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 }))
const full = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined)

export default async function CalendarPage({ searchParams }: PageProps<"/calendario">) {
  const sp = await searchParams
  const now = today()
  const mes = first(sp.mes)
  const ym = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : monthOf(now)
  const dia = first(sp.dia)
  const day = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && monthOf(dia) === ym ? dia : undefined

  // O calendário cobre o mês inteiro; conta e categorias vêm da URL (sem transferências nem ignoradas nos totais)
  const f = parseFilters({ conta: sp.conta, categorias: sp.categorias, periodo: "custom", de: monthStart(ym), ate: monthEnd(ym) })
  const [totals, accounts, tree, dayList, debtData] = await Promise.all([
    dailyTotals(f),
    listAccounts(),
    categoryTree(),
    day ? listTransactions({ ...f, from: day, to: day, page: 1 }) : undefined,
    loadDebts(),
  ])
  // Vencimentos de dívidas e salário previsto entram no mês (cada um pode ser escondido pelo filtro da URL)
  const showDebts = first(sp.dividas) !== "0"
  const showSalary = first(sp.salario) !== "0"
  const debtDue = new Map<string, { debtId: number; creditor: string; amount: number; number: number; estimated: boolean }[]>()
  if (showDebts)
    for (const { debt, row } of dueBetween(debtData.views.map((v) => ({ debt: v.debt, ev: v.ev })), monthStart(ym), monthEnd(ym)))
      debtDue.set(row.due!, [...(debtDue.get(row.due!) ?? []), { debtId: debt.id, creditor: debt.creditor, amount: row.amount, number: row.number, estimated: row.estimated }])
  const sal = salaryOn(debtData.salary, ym)
  const salaryDay = showSalary && sal.expected && sal.date >= now ? sal.date : undefined
  const debtMonthTotal = [...debtDue.values()].flat().reduce((t, d) => t + d.amount, 0)
  const activeAccounts = accounts.filter((a) => !a.archived)
  const looks = new Map(accounts.map((a) => [a.id, accountLook({ name: a.name, bank: a.bank, color: a.color, institution: a.institution })]))
  const catLabel = new Map(tree.flatMap((p) => [[p.id, { name: p.name, color: p.color }] as const, ...p.subs.map((s) => [s.id, { name: `${p.name} › ${s.name}`, color: p.color }] as const)]))

  const [y, m] = ym.split("-").map(Number)
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const daysInMonth = Number(monthEnd(ym).slice(8))
  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => (i < lead || i >= lead + daysInMonth ? null : `${ym}-${String(i - lead + 1).padStart(2, "0")}`))

  const month = [...totals.values()].reduce((t, d) => ({ income: t.income + d.income, expense: t.expense + d.expense, count: t.count + d.count }), { income: 0, expense: 0, count: 0 })
  const maxExpense = Math.max(0, ...[...totals.values()].map((d) => d.expense))
  const href = (patch: Record<string, string | number | undefined>) => `/calendario${withParams(sp, patch)}`
  const selected = f.categoryIds ?? []
  const closeHref = href({ dia: undefined })
  const dayTotals = day ? totals.get(day) : undefined

  return (
    <div className="grid gap-4">
      <PageTitle title="Calendário" description="Quanto entrou e quanto saiu em cada dia. Clique num dia para ver as transações.">
        <div className="flex items-center gap-1" role="group" aria-label="Mês">
          <Link href={href({ mes: addMonths(ym, -1), dia: undefined })} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Mês anterior">
            <ChevronLeft />
          </Link>
          <span className="min-w-36 text-center text-sm font-semibold">{cap(MONTH.format(new Date(Date.UTC(y, m - 1, 1))))}</span>
          <Link href={href({ mes: addMonths(ym, 1), dia: undefined })} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Próximo mês">
            <ChevronRight />
          </Link>
        </div>
        {ym !== monthOf(now) && (
          <Link href={href({ mes: undefined, dia: undefined })} className={buttonVariants({ variant: "outline" })}>
            Hoje
          </Link>
        )}
      </PageTitle>

      <div className="flex flex-wrap items-center gap-2">
        <AccountFilter accounts={activeAccounts.map((a) => ({ id: a.id, name: a.name }))} value={f.accountId} />
        <CategoryFilter tree={tree} selected={selected} />
        {selected.map((id) => {
          const c = catLabel.get(id)
          if (!c) return null
          return (
            <Link key={id} href={href({ categorias: selected.filter((x) => x !== id).join(",") || undefined, dia: undefined })} className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card pr-1.5 pl-2.5 text-xs font-medium hover:bg-muted" aria-label={`Remover filtro ${c.name}`}>
              <span className="size-2 rounded-full" style={{ background: c.color }} />
              {c.name}
              <X className="size-3.5 text-muted-foreground" />
            </Link>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Mostrar no calendário">
        <Link href={href({ dividas: showDebts ? "0" : undefined, dia: undefined })} aria-pressed={showDebts} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium", showDebts ? "border-amber-500/40 bg-amber-500/10 text-warning" : "text-muted-foreground hover:bg-muted")}>
          <HandCoins className="size-3.5" />
          Dívidas a pagar{showDebts && debtMonthTotal > 0 && <span className="tabular-nums">· {brl(debtMonthTotal)}</span>}
        </Link>
        <Link href={href({ salario: showSalary ? "0" : undefined, dia: undefined })} aria-pressed={showSalary} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium", showSalary ? "border-income/40 bg-income/10 text-income" : "text-muted-foreground hover:bg-muted")}>
          <Wallet className="size-3.5" />
          Salário previsto
        </Link>
      </div>

      <section className="grid grid-cols-3 gap-3" aria-label="Resumo do mês">
        {[
          { label: "Recebido", value: month.income, cls: "text-income" },
          { label: "Gasto", value: month.expense, cls: "text-expense" },
          { label: "Resultado", value: month.income - month.expense, signed: true },
        ].map((k) => (
          <Card key={k.label} className="gap-0.5 px-4 py-3">
            <span className="text-xs font-medium text-muted-foreground sm:text-sm">{k.label} no mês</span>
            {k.signed ? <Money value={k.value} signed className="text-base font-semibold tracking-tight sm:text-xl" /> : <span className={cn("text-base font-semibold tracking-tight tabular-nums sm:text-xl", k.cls)}>{brl(k.value)}</span>}
          </Card>
        ))}
      </section>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground" aria-hidden>
          {WEEKDAYS.map(([long, short], i) => (
            <div key={i} className="py-2">
              <span className="sm:hidden">{short}</span>
              <span className="hidden capitalize sm:inline">{long}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border" role="grid" aria-label="Dias do mês">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="min-h-[4.5rem] bg-muted/30 sm:min-h-24" role="gridcell" />
            const t = totals.get(d)
            const dues = debtDue.get(d)
            const isToday = d === now
            const net = t ? t.income - t.expense : 0
            return (
              <Link
                key={d}
                href={href({ dia: d })}
                scroll={false}
                role="gridcell"
                aria-label={`${dayLabel(d)}${t ? `: recebido ${full(t.income)}, gasto ${full(t.expense)}` : ": sem lançamentos"}${dues ? `, a pagar ${dues.map((x) => `${x.creditor} ${full(x.amount)}`).join(", ")}` : ""}${d === salaryDay ? ", salário previsto" : ""}`}
                aria-current={isToday ? "date" : undefined}
                className={cn("group relative flex min-h-[4.5rem] flex-col gap-0.5 bg-card p-1 outline-none hover:bg-muted/60 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring sm:min-h-24 sm:p-2", d === day && "bg-primary/5 ring-2 ring-primary ring-inset")}
              >
                <span className={cn("grid size-6 place-items-center rounded-full text-xs font-medium tabular-nums", isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{Number(d.slice(8))}</span>
                {(dues || d === salaryDay) && (
                  <span className="grid gap-0.5 text-[10px] leading-tight font-semibold sm:text-[11px]">
                    {dues?.slice(0, 1).map((x) => (
                      <span key={x.debtId} className="flex items-center gap-1 truncate rounded bg-amber-500/15 px-1 py-px text-warning">
                        <HandCoins className="hidden size-3 shrink-0 sm:block" />
                        <span className="truncate">{x.creditor.split(" ")[0]}</span>
                        <span className="hidden tabular-nums sm:inline">{full(x.amount)}</span>
                      </span>
                    ))}
                    {dues && dues.length > 1 && <span className="rounded bg-amber-500/15 px-1 py-px text-warning">+{dues.length - 1}</span>}
                    {d === salaryDay && <span className="truncate rounded border border-dashed border-income/50 px-1 py-px text-income">Salário</span>}
                  </span>
                )}
                {t && (
                  <span className="mt-auto grid gap-0.5 text-[10px] leading-tight font-semibold tabular-nums sm:text-xs">
                    {t.income > 0 && (
                      <span className="truncate text-income">
                        +<span className="sm:hidden">{compact(t.income)}</span>
                        <span className="hidden sm:inline">{full(t.income)}</span>
                      </span>
                    )}
                    {t.expense > 0 && (
                      <span className="truncate text-expense">
                        −<span className="sm:hidden">{compact(t.expense)}</span>
                        <span className="hidden sm:inline">{full(t.expense)}</span>
                      </span>
                    )}
                    {t.expense > 0 && (
                      <span className="hidden h-1 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
                        <span className="block h-full rounded-full bg-expense/60" style={{ width: `${Math.max(8, (t.expense / maxExpense) * 100)}%` }} />
                      </span>
                    )}
                    <span className="sr-only">{net >= 0 ? "saldo positivo" : "saldo negativo"}</span>
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">Valores em reais, sem transferências entre contas e sem transações ignoradas. {month.count} lançamentos no mês.</p>

      {day && dayList && (
        <RouteSheet closeHref={closeHref} title={dayLabel(day)} description={`${dateBR(day)}${f.accountId || selected.length ? " · com filtros" : ""}`}>
          <div className="grid gap-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Recebido", dayTotals?.income ?? 0, "text-income"],
                ["Gasto", dayTotals?.expense ?? 0, "text-expense"],
                ["Resultado", (dayTotals?.income ?? 0) - (dayTotals?.expense ?? 0), ""],
              ].map(([l, v, c]) => (
                <div key={l as string} className="grid gap-0.5 rounded-xl bg-muted p-3">
                  <span className="text-xs text-muted-foreground">{l}</span>
                  {l === "Resultado" ? <Money value={v as number} signed className="text-sm font-semibold" /> : <span className={cn("text-sm font-semibold tabular-nums", c as string)}>{brl(v as number)}</span>}
                </div>
              ))}
            </div>

            {(debtDue.get(day) || day === salaryDay) && (
              <section className="grid gap-1.5">
                <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">A pagar e a receber</h3>
                <ul className="divide-y rounded-xl border border-amber-500/30 bg-amber-500/5">
                  {debtDue.get(day)?.map((x) => (
                    <li key={x.debtId}>
                      <Link href={`/dividas?ver=${x.debtId}`} className="flex items-center gap-3 px-3.5 py-2.5 text-sm hover:bg-amber-500/10">
                        <HandCoins className="size-4 text-warning" />
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate font-medium">{x.creditor}</span>
                          <span className="text-xs text-muted-foreground">Parcela {x.number}{x.estimated && " · data prevista (depende do salário)"}</span>
                        </span>
                        <b className="tabular-nums">{brl(x.amount)}</b>
                      </Link>
                    </li>
                  ))}
                  {day === salaryDay && (
                    <li className="flex items-center gap-3 px-3.5 py-2.5 text-sm text-income">
                      <Wallet className="size-4" />
                      <span className="flex-1 font-medium">Salário previsto</span>
                    </li>
                  )}
                </ul>
              </section>
            )}

            {dayList.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma transação neste dia{f.accountId || selected.length ? " com esses filtros" : ""}.</p>
            ) : (
              <ul className="grid rounded-xl border">
                {dayList.rows.map(({ tx, accountName, color, subName, parentName }) => {
                  const look = looks.get(tx.accountId)
                  return (
                    <li key={tx.id} className={cn("border-b last:border-0", tx.ignored && "opacity-60")}>
                      <Link href={`/transacoes?periodo=custom&de=${tx.date}&ate=${tx.date}&tx=${tx.id}`} className="flex items-center gap-3 px-3.5 py-3 hover:bg-muted/40">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `${tx.kind === "TRANSFER" ? "#71717a" : (color ?? "#f59e0b")}1f`, color: tx.kind === "TRANSFER" ? "#71717a" : (color ?? "#f59e0b") }}>
                          {tx.kind === "TRANSFER" ? <ArrowLeftRight className="size-4" /> : <span className="size-2.5 rounded-full" style={{ background: color ?? "#f59e0b" }} />}
                        </span>
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-sm font-medium">{tx.description}</span>
                          <span className="truncate text-xs text-muted-foreground">{tx.kind === "TRANSFER" ? "Transferência" : subName ? `${parentName} › ${subName}` : "A categorizar"}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            {look && <AccountAvatar look={look} size={14} className="rounded-[4px]" />}
                            <span className="truncate">{accountName}</span>
                          </span>
                        </span>
                        <Money value={tx.amount} signed={tx.kind !== "TRANSFER"} className={cn("shrink-0 text-sm font-medium", tx.kind === "TRANSFER" && "text-muted-foreground")} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            <Link href={`/transacoes?periodo=custom&de=${day}&ate=${day}${f.accountId ? `&conta=${f.accountId}` : ""}`} className={buttonVariants({ variant: "outline" })}>
              Abrir em Transações
            </Link>
          </div>
        </RouteSheet>
      )}
    </div>
  )
}
