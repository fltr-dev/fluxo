import { Card, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Peças dos loading.tsx: cada tela monta o esqueleto com as MESMAS classes de layout da página real
// (grid, colunas, paddings, alturas de linha), para nada pular quando o conteúdo chega.
// Convenção de alturas = line-height do texto real: text-xs h-4 · text-sm h-5 · text-base h-6 · text-lg/xl h-7 · text-2xl h-8 · text-3xl h-9.

/** Raiz do esqueleto: avisa leitores de tela e usa o mesmo grid da página. */
export function SkPage({ className = "grid gap-4", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={className} aria-busy="true">
      <span className="sr-only" role="status">Carregando…</span>
      {children}
    </div>
  )
}

/** Uma linha de texto: a caixa tem a altura da linha (h-*), a barra ocupa ~60% dela. */
export const SkLine = ({ className }: { className?: string }) => (
  <div className={cn("flex h-5 w-24 max-w-full items-center", className)}>
    <Skeleton className="h-[60%] w-full" />
  </div>
)

/** Botão (h-8, raio lg). */
export const SkButton = ({ className }: { className?: string }) => <Skeleton className={cn("h-8 w-28 rounded-lg", className)} />

/**
 * Cabeçalho da tela, igual ao PageTitle: h1 + descrição à esquerda, botões (`actions` = largura de cada um) ou
 * `children` à direita. `wrap`: a descrição real quebra em 2 linhas no celular (textos com mais de ~50 caracteres).
 */
export function SkTitle({ title = "w-44", description = "w-72", wrap, actions = [], children }: { title?: string; description?: string | false; wrap?: boolean; actions?: string[]; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <SkLine className={cn("h-8", title)} />
        {description && (
          <div>
            <SkLine className={description} />
            {wrap && <SkLine className="w-40 sm:hidden" />}
          </div>
        )}
      </div>
      {(actions.length > 0 || children) && (
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((a, i) => (
            <SkButton key={i} className={a} />
          ))}
          {children}
        </div>
      )}
    </div>
  )
}

/** Abas segmentadas (trilho muted, primeiro item ativo). `items` = largura de cada aba. */
export function SkTabs({ items, item = "h-8", className }: { items: string[]; item?: string; className?: string }) {
  return (
    <Skeleton className={cn("inline-flex max-w-full gap-0.5 justify-self-start overflow-hidden rounded-lg p-[3px]", className)}>
      {items.map((w, i) => (
        <span key={i} className={cn("shrink-0 rounded-md", item, w, i === 0 && "bg-card shadow-sm")} />
      ))}
    </Skeleton>
  )
}

/** Chips arredondados (filtros, visões). */
export const SkChips = ({ items, className }: { items: string[]; className?: string }) => (
  <>
    {items.map((w, i) => (
      <Skeleton key={i} className={cn("h-8 shrink-0 rounded-full", w, className)} />
    ))}
  </>
)

/** Célula de resumo (rótulo text-sm, valor, dica text-xs), como as faixas de KPIs de Metas, Limites, Dívidas… */
export const SkStat = ({ className, value = "h-7 w-32" }: { className?: string; value?: string }) => (
  <div className={cn("grid gap-0.5 px-5 py-4", className)}>
    <SkLine className="w-24" />
    <SkLine className={value} />
    <SkLine className="h-4 w-36" />
  </div>
)

/** Faixa de KPIs num card só, divididos por borda (empilha no celular). `className` = colunas do grid. */
export function SkStats({ n, className = "sm:grid-cols-3", value }: { n: number; className?: string; value?: string }) {
  return (
    <Card className={cn("grid gap-0 py-0", className)}>
      {Array.from({ length: n }, (_, i) => (
        <SkStat key={i} value={value} className={cn(i > 0 && "border-t sm:border-t-0 sm:border-l")} />
      ))}
    </Card>
  )
}

/** Cabeçalho de card: título (text-base) e, opcional, algo à direita. */
export function SkCardHeader({ title = "w-36", right, className }: { title?: string; right?: string; className?: string }) {
  return (
    <CardHeader className={cn("flex items-center justify-between", className)}>
      <SkLine className={cn("h-[22px]", title)} />
      {right && <SkLine className={cn("h-5", right)} />}
    </CardHeader>
  )
}

