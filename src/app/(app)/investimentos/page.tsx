import { ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, ChartColumn, ChartLine, ChartPie, Coins, Landmark, Percent, Plus, Star, Target, TrendingUp, Wallet } from "lucide-react"
import Link from "next/link"
import { Empty } from "@/components/bits"
import { AllocationPanel, EvolutionChart, MonthlyReturnsChart } from "@/components/investment-charts"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { addMonths, monthOf, today } from "@/lib/domain/dates"
import { CLASS_INFO, TRADE_LABEL } from "@/lib/domain/investments"
import { brl, monthLabel, signedPct } from "@/lib/format"
import { firstHistoryMonth, incomeOverview, portfolioHistory, portfolioSummary } from "@/lib/investments"
import { cn } from "@/lib/utils"
import { AssetBadge, CardHead, ClassDot, InvestDialogs, InvestHeader } from "./shared"

const PERIODS = { "6m": "6M", "12m": "12M", ano: "No ano", tudo: "Tudo" } as const
type PeriodKey = keyof typeof PERIODS

const pct1 = (n: number) => `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const brl0 = (n: number) => brl(n).replace(/,\d\d$/, "")

export default async function InvestmentsPage({ searchParams }: PageProps<"/investimentos">) {
  const sp = await searchParams
  const period: PeriodKey = typeof sp.periodo === "string" && sp.periodo in PERIODS ? (sp.periodo as PeriodKey) : "12m"
  const now = today()
  const current = monthOf(now)
  const first = await firstHistoryMonth()
  const startMonth =
    period === "6m" ? addMonths(current, -5) : period === "ano" ? `${now.slice(0, 4)}-01` : period === "tudo" ? (first && first < current ? addMonths(first, 1) : current) : addMonths(current, -11)
  const months: string[] = []
  for (let m = startMonth; m <= current; m = addMonths(m, 1)) months.push(m)

  const [summary, history, income] = await Promise.all([portfolioSummary(), portfolioHistory(months), incomeOverview(12)])
  const path = "/investimentos"

  const header = (
    <InvestHeader active="/investimentos" path={path}>
      <nav className="inline-flex rounded-lg bg-muted p-[3px]" aria-label="Período">
        {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
          <Link key={k} href={k === "12m" ? path : `${path}?periodo=${k}`} scroll={false} aria-current={k === period ? "true" : undefined} className={cn("inline-flex h-7 items-center rounded-md px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground", k === period && "bg-card text-foreground shadow-sm ring-1 ring-border")}>
            {PERIODS[k]}
          </Link>
        ))}
      </nav>
    </InvestHeader>
  )

  if (summary.holdings.length === 0) {
    return (
      <div className="grid gap-5">
        {header}
        <Empty
          icon={TrendingUp}
          title="Nenhum investimento ainda"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/contas" className={buttonVariants({ variant: "outline" })}>
                <Landmark />
                Conectar corretora
              </Link>
              <Link href={`${path}?novo=1`} className={buttonVariants()}>
                <Plus />
                Lançar ativo
              </Link>
            </div>
          }
        >
          Conecte a corretora pela Pluggy (em Contas) para trazer ações, FIIs, títulos e fundos automaticamente, ou lance à mão o que não vem pelo Open Finance, como cripto. Já tem a corretora conectada? Clique em Sincronizar no topo: os ativos aparecem aqui na próxima sincronização.
        </Empty>
        <InvestDialogs sp={sp} path={path} />
      </div>
    )
  }

  const pts = history.points
  const last = pts[pts.length - 1]
  const prev = pts[pts.length - 2]
  const monthFlow = summary.holdings.length && last.applied != null && prev?.applied != null ? last.applied - prev.applied : null
  const monthChange = last.value != null && prev?.value != null ? last.value - prev.value : null
  const allocation = summary.allocation.filter((a) => a.value > 0)
  const ranked = summary.holdings.filter((h) => h.profitPct != null && h.invested)
  const tops = [...ranked].sort((a, b) => b.profitPct! - a.profitPct!).slice(0, 3)
  const flops = [...ranked].sort((a, b) => a.profitPct! - b.profitPct!).filter((h) => !tops.includes(h)).slice(0, 3)
  const windowLabel = history.since ? (history.since === months[0] ? PERIODS[period] : `desde ${monthLabel(history.since)}`) : null

  const kpis = [
    {
      icon: Wallet,
      tone: "primary",
      label: "Patrimônio",
      value: brl(summary.total),
      ctx: monthChange != null ? (
        <>
          <span className={cn("sensitive", monthChange >= 0 ? "text-income" : "text-expense")}>
            {monthChange >= 0 ? "+" : "−"}
            {brl(Math.abs(monthChange))}
          </span>{" "}
          no mês{monthFlow ? <> · <span className="sensitive">{brl0(monthFlow)}</span> em aportes</> : ""}
        </>
      ) : (
        `${summary.holdings.length} ativos`
      ),
    },
    { icon: Banknote, tone: "neutral", label: "Valor aplicado", value: brl(summary.invested), ctx: `${summary.holdings.length} ativos em ${allocation.length} ${allocation.length === 1 ? "categoria" : "categorias"}` },
    {
      icon: TrendingUp,
      tone: summary.profit >= 0 ? "income" : "expense",
      label: "Lucro",
      value: `${summary.profit >= 0 ? "+" : "−"}${brl(Math.abs(summary.profit))}`,
      valueClass: summary.profit >= 0 ? "text-income" : "text-expense",
      ctx: summary.profitPct != null ? <><span className={cn("rounded-md px-1.5 py-px font-semibold", summary.profit >= 0 ? "bg-income/10 text-income" : "bg-expense/10 text-expense")}>{signedPct(summary.profitPct)}</span> sobre o aplicado</> : null,
    },
    {
      icon: Percent,
      tone: "primary",
      label: `Rentabilidade${windowLabel ? ` ${windowLabel}` : ""}`,
      value: history.accReturn != null ? signedPct(history.accReturn) : "—",
      ctx: history.pctOfCdi != null ? `${Math.round(history.pctOfCdi * 100)}% do CDI · CDI ${pct1(history.cdiReturn!)}` : history.accReturn == null ? "aparece com 2 meses de histórico" : "CDI ainda não carregado",
    },
    { icon: Coins, tone: "primary", label: "Proventos 12M", value: brl(income.total), ctx: <>média de <span className="sensitive">{brl0(income.average)}</span>/mês · <Link href="/investimentos/proventos" className="font-medium text-primary hover:underline">ver</Link></> },
  ]
  const TONE: Record<string, string> = { primary: "bg-primary/10 text-primary", neutral: "bg-muted text-foreground/80", income: "bg-income/10 text-income", expense: "bg-expense/10 text-expense" }

  return (
    <div className="grid gap-4">
      {header}

      <section aria-label="Resumo da carteira" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k, i) => (
          <div key={k.label} className={cn("grid content-start gap-2 bg-card p-4", i === 0 && "max-sm:col-span-2")}>
            <span className="flex items-center gap-2.5">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", TONE[k.tone])}>
                <k.icon className="size-[18px]" />
              </span>
              <span className="text-[11px] leading-[14px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{k.label}</span>
            </span>
            <span className={cn("text-xl font-bold tracking-tight tabular-nums sm:text-2xl", !k.label.startsWith("Rentabilidade") && "sensitive", k.valueClass)}>{k.value}</span>
            {k.ctx && <span className="text-xs text-muted-foreground tabular-nums">{k.ctx}</span>}
          </div>
        ))}
      </section>

      <Card className="gap-4 px-5 py-5">
        <CardHead icon={ChartLine} title="Evolução da carteira" description="Patrimônio × valor aplicado, ou rentabilidade acumulada × índices" />
        <EvolutionChart data={pts.slice(1)} />
      </Card>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card className="gap-4 px-5 py-5">
          <CardHead icon={ChartPie} title="Alocação por categoria" description="Quanto cada classe pesa na carteira" />
          <AllocationPanel
            rows={allocation.map((a) => ({ key: a.assetClass, label: CLASS_INFO[a.assetClass].label, color: CLASS_INFO[a.assetClass].color, value: a.value }))}
            total={summary.total}
          />
        </Card>

        <Card className="gap-4 px-5 py-5">
          <CardHead icon={Target} title="Atual × alvo" description={summary.hasTargets ? "Para rebalancear sem vender, aporte nas categorias abaixo do alvo" : "Defina quanto quer em cada categoria"}>
            <Link href={`${path}?alvo=1`} scroll={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {summary.hasTargets ? "Editar alvo" : "Definir alvo"}
            </Link>
          </CardHead>
          {summary.hasTargets ? (
            <div className="flex flex-1 flex-col justify-between">
              <div className="grid grid-cols-[minmax(96px,1fr)_minmax(110px,2.2fr)_84px_minmax(104px,auto)] gap-3 pb-1 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase max-sm:hidden">
                <span>Categoria</span>
                <span>Atual · ▍alvo</span>
                <span className="text-right">Atual / alvo</span>
                <span className="text-right">Para o alvo</span>
              </div>
              {summary.allocation.map((a) => {
                const scale = Math.max(0.45, ...summary.allocation.map((x) => Math.max(x.pct, x.target ?? 0))) * 1.05
                return (
                  <div key={a.assetClass} className="grid grid-cols-[minmax(96px,1fr)_minmax(80px,2.2fr)_auto] items-center gap-x-3 gap-y-1 border-t py-2 sm:grid-cols-[minmax(96px,1fr)_minmax(110px,2.2fr)_84px_minmax(104px,auto)]">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><ClassDot assetClass={a.assetClass} /><span className="truncate">{CLASS_INFO[a.assetClass].label}</span></span>
                    <span className="relative h-2 rounded-full bg-muted" aria-hidden>
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (a.pct / scale) * 100)}%`, background: CLASS_INFO[a.assetClass].color }} />
                      {a.target != null && <span className="absolute -top-1 h-4 w-0.5 rounded-sm bg-foreground" style={{ left: `calc(${(a.target / scale) * 100}% - 1px)` }} />}
                    </span>
                    <span className="text-right text-[13px] tabular-nums max-sm:hidden"><b>{pct1(a.pct)}</b> <span className="text-muted-foreground">/ {a.target != null ? `${Math.round(a.target * 1000) / 10}%` : "—"}</span></span>
                    <span className="text-right">
                      {a.target == null ? (
                        <span className="text-xs text-muted-foreground">sem alvo</span>
                      ) : a.need! > 0.5 ? (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums sensitive">aportar {brl0(a.need!)}</span>
                      ) : (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{a.diff! > 0.0005 ? `${(a.diff! * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pp acima` : "no alvo"}</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty icon={Target} title="Sem alocação-alvo" action={<Link href={`${path}?alvo=1`} scroll={false} className={buttonVariants()}>Definir alvo</Link>}>
              Diga quanto quer em cada categoria (ex.: 35% pós-fixado, 20% ações) e o fluxo mostra onde aportar para chegar lá.
            </Empty>
          )}
        </Card>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="gap-4 px-5 py-5">
          <CardHead icon={ChartColumn} title="Rentabilidade mês a mês" description="Barras: carteira · traço: CDI do mês" />
          <MonthlyReturnsChart data={pts.slice(1).map((p) => ({ month: p.month, ret: p.ret, cdi: p.cdi }))} />
          {history.monthsWithCdi > 0 && (
            <p className="text-xs text-muted-foreground">
              {history.monthsAboveCdi} de {history.monthsWithCdi} {history.monthsWithCdi === 1 ? "mês" : "meses"} acima do CDI · o mês atual vai até hoje
            </p>
          )}
        </Card>

        <Card className="gap-4 px-5 py-5">
          <CardHead icon={Coins} title="Proventos" description="Dividendos, JCP e rendimentos de FII">
            <Link href="/investimentos/proventos" className={buttonVariants({ variant: "ghost", size: "sm" })}>Ver todos</Link>
          </CardHead>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border">
            <div className="grid bg-card px-3.5 py-2.5">
              <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Recebido 12M</span>
              <b className="text-lg tabular-nums sensitive">{brl(income.total)}</b>
              <span className="text-xs text-muted-foreground">{income.yieldOnCost != null ? `yield on cost ${pct1(income.yieldOnCost)}` : "—"}</span>
            </div>
            <div className="grid bg-card px-3.5 py-2.5">
              <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">A receber</span>
              <b className="text-lg tabular-nums sensitive">{brl(income.upcomingTotal)}</b>
              <span className="text-xs text-muted-foreground">{income.upcoming.length ? `${income.upcoming.length} ${income.upcoming.length === 1 ? "pagamento anunciado" : "pagamentos anunciados"}` : "nada anunciado"}</span>
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-end">
            <span className="flex items-center gap-1.5 pb-1 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"><CalendarDays className="size-3.5" />{income.upcoming.length ? "Próximos pagamentos" : "Últimos recebidos"}</span>
            {(income.upcoming.length ? income.upcoming : income.received).slice(0, 3).map((r) => (
              <div key={r.id} className="flex min-h-12 items-center gap-3 border-t py-1.5">
                <span className="w-12 text-[13px] font-bold tabular-nums">{dayMonth(r.date)}</span>
                <AssetBadge code={r.code} name={r.name} assetClass={r.override ?? r.autoClass} size={32} />
                <span className="grid min-w-0 flex-1">
                  <b className="truncate text-sm" title={r.code ? `${r.code} · ${r.name}` : r.name}>{r.code ?? r.name}</b>
                  <span className="text-xs text-muted-foreground">{TRADE_LABEL[r.type]}</span>
                </span>
                <b className="text-sm whitespace-nowrap tabular-nums sensitive">{brl(r.amount)}</b>
              </div>
            ))}
            {income.count === 0 && <p className="border-t py-3 text-sm text-muted-foreground">Nenhum provento registrado ainda.</p>}
          </div>
        </Card>
      </div>

      {ranked.length > 0 && (
        <Card className="gap-4 px-5 py-5">
          <CardHead icon={Star} title="Destaques" description="Rentabilidade de cada ativo desde a compra">
            <Link href="/investimentos/ativos" className={buttonVariants({ variant: "ghost", size: "sm" })}>Ver todos os ativos</Link>
          </CardHead>
          <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {[
              { title: "Maiores altas", icon: ArrowUpRight, list: tops, cls: "text-income" },
              { title: "Maiores baixas", icon: ArrowDownRight, list: flops, cls: "text-expense" },
            ].map((g) => (
              <div key={g.title} className="grid content-start">
                <span className={cn("flex items-center gap-1.5 pb-1 text-[11px] font-bold tracking-[0.08em] uppercase", g.cls)}><g.icon className="size-3.5" />{g.title}</span>
                {g.list.map((h) => (
                  <Link key={h.id} href={`/investimentos/ativos/${h.id}`} className="flex min-h-13 items-center gap-3 rounded-lg border-t py-2 hover:bg-muted/50">
                    <AssetBadge code={h.code} name={h.name} assetClass={h.assetClass} />
                    <span className="grid min-w-0 flex-1">
                      <b className="truncate text-sm" title={h.code ?? h.name}>{h.code ?? h.name}</b>
                      <span className="truncate text-xs text-muted-foreground" title={h.code ? h.name : undefined}>{h.code ? `${h.name} · ` : ""}{CLASS_INFO[h.assetClass].label}{h.manual ? " · manual" : ""}</span>
                    </span>
                    <b className={cn("text-sm whitespace-nowrap tabular-nums", h.profitPct! >= 0 ? "text-income" : "text-expense")}>{signedPct(h.profitPct!)}</b>
                  </Link>
                ))}
                {g.list.length === 0 && <p className="border-t py-3 text-sm text-muted-foreground">Nenhum ativo aqui.</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <InvestDialogs sp={sp} path={path} />
    </div>
  )
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const dayMonth = (d: string) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`
