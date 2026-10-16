import { ChartColumn, ChevronRight, Download, Landmark, Tags, TrendingUp } from "lucide-react"
import Link from "next/link"
import { Bar, Delta, Empty, Money, PageTitle } from "@/components/bits"
import { CompareBars, IncomeExpenseChart, NetWorthChart, StackedCategoryChart } from "@/components/charts"
import { Filters } from "@/components/filters"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { addMonths, monthCount, monthEnd, monthOf, monthStart, monthsInRange, previousPeriod, samePeriodLastYear } from "@/lib/domain/dates"
import { brl, delta, signedPct } from "@/lib/format"
import { byCategory, categoryTree, listAccounts, monthlyByCategory, monthlyTotals, netWorth, parseFilters, totals, withParams, type SearchParams } from "@/lib/queries"
import { cn } from "@/lib/utils"

const TABS = [
  ["comparativos", "Comparativos", ChartColumn],
  ["evolucao", "Evolução", TrendingUp],
  ["categorias", "Categorias", Tags],
  ["patrimonio", "Patrimônio", Landmark],
] as const
const REFS = { anterior: "Período anterior", media: "Média de 6 meses", ano: "Ano anterior" } as const
const TYPE_LABEL = { CHECKING: "Corrente", CREDIT_CARD: "Cartão · fatura aberta", SAVINGS_INVESTMENT: "Investimento", CASH: "Dinheiro" }

function LinkTabs({ items, sp, param }: { items: readonly (readonly [string, string, React.ComponentType<{ className?: string }>?])[]; sp: SearchParams; param: string }) {
  const current = typeof sp[param] === "string" ? sp[param] : items[0][0]
  return (
    <nav className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px]" aria-label="Seções">
      {items.map(([key, label, Icon]) => (
        <Link
          key={key}
          href={withParams(sp, { [param]: key === items[0][0] ? undefined : key })}
          aria-current={current === key ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
            current === key && "bg-card text-foreground shadow-sm",
          )}
        >
          {Icon && <Icon className="size-4" />}
          {label}
        </Link>
      ))}
    </nav>
  )
}

export default async function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  const sp = await searchParams
  const f = parseFilters(sp)
  const tab = (TABS.find(([k]) => k === sp.aba)?.[0] ?? "comparativos") as (typeof TABS)[number][0]

  return (
    <div className="grid gap-5">
      <PageTitle title="Relatórios" description="Compare períodos, acompanhe a evolução e detalhe cada categoria.">
        <a href={`/api/export${withParams(sp, { aba: undefined, ref: undefined })}`} className={buttonVariants({ variant: "outline" })}>
          <Download />
          Exportar CSV
        </a>
      </PageTitle>
      <Filters f={f} sp={sp}>
        {tab !== "comparativos" && <input type="hidden" name="aba" value={tab} />}
      </Filters>
      <LinkTabs items={TABS} sp={sp} param="aba" />
      {tab === "comparativos" && <Comparisons sp={sp} />}
      {tab === "evolucao" && <Evolution sp={sp} />}
      {tab === "categorias" && <Categories sp={sp} />}
      {tab === "patrimonio" && <NetWorthTab sp={sp} />}
    </div>
  )
}

