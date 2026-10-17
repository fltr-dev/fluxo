import { ChartPie, Plus, RefreshCw } from "lucide-react"
import Link from "next/link"
import { PageTitle } from "@/components/bits"
import { RouteDialog } from "@/components/route-overlay"
import { Button, buttonVariants } from "@/components/ui/button"
import { today } from "@/lib/domain/dates"
import { CLASS_INFO, type AssetClass } from "@/lib/domain/investments"
import { ago } from "@/lib/format"
import { listHoldings, portfolioSummary, targets } from "@/lib/investments"
import type { SearchParams } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { addTrade, createInvestment, refreshMarket, saveTargets } from "./actions"
import { NewInvestmentForm, TargetsForm, TradeForm } from "./forms"

// Peças comuns às telas de Investimentos: cabeçalho com as abas e os modais abertos pela URL.

const TABS = [
  { href: "/investimentos", label: "Resumo" },
  { href: "/investimentos/ativos", label: "Ativos" },
  { href: "/investimentos/proventos", label: "Proventos" },
] as const

export async function InvestHeader({ active, path, children }: { active: (typeof TABS)[number]["href"]; path: string; children?: React.ReactNode }) {
  const list = (await listHoldings()).filter((h) => !h.archived)
  const brokers = [...new Set(list.filter((h) => !h.manual).map((h) => h.broker).filter(Boolean))]
  const manual = list.filter((h) => h.manual).length
  const updated = list.map((h) => h.priceUpdatedAt).filter((d) => d != null).sort((a, b) => b.getTime() - a.getTime())[0]
  const sources = [brokers.length ? `${brokers.join(", ")} pela Pluggy` : null, manual ? `${manual} ${manual === 1 ? "ativo lançado" : "ativos lançados"} à mão` : null].filter(Boolean).join(", mais ")
  return (
    <div className="grid gap-4">
      <PageTitle title="Investimentos" description={list.length ? `${sources}${updated ? ` · atualizado ${ago(updated)}` : ""}` : "Sua carteira, com rentabilidade, proventos e alocação."}>
        <form action={refreshMarket}>
          <input type="hidden" name="back" value={path} />
          <Button type="submit" variant="ghost" size="sm" title="Buscar CDI, IPCA, IBOV e as cotações dos ativos lançados à mão">
            <RefreshCw />
            <span className="max-sm:hidden">Cotações</span>
          </Button>
        </form>
        <Link href={`${path}?alvo=1`} scroll={false} className={buttonVariants({ variant: "outline" })}>
          <ChartPie />
          Alocação-alvo
        </Link>
        <Link href={`${path}?lancar=1`} scroll={false} className={buttonVariants()}>
          <Plus />
          Novo lançamento
        </Link>
      </PageTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex rounded-lg bg-muted p-[3px]" aria-label="Seções de investimentos">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} aria-current={t.href === active ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-md px-3.5 text-sm font-semibold text-muted-foreground hover:text-foreground", t.href === active && "bg-card text-foreground shadow-sm ring-1 ring-border")}>
              {t.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  )
}

/**
 * Modais pela URL: `?lancar=1` (operação ou provento; `?lancar=<id>` já escolhe o ativo), `?novo=1` (ativo manual)
 * e `?alvo=1` (alocação-alvo). Fechar volta para `path`.
 */
export async function InvestDialogs({ sp, path }: { sp: SearchParams; path: string }) {
  const now = today()
  if (sp.novo) {
    return (
      <RouteDialog closeHref={path} title="Novo ativo" description="Para o que não vem pela Pluggy: cripto, corretora sem Open Finance, título comprado em outro lugar.">
        <NewInvestmentForm action={createInvestment} back={path} today={now} />
      </RouteDialog>
    )
  }
  if (sp.lancar) {
    const list = (await listHoldings()).filter((h) => !h.archived)
    const assets = list.map((h) => ({ id: h.id, label: h.code && h.code !== h.name ? `${h.code} · ${h.name}` : h.name, assetClass: h.assetClass, manual: h.manual, quantity: h.quantity }))
    const id = Number(sp.lancar)
    return (
      <RouteDialog closeHref={path} title="Novo lançamento" description={<>Compra, venda ou provento de um ativo da carteira. Ativo novo? <Link href={`${path}?novo=1`} scroll={false} className="font-medium text-primary underline-offset-4 hover:underline">Cadastre aqui</Link>.</>}>
        {assets.length ? (
          <TradeForm action={addTrade} back={path} today={now} assets={assets} defaultId={assets.some((a) => a.id === id) ? id : undefined} />
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum ativo ainda. <Link href={`${path}?novo=1`} className="font-medium text-primary">Cadastre o primeiro</Link> ou sincronize a corretora em Contas.</p>
        )}
      </RouteDialog>
    )
  }
  if (sp.alvo) {
    const [summary, tgt] = await Promise.all([portfolioSummary(), targets()])
    const current = Object.fromEntries(summary.allocation.map((a) => [a.assetClass, a.pct]))
    return (
      <RouteDialog closeHref={path} title="Alocação-alvo" description="Quanto você quer em cada categoria. O Resumo mostra a diferença e onde aportar para rebalancear sem vender.">
        <TargetsForm action={saveTargets} back={path} current={current} targets={Object.fromEntries(tgt)} />
      </RouteDialog>
    )
  }
  return null
}

/** Quadradinho com as iniciais do ativo na cor da categoria. */
export function AssetBadge({ code, name, assetClass, size = 36 }: { code: string | null; name: string; assetClass: AssetClass; size?: number }) {
  // ticker: as duas primeiras letras; título sem ticker: a primeira palavra que diz o que é ("Tesouro Selic" → SE, "CDB C6" → C6)
  const word = name.split(/\s+/).find((w, i) => i > 0 && /[A-Za-zÀ-ú]/.test(w) && !/^(TESOURO|CDB|LCI|LCA|CRI|CRA|DE|DO|DA)$/i.test(w)) ?? name
  const label = (code ?? word).normalize("NFD").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?"
  return (
    <span className="grid shrink-0 place-items-center rounded-[10px] font-extrabold tracking-tight text-white" style={{ width: size, height: size, fontSize: size * 0.3, background: CLASS_INFO[assetClass].color }} aria-hidden>
      {label}
    </span>
  )
}

export const ClassDot = ({ assetClass, className }: { assetClass: AssetClass; className?: string }) => (
  <span className={cn("size-2.5 shrink-0 rounded-[3px]", className)} style={{ background: CLASS_INFO[assetClass].color }} aria-hidden />
)

/** Cabeçalho de card com ícone num quadrado neutro, título e subtítulo. */
export function CardHead({ icon: Icon, title, description, children }: { icon: React.ComponentType<{ className?: string }>; title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/80">
          <Icon className="size-4" />
        </span>
        <div className="grid min-w-0">
          <h2 className="text-base leading-6 font-semibold">{title}</h2>
          {description && <p className="text-[13px] leading-[18px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}
