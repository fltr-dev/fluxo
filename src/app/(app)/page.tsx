import { ArrowDownLeft, ArrowUpRight, ChevronRight, Clock, Gauge, Landmark, Plus, ShieldCheck, Sparkles, Tag, Wallet } from "lucide-react"
import Link from "next/link"
import { auth } from "@/auth"
import { Bar, Delta, Empty, IconCircle, PageTitle } from "@/components/bits"
import { categoryIcon } from "@/components/category-icon"
import { ExpenseGauge, IncomeExpenseChart, NetWorthArea } from "@/components/charts"
import { Filters } from "@/components/filters"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { goalProgress, limitStatus } from "@/lib/domain/calc"
import { addMonths, monthEnd, monthOf, monthStart, monthsInRange, previousPeriod, today } from "@/lib/domain/dates"
import { brl, dateBR, delta, num1, pct } from "@/lib/format"
import {
  byCategory,
  goalsWithProgress,
  limitsWithUsage,
  listAccounts,
  monthlyTotals,
  netWorth,
  parseFilters,
  reserveOverview,
  shellStatus,
  totals,
  withParams,
} from "@/lib/queries"
import { cn } from "@/lib/utils"

const GOAL_STATE = { done: ["Concluída", "bg-muted text-muted-foreground"], on_track: ["No ritmo", "bg-emerald-500/10 text-income"], late: ["Atrasada", "bg-amber-500/10 text-amber-700 dark:text-amber-400"] } as const

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const sp = await searchParams
  const f = parseFilters(sp)
  const now = today()
  const thisMonth = { from: monthStart(monthOf(now)), to: monthEnd(monthOf(now)) }
  const endYm = monthOf(f.to)
  const last12 = monthsInRange(monthStart(addMonths(endYm, -11)), f.to)
  const last6 = { from: monthStart(addMonths(endYm, -5)), to: monthEnd(endYm) }
  const prevPeriod = previousPeriod(f)
  const expenseOnly = { ...f, kind: "EXPENSE" as const }

  const firstName = (await auth())?.user?.name?.split(" ")[0]
  const [accs, cur, prev, cats, prevCats, flow, nw, limits, goals, reserve, status] = await Promise.all([
    listAccounts(),
    totals(f),
    totals(f, prevPeriod),
    byCategory(expenseOnly),
    byCategory({ ...expenseOnly, ...prevPeriod }),
    monthlyTotals(f, last6),
    netWorth(last12),
    limitsWithUsage(thisMonth),
    goalsWithProgress(),
    reserveOverview(),
    shellStatus(),
  ])

  const activeAccounts = accs.filter((a) => !a.archived)
  if (activeAccounts.length === 0) {
    return (
      <div className="grid gap-6">
        <PageTitle title="Olá!" description="Vamos começar pelas suas contas." />
        <Empty
          icon={Landmark}
          title="Conecte sua primeira conta"
          action={
            <Link href="/conexoes" className={buttonVariants()}>
              <Plus />
              Conectar conta
            </Link>
          }
        >
          Cadastre os Item IDs do MeuPluggy para importar contas e transações automaticamente. Você também pode começar com uma conta manual.
        </Empty>
      </div>
    )
  }

  const netWorthNow = activeAccounts.reduce((s, a) => s + a.balance, 0)
  const balance = cur.income - cur.expense
  const prevLabel = "vs período anterior"

  // Gastos: 4 maiores categorias + "Outras" no meio-donut
  const prevByCat = new Map(prevCats.map((c) => [c.id, c.total]))
  const top = cats.slice(0, 4)
  const rest = cats.slice(4).reduce((s, c) => s + c.total, 0)
  const gauge = [
    ...top.map((c) => ({ name: c.name ?? "A categorizar", value: c.total, color: c.color ?? "#a1a1aa" })),
    ...(rest > 0 ? [{ name: "Outras", value: rest, color: "#a1a1aa" }] : []),
  ]

  // Precisa de atenção: limites ≥ 80%, pendências de categoria e conexões com erro
  const alerts = [
    ...limits
      .map((l) => ({ l, s: limitStatus(l.spent, l.limit) }))
      .filter(({ s }) => s.state !== "ok")
      .sort((a, b) => b.s.pct - a.s.pct)
      .map(({ l, s }) => ({
        key: `l${l.id}`,
        href: "/limites",
        icon: Gauge,
        color: s.state === "over" ? "#ef4444" : "#f59e0b",
        title: s.state === "over" ? `${l.label} passou do limite` : `${l.label} perto do limite`,
        desc: `${brl(l.spent)} de ${brl(l.limit)} · ${pct(s.pct)}`,
      })),
    ...(status.uncategorized > 0
      ? [{ key: "uncat", href: "/transacoes?ver=uncategorized&periodo=12m", icon: Tag, color: "#8b5cf6", title: `${status.uncategorized} transações a categorizar`, desc: "Defina a categoria para entrarem nos relatórios" }]
      : []),
    ...(status.suggested > 0
      ? [{ key: "jev", href: "/transacoes?ver=suggested&periodo=12m", icon: Sparkles, color: "#8b5cf6", title: `${status.suggested} sugestões do Jev`, desc: "Confirme ou rejeite" }]
      : []),
    ...status.connectionErrors.map((c) => ({ key: `c${c.id}`, href: "/conexoes", icon: Clock, color: "#71717a", title: `Problema na conexão ${c.name}`, desc: c.error ?? "" })),
  ]

  const goalRows = goals
    .map((g) => ({ g, p: goalProgress({ target: g.targetAmount, current: g.current, createdAt: g.createdAt.toISOString().slice(0, 10), deadline: g.deadline, today: now }) }))
    .sort((a, b) => Number(a.p.state === "done") - Number(b.p.state === "done"))
    .slice(0, 3)

  const kpis = [
    { label: "Receitas", value: brl(cur.income), icon: ArrowDownLeft, color: "#10b981", delta: delta(cur.income, prev.income), upIsGood: true },
    { label: "Despesas", value: brl(cur.expense), icon: ArrowUpRight, color: "#f43f5e", delta: delta(cur.expense, prev.expense), upIsGood: false },
    { label: "Saldo do período", value: `${balance > 0 ? "+" : ""}${brl(balance)}`, valueClass: balance >= 0 ? "text-income" : "text-expense", icon: Wallet, color: "#0ea5e9", delta: delta(balance, prev.income - prev.expense), upIsGood: true },
  ]

  return (
    <div className="grid gap-4">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Olá{firstName ? `, ${firstName}` : ""}</h1>
          <p className="text-sm text-muted-foreground">Resumo de {dateBR(f.from)} a {dateBR(f.to)}</p>
        </div>
        <Filters f={f} sp={sp} />
      </div>

      <Card className="gap-0 py-6">
        <CardContent className="px-6">
          <NetWorthArea data={nw} current={netWorthNow} />
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" aria-label="Indicadores">
        {kpis.map((k) => (
          <Card key={k.label} className="gap-3">
            <CardContent className="flex items-start justify-between gap-2">
              <div className="grid min-w-0 gap-1">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <span className={cn("truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl", k.valueClass)}>{k.value}</span>
              </div>
              <IconCircle icon={k.icon} color={k.color} className="hidden sm:grid" />
            </CardContent>
            <CardContent className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Delta value={k.delta} upIsGood={k.upIsGood} />
              {prevLabel}
            </CardContent>
          </Card>
        ))}
        <Link href="/reserva" className="contents">
          <Card className="gap-3 transition-colors hover:bg-muted/40">
            <CardContent className="flex items-start justify-between gap-2">
              <div className="grid min-w-0 gap-1">
                <span className="text-sm text-muted-foreground">Reserva de emergência</span>
                <span className="text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
                  {reserve.coverageMonths == null ? "—" : `${num1(reserve.coverageMonths)} meses`}
                </span>
              </div>
              <IconCircle icon={ShieldCheck} color="#8b5cf6" className="hidden sm:grid" />
            </CardContent>
            <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bar value={reserve.pct} color="#8b5cf6" className="h-1.5" />
              <span className="shrink-0">{pct(reserve.pct)} do alvo</span>
            </CardContent>
          </Card>
        </Link>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="font-semibold">Maiores gastos</CardTitle>
            <span className="text-xs text-muted-foreground">{prevLabel}</span>
          </CardHeader>
          <CardContent className="grid gap-1">
            {top.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sem despesas no período.</p>}
            {top.map((c) => {
              const d = delta(c.total, prevByCat.get(c.id) ?? 0)
              const href = c.id ? `/relatorios${withParams(sp, { aba: "categorias", categoria: c.id })}` : "/transacoes?ver=uncategorized"
              return (
                <Link key={c.id ?? "none"} href={href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                  <IconCircle icon={categoryIcon(c.name)} color={c.color ?? "#a1a1aa"} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name ?? "A categorizar"}</span>
                  <span className="grid justify-items-end">
                    <span className="text-sm font-semibold tabular-nums">{brl(c.total)}</span>
                    <Delta value={d} upIsGood={false} />
                  </span>
                </Link>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="font-semibold">Despesas por categoria</CardTitle>
            <Link href={`/relatorios${withParams(sp, { aba: "categorias" })}`} className="text-sm font-medium text-primary hover:underline">Detalhar</Link>
          </CardHeader>
          <CardContent>
            <ExpenseGauge data={gauge} total={cur.expense} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Receitas x despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <IncomeExpenseChart
              data={monthsInRange(last6.from, last6.to).map((m) => ({ month: m, income: flow.get(m)?.income ?? 0, expense: flow.get(m)?.expense ?? 0 }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="font-semibold">Precisa de atenção</CardTitle>
            {alerts.length > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">{alerts.length}</span>}
          </CardHeader>
          <CardContent className="grid gap-0.5">
            {alerts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Tudo em dia por aqui.</p>}
            {alerts.map((a) => (
              <Link key={a.key} href={a.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                <IconCircle icon={a.icon} color={a.color} soft className="size-8" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{a.title}</span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">{a.desc}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="font-semibold">Metas</CardTitle>
            <Link href="/metas" className="text-sm font-medium text-primary hover:underline">Ver todas</Link>
          </CardHeader>
          <CardContent className="grid gap-5">
            {goalRows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma meta ainda.</p>}
            {goalRows.map(({ g, p }) => {
              const [label, cls] = GOAL_STATE[p.state]
              return (
                <Link key={g.id} href="/metas" className="grid gap-2">
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{g.name}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>
                  </span>
                  <Bar value={p.pct} state={p.state === "late" ? "warn" : "ok"} />
                  <span className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                    <span>{brl(g.current)} de {brl(g.targetAmount)}</span>
                    {p.state !== "done" && <span>{brl(p.monthlyNeeded)}/mês</span>}
                  </span>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