async function Comparisons({ sp }: { sp: SearchParams }) {
  const f = parseFilters(sp)
  const ref = (Object.keys(REFS).find((k) => k === sp.ref) ?? "anterior") as keyof typeof REFS
  const n = monthCount(f)
  const avgWindow = { from: monthStart(addMonths(monthOf(f.from), -6)), to: monthEnd(addMonths(monthOf(f.from), -1)) }
  const refPeriod = ref === "ano" ? samePeriodLastYear(f) : ref === "media" ? avgWindow : previousPeriod(f)
  // A média vira "um período do mesmo tamanho": total dos 6 meses ÷ 6 × meses do período
  const scale = ref === "media" ? n / 6 : 1
  const expense = { ...f, kind: "EXPENSE" as const }
  const [cur, base, cats, refCats] = await Promise.all([totals(f), totals(f, refPeriod), byCategory(expense), byCategory({ ...expense, ...refPeriod })])
  const refBy = new Map(refCats.map((c) => [c.id, c.total * scale]))
  const rows = cats.map((c) => ({ name: c.name ?? "A categorizar", color: c.color ?? "#a1a1aa", cur: c.total, prev: refBy.get(c.id) ?? 0 }))
  const refIncome = base.income * scale
  const refExpense = base.expense * scale
  const summary = [
    { label: "Receitas", cur: cur.income, ref: refIncome, upIsGood: true },
    { label: "Despesas", cur: cur.expense, ref: refExpense, upIsGood: false },
    { label: "Saldo", cur: cur.income - cur.expense, ref: refIncome - refExpense, upIsGood: true },
  ]
  const refLabel = REFS[ref]

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Comparar com</span>
        <LinkTabs items={Object.entries(REFS).map(([k, l]) => [k, l] as const)} sp={sp} param="ref" />
      </div>

      <Card className="grid gap-0 py-0 sm:grid-cols-3">
        {summary.map((s, i) => (
          <div key={s.label} className={cn("grid gap-1 px-5 py-4", i > 0 && "border-t sm:border-t-0 sm:border-l")}>
            <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
            <span className="text-xl font-semibold tracking-tight tabular-nums">{brl(s.cur)}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Delta value={delta(s.cur, s.ref)} upIsGood={s.upIsGood} />
              vs <span className="tabular-nums">{brl(s.ref)}</span>
            </span>
          </div>
        ))}
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-semibold">Despesas por categoria</CardTitle>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground" />Período (cor da categoria)</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-border" />{refLabel}</span>
          </div>
        </CardHeader>
        <CardContent>{rows.length ? <CompareBars data={rows.slice(0, 8)} refLabel={refLabel} /> : <Empty>Sem despesas no período.</Empty>}</CardContent>
      </Card>

      {rows.length > 0 && (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="h-10 px-5 text-left font-medium">Categoria</th>
                  <th className="px-3 text-right font-medium">Período</th>
                  <th className="px-3 text-right font-medium">{refLabel}</th>
                  <th className="px-3 text-right font-medium">Diferença</th>
                  <th className="px-5 text-right font-medium">Variação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = delta(r.cur, r.prev)
                  return (
                    <tr key={r.name} className="border-b last:border-0">
                      <td className="h-12 px-5"><span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-sm" style={{ background: r.color }} />{r.name}</span></td>
                      <td className="px-3 text-right font-medium tabular-nums">{brl(r.cur)}</td>
                      <td className="px-3 text-right text-muted-foreground tabular-nums">{brl(r.prev)}</td>
                      <td className={cn("px-3 text-right tabular-nums", r.cur > r.prev ? "text-expense" : "text-income")}>{r.cur === r.prev ? "—" : `${r.cur > r.prev ? "+" : "−"}${brl(Math.abs(r.cur - r.prev))}`}</td>
                      <td className="px-5 text-right">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", d == null ? "bg-muted text-muted-foreground" : d > 0 ? "bg-rose-500/10 text-expense" : "bg-income/10 text-income")}>
                          {d == null ? "novo" : signedPct(d)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

async function Evolution({ sp }: { sp: SearchParams }) {
  const f = parseFilters(sp)
  // O próprio período se tiver 2+ meses; senão os 12 meses até o fim dele
  const series = monthCount(f) >= 2 ? f : { from: monthStart(addMonths(monthOf(f.to), -11)), to: f.to }
  const months = monthsInRange(series.from, series.to)
  const [monthly, monthlyCats] = await Promise.all([monthlyTotals(f, series), monthlyByCategory(f, series)])

  // Barras empilhadas: 6 maiores categorias + "Outras"
  const byKey = new Map<string, { name: string; color: string; total: number }>()
  for (const r of monthlyCats) {
    const key = r.id ? `c${r.id}` : "none"
    const t = byKey.get(key) ?? { name: r.name ?? "A categorizar", color: r.color ?? "#a1a1aa", total: 0 }
    t.total += r.total
    byKey.set(key, t)
  }
  const top = [...byKey].sort((a, b) => b[1].total - a[1].total).slice(0, 6).map(([k]) => k)
  const stacked = months.map((m) => {
    const row: Record<string, string | number> = { month: m }
    for (const r of monthlyCats.filter((x) => x.month === m)) {
      const key = r.id ? `c${r.id}` : "none"
      const k = top.includes(key) ? key : "other"
      row[k] = ((row[k] as number) ?? 0) + r.total
    }
    return row
  })
  const series2 = [
    ...top.map((k) => ({ key: k, name: byKey.get(k)!.name, color: byKey.get(k)!.color })),
    ...(byKey.size > top.length ? [{ key: "other", name: "Outras", color: "#a1a1aa" }] : []),
  ]
  const kind = f.kind === "INCOME" ? "Receitas" : "Despesas"

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-semibold">{kind} por categoria, mês a mês</CardTitle>
        </CardHeader>
        <CardContent><StackedCategoryChart data={stacked} series={series2} /></CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-semibold">Receitas x despesas</CardTitle>
        </CardHeader>
        <CardContent>
          <IncomeExpenseChart height={260} data={months.map((m) => ({ month: m, income: monthly.get(m)?.income ?? 0, expense: monthly.get(m)?.expense ?? 0 }))} />
        </CardContent>
      </Card>
    </div>
  )
}

async function Categories({ sp }: { sp: SearchParams }) {
  const f = parseFilters(sp)
  const tree = await categoryTree(true)
  const parentId = f.categoryId && tree.some((c) => c.id === f.categoryId) ? f.categoryId : undefined
  const parent = tree.find((c) => c.id === parentId)
  const cats = await byCategory(f, parentId)
  const total = cats.reduce((s, c) => s + c.total, 0)
  const max = Math.max(1, ...cats.map((c) => c.total))
  const kind = f.kind === "INCOME" ? "Receitas" : "Despesas"

  return (
    <Card>
      <CardHeader className="grid gap-2">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Detalhamento">
          <Link href={withParams(sp, { categoria: undefined })} className={cn(parent ? "hover:text-foreground" : "font-medium text-foreground")}>{kind}</Link>
          {parent && (
            <>
              <ChevronRight className="size-3.5" />
              <span className="flex items-center gap-1.5 font-medium text-foreground"><span className="size-2.5 rounded-sm" style={{ background: parent.color }} />{parent.name}</span>
            </>
          )}
        </nav>
        <CardTitle className="font-semibold"><span className="tabular-nums">{brl(total)}</span> no período</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1">
        {cats.length === 0 && <Empty>Sem lançamentos no período.</Empty>}
        {cats.map((c) => {
          const href = !c.id
            ? `/transacoes${withParams(sp, { ver: "uncategorized", categoria: undefined, aba: undefined })}`
            : parent
              ? `/transacoes${withParams(sp, { categoria: c.id, aba: undefined })}`
              : withParams(sp, { categoria: c.id })
          return (
            <Link key={c.id ?? "none"} href={href} className="-mx-2 grid gap-2 rounded-lg px-2 py-2.5 hover:bg-muted/60">
              <span className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-sm" style={{ background: c.color ?? "#a1a1aa" }} />{c.name ?? "A categorizar"}</span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="font-semibold">{brl(c.total)}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground">{total ? Math.round((c.total / total) * 100) : 0}%</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </span>
              </span>
              <Bar value={c.total / max} color={c.color ?? "#a1a1aa"} className="h-1.5" />
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

async function NetWorthTab({ sp }: { sp: SearchParams }) {
  const f = parseFilters(sp)
  const months = monthsInRange(monthStart(addMonths(monthOf(f.to), -11)), f.to)
  const [nw, accs] = await Promise.all([netWorth(months), listAccounts()])
  const active = accs.filter((a) => !a.archived)
  const now = active.reduce((s, a) => s + a.balance, 0)
  const assets = active.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0)
  const first = nw.find((p) => p.value)?.value

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="font-semibold">Patrimônio líquido</CardTitle>
            <span className="text-xs text-muted-foreground">Contas + investimentos − fatura aberta dos cartões · últimos 12 meses</span>
          </div>
          <div className="grid justify-items-end">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{brl(now)}</span>
            {first ? <Delta value={delta(now, first)} /> : null}
          </div>
        </CardHeader>
        <CardContent><NetWorthChart data={nw} /></CardContent>
      </Card>
      <Card className="py-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="h-10 px-5 text-left font-medium">Conta</th>
                <th className="px-3 text-left font-medium">Tipo</th>
                <th className="px-3 text-right font-medium">Saldo</th>
                <th className="px-5 text-right font-medium">Participação nos ativos</th>
              </tr>
            </thead>
            <tbody>
              {active.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="h-12 px-5"><span className="grid"><span className="font-medium">{a.name}</span><span className="text-xs text-muted-foreground">{a.institution ?? "Manual"}</span></span></td>
                  <td className="px-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{TYPE_LABEL[a.type]}</span></td>
                  <td className="px-3 text-right font-medium"><Money value={a.balance} /></td>
                  <td className="px-5">
                    <span className="flex items-center justify-end gap-2">
                      <Bar value={a.balance > 0 && assets ? a.balance / assets : 0} className="h-1.5 w-28" />
                      <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{a.balance > 0 && assets ? `${Math.round((a.balance / assets) * 100)}%` : "—"}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
