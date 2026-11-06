import { CalendarClock, ChartColumn, Coins, Percent, Trash2, TrendingUp, Trophy } from "lucide-react"
import Link from "next/link"
import { Empty } from "@/components/bits"
import { IncomeChart } from "@/components/investment-charts"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CLASS_INFO, TRADE_LABEL, type IncomeType } from "@/lib/domain/investments"
import { brl, monthLabel, signedPct } from "@/lib/format"
import { incomeOverview, type TradeRow } from "@/lib/investments"
import { cn } from "@/lib/utils"
import { deleteTrade } from "../actions"
import { AssetBadge, CardHead, InvestDialogs, InvestHeader } from "../shared"

const TYPES: { key: IncomeType | "ALL"; label: string }[] = [
  { key: "ALL", label: "Todos" },
  { key: "YIELD", label: "FII" },
  { key: "DIVIDEND", label: "Dividendos" },
  { key: "JCP", label: "JCP" },
  { key: "INTEREST", label: "Juros" },
]
const PAGE = 30
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const dayMonth = (d: string) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`
const pct2 = (n: number) => `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
const unit = (r: TradeRow) => (r.quantity ? `${(r.amount / r.quantity).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 })} × ${r.quantity.toLocaleString("pt-BR")}` : null)

export default async function IncomePage({ searchParams }: PageProps<"/investimentos/proventos">) {
  const sp = await searchParams
  const path = "/investimentos/proventos"
  const type = TYPES.find((t) => t.key === sp.tipo)?.key ?? "ALL"
  const limit = Math.min(500, Math.max(PAGE, Number(sp.mais) || PAGE))
  const inc = await incomeOverview(12)
  const match = (r: TradeRow) => type === "ALL" || r.type === type
  const upcoming = inc.upcoming.filter(match)
  const received = inc.received.filter(match)
  const top = inc.byAsset[0]
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ tipo: type === "ALL" ? undefined : type, ...patch })) if (v) p.set(k, v)
    return p.size ? `${path}?${p}` : path
  }

  const kpis = [
    { icon: Coins, label: "Recebido em 12M", value: brl(inc.total), ctx: inc.growth != null ? <><span className={inc.growth >= 0 ? "text-income" : "text-expense"}>{signedPct(inc.growth)}</span> sobre os 12 meses anteriores</> : "nos últimos 12 meses" },
    { icon: ChartColumn, label: "Média mensal", value: brl(inc.average), ctx: inc.best.total ? <>maior mês: {monthLabel(inc.best.month)} · <span className="sensitive">{brl(inc.best.total)}</span></> : "—" },
    { icon: Percent, label: "Yield on cost", value: inc.yieldOnCost != null ? pct2(inc.yieldOnCost) : "—", ctx: inc.payingCost ? <>sobre <span className="sensitive">{brl(inc.payingCost).replace(/,\d\d$/, "")}</span> aplicados em renda variável</> : "sem renda variável" },
    { icon: CalendarClock, label: "A receber", value: brl(inc.upcomingTotal), ctx: inc.upcoming.length ? `${inc.upcoming.length} ${inc.upcoming.length === 1 ? "pagamento anunciado" : "pagamentos anunciados"}` : "nada anunciado" },
  ]

  return (
    <div className="grid gap-4">
      <InvestHeader active={path} path={path} />

      {inc.count === 0 ? (
        <Empty icon={Coins} title="Nenhum provento ainda" action={<Link href={`${path}?lancar=1`} scroll={false} className={buttonVariants()}>Lançar provento</Link>}>
          Proventos que caem na conta da corretora com o ticker na descrição (ex.: &quot;RENDIMENTO MXRF11&quot;) entram sozinhos na sincronização. Os outros você lança aqui.
        </Empty>
      ) : (
        <>
          <section aria-label="Resumo dos proventos" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="grid content-start gap-2 bg-card p-4">
                <span className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary"><k.icon className="size-[18px]" /></span>
                  <span className="text-[11px] leading-[14px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{k.label}</span>
                </span>
                <span className={cn("text-xl font-bold tracking-tight tabular-nums sm:text-2xl", k.label !== "Yield on cost" && "sensitive")}>{k.value}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{k.ctx}</span>
              </div>
            ))}
          </section>

          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card className="gap-4 px-5 py-5">
              <CardHead icon={ChartColumn} title="Proventos por mês" description="Últimos 12 meses, por tipo de pagamento" />
              <IncomeChart data={inc.byMonth} />
            </Card>
            <Card className="gap-3 px-5 py-5">
              <CardHead icon={Trophy} title="Por ativo" description="Quem mais pagou em 12 meses" />
              <div className="grid flex-1 content-start">
                {inc.byAsset.slice(0, 8).map((a) => (
                  <Link key={a.id} href={`/investimentos/ativos/${a.id}`} className="flex min-h-11 items-center gap-3 border-t py-1.5 first:border-0 hover:bg-muted/40">
                    <AssetBadge code={a.code} name={a.name} assetClass={a.assetClass} size={30} />
                    <b className="w-20 shrink-0 truncate text-sm" title={a.code ? `${a.code} · ${a.name}` : a.name}>{a.code ?? a.name}</b>
                    <span className="relative h-2 min-w-12 flex-1 rounded-full bg-muted"><span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(a.total / top.total) * 100}%`, background: CLASS_INFO[a.assetClass].color }} /></span>
                    <b className="w-24 shrink-0 text-right text-sm whitespace-nowrap tabular-nums sensitive">{brl(a.total)}</b>
                  </Link>
                ))}
                {inc.byAsset.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nada recebido nos últimos 12 meses.</p>}
              </div>
            </Card>
          </div>

          <Card className="gap-0 py-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
              <CardHead icon={TrendingUp} title="Pagamentos" description="Anunciados primeiro, depois os já recebidos" />
              <nav className="inline-flex rounded-lg bg-muted p-[3px]" aria-label="Tipo de provento">
                {TYPES.map((t) => (
                  <Link key={t.key} href={href({ tipo: t.key === "ALL" ? undefined : t.key })} scroll={false} aria-current={t.key === type ? "true" : undefined} className={cn("inline-flex h-7 items-center rounded-md px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground", t.key === type && "bg-card text-foreground shadow-sm ring-1 ring-border")}>
                    {t.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="overflow-x-auto">
              <div role="table" aria-label="Pagamentos de proventos" className="min-w-[760px]">
                <Head />
                {upcoming.length > 0 && <Group label="A receber" />}
                {upcoming.map((r) => <PaymentRow key={r.id} r={r} upcoming path={path} />)}
                <Group label="Recebidos" />
                {received.slice(0, limit).map((r) => <PaymentRow key={r.id} r={r} path={path} />)}
                {received.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Nenhum pagamento deste tipo.</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
              <span>JCP já vem com 15% de IR retido na fonte. Valores a receber podem mudar até a data de pagamento.</span>
              {received.length > limit && (
                <Link href={href({ mais: String(limit + PAGE) })} scroll={false} className="font-medium text-primary hover:underline">
                  Ver mais ({received.length - limit})
                </Link>
              )}
            </div>
          </Card>
        </>
      )}

      <InvestDialogs sp={sp} path={path} />
    </div>
  )
}

const COLS = "grid grid-cols-[92px_minmax(200px,2fr)_120px_minmax(150px,1.2fr)_minmax(110px,1fr)_40px] items-center gap-3 px-5"

const Head = () => (
  <div role="row" className={cn(COLS, "h-9 border-y bg-muted/40 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase")}>
    <span>Pagamento</span>
    <span>Ativo</span>
    <span>Tipo</span>
    <span className="text-right">Valor × cotas</span>
    <span className="text-right">Total</span>
    <span />
  </div>
)

const Group = ({ label }: { label: string }) => (
  <div role="row" className="flex h-8 items-center border-t px-5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{label}</div>
)

function PaymentRow({ r, upcoming, path }: { r: TradeRow; upcoming?: boolean; path: string }) {
  const cls = r.override ?? r.autoClass
  return (
    <div role="row" className={cn(COLS, "min-h-14 border-t border-border/60 py-2 text-sm")}>
      <span className="grid text-xs text-muted-foreground">
        <b className="text-sm text-foreground tabular-nums">{dayMonth(r.date)}</b>
        {r.date.slice(0, 4)}
      </span>
      <Link href={`/investimentos/ativos/${r.investmentId}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
        <AssetBadge code={r.code} name={r.name} assetClass={cls} size={32} />
        <span className="grid min-w-0">
          <b className="truncate" title={r.code ?? r.name}>{r.code ?? r.name}</b>
          <span className="truncate text-xs text-muted-foreground" title={r.code ? r.name : undefined}>{r.code ? r.name : CLASS_INFO[cls].label}</span>
        </span>
      </Link>
      <span>
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", upcoming ? "bg-amber-500/10 text-warning" : "bg-muted text-muted-foreground")}>{TRADE_LABEL[r.type]}</span>
      </span>
      <span className="text-right text-xs text-muted-foreground tabular-nums sensitive">{unit(r) ?? "—"}</span>
      <b className={cn("text-right whitespace-nowrap tabular-nums sensitive", !upcoming && "text-income")}>{upcoming ? "" : "+"}{brl(r.amount)}</b>
      <span className="text-right">
        {!r.pluggyId && (
          <form action={deleteTrade}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="back" value={path} />
            <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Excluir provento de ${r.code ?? r.name}`} className="text-muted-foreground hover:text-destructive">
              <Trash2 />
            </Button>
          </form>
        )}
      </span>
    </div>
  )
}
