import { Download, Plus, Search, TrendingUp } from "lucide-react"
import Link from "next/link"
import { Empty } from "@/components/bits"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ASSET_CLASSES, CLASS_INFO, CLASS_ORDER, isVariable, type AssetClass } from "@/lib/domain/investments"
import { brl, dateBR, signedPct } from "@/lib/format"
import { activeHoldings, type Holding } from "@/lib/investments"
import { cn } from "@/lib/utils"
import { AssetBadge, InvestDialogs, InvestHeader } from "../shared"

const qtyFmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: n < 1 ? 8 : 4 })
const pct1 = (n: number) => `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
// preço com mais casas quando é pequeno (cripto fracionado, ações de centavos)
const price = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n < 1 ? 6 : 2 }))

const COLS = "grid grid-cols-[minmax(220px,2.2fr)_repeat(4,minmax(96px,1fr))_minmax(116px,1.1fr)_minmax(124px,1.2fr)_76px] items-center gap-3 px-5"

export default async function AssetsPage({ searchParams }: PageProps<"/investimentos/ativos">) {
  const sp = await searchParams
  const path = "/investimentos/ativos"
  const all = await activeHoldings()
  const cat = typeof sp.categoria === "string" && (ASSET_CLASSES as readonly string[]).includes(sp.categoria) ? (sp.categoria as AssetClass) : null
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 60) : ""
  const total = all.reduce((s, h) => s + h.value, 0)
  const invested = all.reduce((s, h) => s + (h.invested ?? h.value), 0)
  const list = all.filter((h) => (!cat || h.assetClass === cat) && (!q || `${h.code ?? ""} ${h.name} ${h.broker ?? ""}`.toLowerCase().includes(q)))
  const groups = CLASS_ORDER.map((c) => ({ c, rows: list.filter((h) => h.assetClass === c) })).filter((g) => g.rows.length)
  const byClass = CLASS_ORDER.map((c) => ({ c, value: all.filter((h) => h.assetClass === c).reduce((s, h) => s + h.value, 0), count: all.filter((h) => h.assetClass === c).length })).filter((x) => x.count)
  const fixedShare = total ? byClass.filter((x) => CLASS_INFO[x.c].fixed).reduce((s, x) => s + x.value, 0) / total : 0
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const next = { categoria: cat ?? undefined, q: q || undefined, ...patch }
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v)
    return p.size ? `${path}?${p}` : path
  }

  return (
    <div className="grid gap-4">
      <InvestHeader active={path} path={path}>
        <a href="/api/investimentos/csv" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <Download />
          Exportar CSV
        </a>
      </InvestHeader>

      {all.length === 0 ? (
        <Empty icon={TrendingUp} title="Nenhum ativo na carteira" action={<Link href={`${path}?novo=1`} className={buttonVariants()}><Plus />Lançar ativo</Link>}>
          Conecte a corretora em Contas ou lance à mão o que não vem pelo Open Finance.
        </Empty>
      ) : (
        <>
          <Card className="gap-3 px-5 py-4">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Composição da carteira</span>
              <span className="text-xs text-muted-foreground">Renda fixa {pct1(fixedShare)} · Renda variável e outros {pct1(1 - fixedShare)}</span>
            </div>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={byClass.map((x) => `${CLASS_INFO[x.c].label} ${pct1(x.value / total)}`).join(", ")}>
              {byClass.map((x) => <span key={x.c} style={{ width: `${(x.value / total) * 100}%`, background: CLASS_INFO[x.c].color }} />)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
              {byClass.map((x) => (
                <span key={x.c} className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: CLASS_INFO[x.c].color }} />{CLASS_INFO[x.c].label} <span className="text-foreground tabular-nums">{pct1(x.value / total)}</span></span>
              ))}
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <form action={path} className="flex h-9 min-w-52 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-muted-foreground sm:max-w-72">
              {cat && <input type="hidden" name="categoria" value={cat} />}
              <Search className="size-4 shrink-0" />
              <input type="search" name="q" defaultValue={q} placeholder="Buscar ticker, nome ou corretora" aria-label="Buscar ativo" className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm" />
            </form>
            <Link href={href({ categoria: undefined })} scroll={false} className={chip(!cat)}>
              Todas <span className="opacity-60 tabular-nums">{all.length}</span>
            </Link>
            {byClass.map((x) => (
              <Link key={x.c} href={href({ categoria: cat === x.c ? undefined : x.c })} scroll={false} aria-current={cat === x.c ? "true" : undefined} className={chip(cat === x.c)}>
                <span className="size-2 rounded-[2px]" style={{ background: CLASS_INFO[x.c].color }} />
                {CLASS_INFO[x.c].label} <span className="opacity-60 tabular-nums">{x.count}</span>
              </Link>
            ))}
          </div>

          <Card className="gap-0 py-0">
            <div className="overflow-x-auto">
              <div role="table" aria-label="Ativos por categoria" className="min-w-[1040px]">
                {groups.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum ativo encontrado.</p>}
                {groups.map(({ c, rows }) => {
                  const gTotal = rows.reduce((s, h) => s + h.value, 0)
                  const gInvested = rows.reduce((s, h) => s + (h.invested ?? h.value), 0)
                  const variable = isVariable(c)
                  return (
                    <div key={c} role="rowgroup" className="border-t first:border-0">
                      <div role="row" className={cn(COLS, "min-h-13 py-2")}>
                        <span className="flex items-center gap-2.5">
                          <span className="size-3 rounded-[3px]" style={{ background: CLASS_INFO[c].color }} />
                          <b className="text-[15px]">{CLASS_INFO[c].label}</b>
                          <span className="rounded-md bg-muted px-1.5 text-xs font-semibold text-muted-foreground tabular-nums">{rows.length}</span>
                        </span>
                        <span /><span /><span /><span />
                        <b className="text-right tabular-nums">{brl(gTotal)}</b>
                        <Result value={gTotal - gInvested} pct={gInvested ? gTotal / gInvested - 1 : null} />
                        <b className="text-right tabular-nums">{pct1(total ? gTotal / total : 0)}</b>
                      </div>
                      <div role="row" className={cn(COLS, "h-9 border-y bg-muted/40 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase [&>*:not(:first-child)]:text-right")}>
                        <span>Ativo</span>
                        {variable ? (
                          <><span>Quantidade</span><span>Preço médio</span><span>Cotação</span><span>Aplicado</span></>
                        ) : (
                          <><span>Taxa</span><span>Vencimento</span><span>Instituição</span><span>Aplicado</span></>
                        )}
                        <span>Saldo</span>
                        <span>Rentabilidade</span>
                        <span>Carteira</span>
                      </div>
                      {rows.map((h) => <AssetRow key={h.id} h={h} total={total} variable={variable} />)}
                    </div>
                  )
                })}
                {groups.length > 0 && (
                  <div role="row" className={cn(COLS, "min-h-14 border-t bg-muted/40")}>
                    <b>{cat || q ? "Total filtrado" : "Total da carteira"}</b>
                    <span /><span /><span /><span />
                    <b className="text-right tabular-nums">{brl(list.reduce((s, h) => s + h.value, 0))}</b>
                    {(() => {
                      const t = list.reduce((s, h) => s + h.value, 0)
                      const i = list.reduce((s, h) => s + (h.invested ?? h.value), 0)
                      return <Result value={t - i} pct={i ? t / i - 1 : null} />
                    })()}
                    <b className="text-right tabular-nums">{pct1(total ? list.reduce((s, h) => s + h.value, 0) / total : 0)}</b>
                  </div>
                )}
              </div>
            </div>
          </Card>
          <p className="text-xs text-muted-foreground">
            Renda variável: rentabilidade = saldo − custo das compras (preço médio × quantidade). Renda fixa: saldo bruto informado pela instituição, antes de IR e IOF. Ativos lançados à mão usam a cotação pública do dia (Yahoo Finance). Total investido: {brl(invested)}.
          </p>
        </>
      )}

      <InvestDialogs sp={sp} path={path} />
    </div>
  )
}

const chip = (on: boolean) =>
  cn("inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] font-semibold whitespace-nowrap text-foreground/80 hover:bg-muted", on && "border-foreground bg-foreground text-background hover:bg-foreground")

function Result({ value, pct }: { value: number; pct: number | null }) {
  return (
    <span className="grid justify-items-end leading-[18px] tabular-nums">
      <b className={value >= 0 ? "text-income" : "text-expense"}>{pct != null ? signedPct(pct) : "—"}</b>
      <span className="text-xs text-muted-foreground">{value >= 0 ? "+" : "−"}{brl(Math.abs(value))}</span>
    </span>
  )
}

function AssetRow({ h, total, variable }: { h: Holding; total: number; variable: boolean }) {
  const weight = total ? h.value / total : 0
  return (
    <Link role="row" href={`/investimentos/ativos/${h.id}`} className={cn(COLS, "min-h-15 border-t border-border/60 py-2 text-sm hover:bg-muted/40 [&>*:not(:first-child)]:text-right")}>
      <span className="flex min-w-0 items-center gap-3">
        <AssetBadge code={h.code} name={h.name} assetClass={h.assetClass} />
        <span className="grid min-w-0">
          <span className="flex items-center gap-1.5">
            <b className="truncate">{h.code ?? h.name}</b>
            {h.manual && <span className="rounded-md bg-amber-500/10 px-1.5 text-[11px] font-semibold text-warning">Manual</span>}
          </span>
          <span className="truncate text-xs text-muted-foreground">{h.code ? h.name : (h.broker ?? "")}</span>
        </span>
      </span>
      {variable ? (
        <>
          <span className="tabular-nums">{h.quantity != null ? qtyFmt(h.quantity) : "—"}</span>
          <span className="tabular-nums">{price(h.avgPrice)}</span>
          <span className="tabular-nums">{price(h.unitPrice)}</span>
          <span className="tabular-nums">{h.invested != null ? brl(h.invested) : "—"}</span>
        </>
      ) : (
        <>
          <span className="truncate">{h.rateLabel ?? "—"}</span>
          <span className="tabular-nums">{h.dueDate ? dateBR(h.dueDate) : "—"}</span>
          <span className="truncate">{h.broker ?? "—"}</span>
          <span className="tabular-nums">{h.invested != null ? brl(h.invested) : "—"}</span>
        </>
      )}
      <b className="tabular-nums">{brl(h.value)}</b>
      {h.profit != null ? <Result value={h.profit} pct={h.profitPct} /> : <span className="text-muted-foreground">—</span>}
      <span className="grid gap-1">
        <span className="font-semibold tabular-nums">{pct1(weight)}</span>
        <span className="relative h-1.5 rounded-full bg-muted"><span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, weight * 400)}%`, background: CLASS_INFO[h.assetClass].color }} /></span>
      </span>
    </Link>
  )
}