/** Linha de lista genérica: ícone, duas linhas de texto e valor à direita. `className` = container real (padding, borda, altura). */
export function SkRow({ className, icon = "size-10 rounded-full", title = "w-36", sub = "w-24", right = "w-20" }: { className?: string; icon?: string | false; title?: string; sub?: string | false; right?: string | false }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {icon && <Skeleton className={cn("shrink-0", icon)} />}
      <div className="grid min-w-0 flex-1">
        <SkLine className={title} />
        {sub && <SkLine className={cn("h-4", sub)} />}
      </div>
      {right && <SkLine className={right} />}
    </div>
  )
}

/** Linha de transação (TxSwipe): quadrado 36, descrição + categoria, valor + conta à direita; 60px. */
export const SkTxRow = ({ w = "w-40" }: { w?: string }) => (
  <div className="flex items-center gap-3 border-b px-3.5 py-3 last:border-0">
    <Skeleton className="size-9 shrink-0 rounded-lg" />
    <div className="grid min-w-0 flex-1">
      <SkLine className={w} />
      <SkLine className="h-4 w-28" />
    </div>
    <div className="grid justify-items-end">
      <SkLine className="w-20" />
      <SkLine className="h-4 w-14" />
    </div>
  </div>
)

const TX_WIDTHS = ["w-40", "w-32", "w-44", "w-28", "w-36", "w-40", "w-32", "w-36"]

/** Lista de transações agrupada por dia (celular de Transações e detalhe da conta). `days` = linhas por dia. */
export function SkTxDays({ days }: { days: number[] }) {
  let k = 0
  return (
    <div className="grid gap-4">
      {days.map((n, d) => (
        <section key={d} className="grid gap-1.5">
          <div className="flex justify-between px-1">
            <SkLine className="h-4 w-28" />
            <SkLine className="h-4 w-16" />
          </div>
          <Card className="gap-0 py-0">
            {Array.from({ length: n }, () => {
              k++
              return <SkTxRow key={k} w={TX_WIDTHS[k % TX_WIDTHS.length]} />
            })}
          </Card>
        </section>
      ))}
    </div>
  )
}

/** Área de gráfico na altura real; `legend` = a legenda de botões embaixo (gap-3 + 28px). */
export function SkChart({ className = "h-[200px]", legend }: { className?: string; legend?: boolean }) {
  return (
    <div className="grid gap-3">
      <Skeleton className={cn("w-full rounded-lg opacity-60", className)} />
      {legend && (
        <div className="flex min-h-7 justify-center gap-3">
          <SkLine className="h-7 w-20" />
          <SkLine className="h-7 w-20" />
        </div>
      )}
    </div>
  )
}

// ── Investimentos ──

/** Cabeçalho de card de Investimentos (CardHead): ícone 32, título 24 e subtítulo 18. */
export function SkCardHead({ title = "w-40", description = "w-56", action }: { title?: string; description?: string; action?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <div className="grid min-w-0">
          <SkLine className={cn("h-6", title)} />
          <SkLine className={cn("h-[18px]", description)} />
        </div>
      </div>
      {action && <Skeleton className={cn("h-7 rounded-lg", action)} />}
    </div>
  )
}

/** InvestHeader: título com 3 botões e as abas Resumo/Ativos/Proventos (`active` = índice). */
export function SkInvestHeader({ active = 0, children }: { active?: number; children?: React.ReactNode }) {
  return (
    <div className="grid gap-4">
      <SkTitle title="w-48" description="w-[28rem]" wrap actions={["h-7 w-9 sm:w-28", "w-36", "w-40"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="inline-flex rounded-lg p-[3px]">
          {["w-[84px]", "w-[66px]", "w-[94px]"].map((w, i) => (
            <span key={i} className={cn("h-8 rounded-md", w, i === active && "bg-card shadow-sm")} />
          ))}
        </Skeleton>
        {children}
      </div>
    </div>
  )
}

/** Faixa de KPIs de Investimentos (células separadas por 1px, ícone 36 + rótulo caixa-alta, valor, contexto). */
export function SkInvestKpis({ n, className }: { n: number; className: string }) {
  return (
    <section className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border", className)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={cn("grid content-start gap-2 bg-card p-4", n === 5 && i === 0 && "max-sm:col-span-2")}>
          <span className="flex items-center gap-2.5">
            <Skeleton className="size-9 shrink-0 rounded-[10px]" />
            <SkLine className="h-3.5 w-20" />
          </span>
          <SkLine className="h-7 w-32 sm:h-8" />
          <SkLine className="h-4 w-36" />
        </div>
      ))}
    </section>
  )
}
