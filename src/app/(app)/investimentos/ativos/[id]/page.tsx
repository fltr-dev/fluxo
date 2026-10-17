import { ArrowLeftRight, ChevronLeft, ChartLine, Coins, Pencil, Plus, Scale, Trash2 } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Field, fieldClass } from "@/components/bits"
import { FormSelect } from "@/components/form-select"
import { EvolutionChart } from "@/components/investment-charts"
import { RouteDialog } from "@/components/route-overlay"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { addMonths, monthOf, today } from "@/lib/domain/dates"
import { CLASS_INFO, CLASS_ORDER, isIncome, positionFromTrades, TRADE_LABEL } from "@/lib/domain/investments"
import { ago, brl, dateBR, signedPct } from "@/lib/format"
import { listHoldings, listTrades, portfolioHistory } from "@/lib/investments"
import { cn } from "@/lib/utils"
import { deleteInvestment, deleteTrade, updateInvestment } from "../../actions"
import { AssetBadge, CardHead, InvestDialogs } from "../../shared"

const qtyFmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: n < 1 ? 8 : 4 })
const price = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n < 1 ? 6 : 2 }))
const pct2 = (n: number) => `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

export default async function AssetPage({ params, searchParams }: PageProps<"/investimentos/ativos/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const investmentId = Number(id)
  if (!Number.isInteger(investmentId) || investmentId <= 0) notFound()
  const h = (await listHoldings()).find((x) => x.id === investmentId)
  if (!h) notFound()

  const now = today()
  const months: string[] = []
  for (let m = addMonths(monthOf(now), -11); m <= monthOf(now); m = addMonths(m, 1)) months.push(m)
  const [trades, history] = await Promise.all([listTrades({ investmentId }), portfolioHistory(months, investmentId)])
  const path = `/investimentos/ativos/${investmentId}`
  const ops = trades.filter((t) => !isIncome(t.type))
  const income = trades.filter((t) => isIncome(t.type))
  const received = income.filter((t) => t.date <= now)
  const yearAgo = `${addMonths(monthOf(now), -11)}-01`
  const income12 = received.filter((t) => t.date >= yearAgo).reduce((s, t) => s + t.amount, 0)
  const incomeAll = received.reduce((s, t) => s + t.amount, 0)
  const realized = positionFromTrades(trades).realized
  const valuation = h.profit ?? 0
  const totalResult = valuation + incomeAll + realized
  const base = h.invested || null
  const firstBuy = [...ops].reverse().find((t) => t.type === "BUY")?.date
  const info = CLASS_INFO[h.assetClass]

  const kpis: [string, React.ReactNode, React.ReactNode][] = h.variable
    ? [
        ["Quantidade", h.quantity != null ? qtyFmt(h.quantity) : "—", h.assetClass === "CRIPTO" ? h.code : "cotas"],
        ["Preço médio", price(h.avgPrice), h.invested != null ? `custo total ${brl(h.invested)}` : "—"],
        ["Saldo", brl(h.value), `cotação ${price(h.unitPrice)}`],
        ["Valorização", <Signed key="v" value={valuation} />, h.profitPct != null ? <span className={valuation >= 0 ? "text-income" : "text-expense"}>{signedPct(h.profitPct)}{firstBuy ? ` desde ${dateBR(firstBuy)}` : ""}</span> : "—"],
        ["Proventos 12M", brl(income12), h.invested ? `yield on cost ${pct2(income12 / h.invested)}` : "—"],
      ]
    : [
        ["Taxa", h.rateLabel ?? "—", h.dueDate ? `vence em ${dateBR(h.dueDate)}` : "sem vencimento informado"],
        ["Aplicado", h.invested != null ? brl(h.invested) : "—", firstBuy ? `desde ${dateBR(firstBuy)}` : "—"],
        ["Saldo bruto", brl(h.value), "antes de IR e IOF"],
        ["Resultado", <Signed key="v" value={valuation} />, h.profitPct != null ? <span className={valuation >= 0 ? "text-income" : "text-expense"}>{signedPct(h.profitPct)}</span> : "—"],
        ["Rentab. 12M", history.accReturn != null ? signedPct(history.accReturn) : "—", history.pctOfCdi != null ? `${Math.round(history.pctOfCdi * 100)}% do CDI` : "—"],
      ]

  return (
    <div className="grid gap-4">
      <Link href="/investimentos/ativos" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 justify-self-start text-muted-foreground")}>
        <ChevronLeft />
        Ativos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <AssetBadge code={h.code} name={h.name} assetClass={h.assetClass} size={52} />
          <div className="grid min-w-0 gap-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {h.code ?? h.name}
              {h.code && h.code !== h.name && <span className="font-medium text-muted-foreground"> · {h.name}</span>}
            </h1>
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
              <span className="rounded-md px-2 py-0.5" style={{ background: `color-mix(in oklab, ${info.color} 14%, transparent)`, color: info.color }}>{info.label}</span>
              {h.broker && <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{h.broker}</span>}
              <span className={cn("rounded-md px-2 py-0.5", h.manual ? "bg-amber-500/10 text-warning" : "bg-muted text-muted-foreground")}>{h.manual ? "Lançado à mão" : "Pluggy"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid justify-items-end">
            <span className="text-3xl font-bold tracking-tight tabular-nums">{h.variable ? price(h.unitPrice) : brl(h.value)}</span>
            <span className="text-xs text-muted-foreground">{h.variable ? "cotação" : "saldo bruto"}{h.priceUpdatedAt ? ` · atualizado ${ago(h.priceUpdatedAt)}` : ""}</span>
          </div>
          <Link href={`${path}?editar=1`} scroll={false} className={buttonVariants({ variant: "outline" })}>
            <Pencil />
            Editar
          </Link>
          <Link href={`${path}?lancar=${h.id}`} scroll={false} className={buttonVariants()}>
            <Plus />
            {h.manual ? "Lançar operação" : "Lançar provento"}
          </Link>
        </div>
      </div>

      <section aria-label="Posição" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map(([label, value, ctx], i) => (
          <div key={label} className={cn("grid content-start gap-1 bg-card px-4 py-3.5", i === 0 && "max-sm:col-span-2")}>
            <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
            <span className="text-lg font-bold tabular-nums sm:text-xl">{value}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{ctx}</span>
          </div>
        ))}
      </section>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <Card className="gap-4 px-5 py-5">
          <CardHead icon={ChartLine} title="Evolução" description="Saldo × valor aplicado, ou rentabilidade × índices, nos últimos 12 meses" />
          <EvolutionChart data={history.points.slice(1)} height={240} />
        </Card>
        <Card className="gap-4 px-5 py-5">
          <CardHead icon={Scale} title="Resultado" description="Valorização mais o que o ativo pagou" />
          {(valuation > 0 || incomeAll > 0) && (
            <div className="grid gap-1.5">
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {valuation > 0 && <span style={{ width: `${(valuation / (valuation + incomeAll)) * 100}%`, background: info.color }} />}
                {incomeAll > 0 && <span style={{ width: `${(incomeAll / (Math.max(valuation, 0) + incomeAll)) * 100}%`, background: "var(--inv-inflacao)" }} />}
              </div>
              <div className="flex gap-4 text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: info.color }} />Valorização</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px] bg-[var(--inv-inflacao)]" />Proventos</span>
              </div>
            </div>
          )}
          <dl className="grid text-sm">
            {(
              [
                ["Valorização", <Signed key="a" value={valuation} />],
                ["Proventos recebidos", <Signed key="b" value={incomeAll} />],
                ...(realized ? [["Lucro em vendas", <Signed key="c" value={realized} />]] : []),
                ["Resultado total", <span key="d" className="tabular-nums"><Signed value={totalResult} />{base ? ` · ${signedPct(totalResult / base)}` : ""}</span>],
                ["CDI em 12 meses", history.cdiReturn != null ? signedPct(history.cdiReturn) : "—"],
              ] as [string, React.ReactNode][]
            ).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 border-t py-2.5 first:border-0">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <Card className="gap-0 py-0">
          <div className="px-5 pt-5 pb-3">
            <CardHead icon={ArrowLeftRight} title="Movimentações" description={h.manual ? "Compras, vendas e bonificações lançadas à mão" : "Vindas da corretora pela Pluggy"} />
          </div>
          <div className="overflow-x-auto">
            <div role="table" aria-label="Movimentações" className="min-w-[620px]">
              <div role="row" className={cn(OPS, "h-9 border-y bg-muted/40 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase")}>
                <span>Data</span><span>Operação</span><span className="text-right">Qtd</span><span className="text-right">Preço</span><span className="text-right">Total</span><span className="text-right">Origem</span><span />
              </div>
              {ops.map((t) => (
                <div role="row" key={t.id} className={cn(OPS, "min-h-12 border-t border-border/60 py-2 text-sm")}>
                  <span className="tabular-nums">{dateBR(t.date)}</span>
                  <span><span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", t.type === "BUY" ? "bg-income/10 text-income" : t.type === "SELL" ? "bg-expense/10 text-expense" : "bg-muted text-muted-foreground")}>{TRADE_LABEL[t.type]}</span></span>
                  <span className="text-right tabular-nums">{t.quantity != null ? `${t.type === "SELL" ? "−" : "+"}${qtyFmt(t.quantity)}` : "—"}</span>
                  <span className="text-right tabular-nums">{price(t.price)}</span>
                  <b className="text-right tabular-nums">{brl(t.amount)}</b>
                  <span className="text-right text-xs text-muted-foreground">{t.pluggyId ? "Pluggy" : "Manual"}</span>
                  <DeleteTrade t={t} path={path} />
                </div>
              ))}
              {ops.length === 0 && <p className="border-t px-5 py-6 text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>}
            </div>
          </div>
        </Card>

        <Card className="gap-3 px-5 py-5">
          <CardHead icon={Coins} title="Proventos" description={`12 meses: ${brl(income12)}`}>
            <Link href={`${path}?lancar=${h.id}`} scroll={false} className={buttonVariants({ variant: "ghost", size: "sm" })}>Lançar</Link>
          </CardHead>
          <div className="grid">
            {income.slice(0, 12).map((t) => (
              <div key={t.id} className="flex min-h-11 items-center gap-2.5 border-t py-1.5 first:border-0 text-sm">
                <span className="w-20 tabular-nums font-semibold">{dateBR(t.date)}</span>
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", t.date > now ? "bg-amber-500/10 text-warning" : "bg-muted text-muted-foreground")}>{t.date > now ? `${TRADE_LABEL[t.type]} · a receber` : TRADE_LABEL[t.type]}</span>
                <span className="flex-1" />
                <b className={cn("tabular-nums", t.date <= now && "text-income")}>{t.date <= now ? "+" : ""}{brl(t.amount)}</b>
                <DeleteTrade t={t} path={path} />
              </div>
            ))}
            {income.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nenhum provento registrado.</p>}
          </div>
        </Card>
      </div>

      {sp.editar && (
        <RouteDialog closeHref={path} title="Editar ativo" description={h.manual ? "Dados do ativo lançado à mão." : "Ativo da Pluggy: dá para mudar o nome e a categoria; o resto vem da corretora."}>
          <form action={updateInvestment} className="grid gap-4">
            <input type="hidden" name="id" value={h.id} />
            <input type="hidden" name="back" value={path} />
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3">
              <Field label="Ticker / código">
                <input name="code" defaultValue={h.code ?? ""} disabled={!h.manual} maxLength={20} className={cn(fieldClass, "uppercase")} />
              </Field>
              <Field label="Nome">
                <input name="name" defaultValue={h.name} required maxLength={200} className={fieldClass} />
              </Field>
            </div>
            <Field label="Categoria" hint={h.override ? `Detectada automaticamente: ${CLASS_INFO[h.autoClass].label}` : undefined}>
              <FormSelect name="assetClass" defaultValue={h.assetClass} options={CLASS_ORDER.map((c) => ({ value: c, label: CLASS_INFO[c].label, color: CLASS_INFO[c].color }))} aria-label="Categoria" />
            </Field>
            {h.manual && (
              <>
                <Field label="Onde está">
                  <input name="broker" defaultValue={h.broker === "Manual" ? "" : (h.broker ?? "")} maxLength={200} className={fieldClass} />
                </Field>
                {h.variable ? (
                  <Field label="Cotação atual (R$)" hint="A sincronização busca a cotação do dia; use isto se a fonte não tiver o ativo">
                    <input name="unitPrice" type="number" step="any" min="0" defaultValue={h.unitPrice ?? ""} className={fieldClass} />
                  </Field>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Taxa">
                        <input name="rateLabel" defaultValue={h.rateLabel ?? ""} maxLength={60} className={fieldClass} />
                      </Field>
                      <Field label="Vencimento">
                        <input name="dueDate" type="date" defaultValue={h.dueDate ?? ""} className={fieldClass} />
                      </Field>
                    </div>
                    <Field label="Saldo atual (R$)" hint="Valor bruto que a instituição mostra hoje">
                      <input name="currentValue" type="number" step="0.01" min="0" defaultValue={h.value} className={fieldClass} />
                    </Field>
                  </>
                )}
              </>
            )}
            <Button type="submit" className="h-10">Salvar</Button>
          </form>
          {h.manual && (
            <form action={deleteInvestment} className="border-t pt-4">
              <input type="hidden" name="id" value={h.id} />
              <Button type="submit" variant="destructive" className="w-full">
                <Trash2 />
                Excluir ativo e lançamentos
              </Button>
            </form>
          )}
        </RouteDialog>
      )}

      <InvestDialogs sp={sp} path={path} />
    </div>
  )
}

const OPS = "grid grid-cols-[96px_minmax(100px,1fr)_minmax(80px,1fr)_minmax(90px,1fr)_minmax(100px,1fr)_72px_36px] items-center gap-3 px-5"

const Signed = ({ value }: { value: number }) => (
  <span className={cn("tabular-nums", value > 0 ? "text-income" : value < 0 ? "text-expense" : "")}>
    {value > 0 ? "+" : value < 0 ? "−" : ""}
    {brl(Math.abs(value))}
  </span>
)

function DeleteTrade({ t, path }: { t: { id: number; pluggyId: string | null; type: string }; path: string }) {
  if (t.pluggyId) return <span />
  return (
    <form action={deleteTrade} className="text-right">
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="back" value={path} />
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Excluir lançamento" className="text-muted-foreground hover:text-destructive">
        <Trash2 />
      </Button>
    </form>
  )
}
