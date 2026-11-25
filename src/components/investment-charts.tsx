"use client"

import { useEffect, useId, useState } from "react"
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts"
import { Dot, Line as LegendLine, ToggleLegend, useSeriesToggle } from "@/components/chart-legend"
import { brl, monthLabel, signedPct } from "@/lib/format"
import { hide } from "@/components/bits"
import { cn } from "@/lib/utils"

// Gráficos da tela de Investimentos. A carteira é sempre a linha forte no tom do texto; cada índice tem a sua cor
// (--idx-*) e o seu traço, para nunca depender só da cor.

const compactNum = (n: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n)
const pctTick = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
const axis = { fontSize: 11, fill: "var(--muted-foreground)" }
const grid = { vertical: false, strokeDasharray: "4 4", stroke: "var(--border)" }
const cursorLine = { stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }

type Row = { label: string; value: string; color?: string; dash?: string }
// O que o Tooltip do Recharts passa para `content` (só o que usamos)
type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }>; label?: unknown }

/** Bolha escura do tooltip, igual à dos outros gráficos do app. */
function Bubble({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="grid gap-0.5 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
      <div className="mb-0.5 opacity-70">{(title.includes("R$")) ? hide(title) : title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-1.5 opacity-80">
            {r.color && <Swatch color={r.color} dash={r.dash} />}
            {r.label}
          </span>
          <span className="font-semibold tabular-nums">{(r.value.includes("R$")) ? hide(r.value) : r.value}</span>
        </div>
      ))}
    </div>
  )
}

function Swatch({ color, dash, width = 18 }: { color: string; dash?: string; width?: number }) {
  return (
    <svg width={width} height="8" aria-hidden className="shrink-0">
      <path d={`M1 4 H${width - 1}`} stroke={color} strokeWidth="2" strokeDasharray={dash} strokeLinecap={dash === "1 3" ? "round" : undefined} />
    </svg>
  )
}

export type EvolutionPoint = {
  month: string
  value: number | null
  applied: number | null
  acc: number | null
  cdiAcc: number | null
  ibovAcc: number | null
  ipcaAcc: number | null
  poupancaAcc: number | null
  dolarAcc: number | null
}

// A ordem é a das cores validadas para daltonismo (globals.css); a Selic fica de fora porque anda colada no CDI
const INDEXES = [
  { key: "cdiAcc", label: "CDI", color: "var(--idx-cdi)", dash: "6 4" },
  { key: "ibovAcc", label: "IBOV", color: "var(--idx-ibov)", dash: "1 3" },
  { key: "ipcaAcc", label: "IPCA", color: "var(--idx-ipca)", dash: "8 3 2 3" },
  { key: "poupancaAcc", label: "Poupança", color: "var(--idx-poupanca)", dash: "12 4" },
  { key: "dolarAcc", label: "Dólar", color: "var(--idx-dolar)", dash: "4 2 1 2" },
] as const
type IndexKey = (typeof INDEXES)[number]["key"]
// começam visíveis a carteira, o CDI e o IBOV; o resto entra pela pílula
const HIDDEN_AT_START: IndexKey[] = ["ipcaAcc", "poupancaAcc", "dolarAcc"]

type Mode = "pct" | "brl"
const MODES: { key: Mode; label: string }[] = [
  { key: "pct", label: "% Rentabilidade" },
  { key: "brl", label: "R$ Patrimônio" },
]

// As séries não usam a animação do Recharts (no primeiro quadro ela desenha a linha inteira e depois esconde): cada uma
// é revelada por recorte em CSS (.chart-reveal). Na abertura a carteira entra primeiro e os índices em seguida.
// As classes ficam escritas por extenso para o Tailwind gerá-las; os ms ao lado são os mesmos, para o ponto final.
const INTRO_DELAYS = ["[--reveal-delay:260ms]", "[--reveal-delay:370ms]", "[--reveal-delay:480ms]", "[--reveal-delay:590ms]", "[--reveal-delay:700ms]"]
const introMs = (order: number) => 260 + 110 * order
const INTRO_MS = 1400
// O recorte chega ao fim da linha em pouco mais da metade do tempo (easing exponencial): é quando o ponto final aparece
const dotDelay = (delayMs: number, durationMs: number) => delayMs + durationMs * 0.55

/**
 * Ponto só no último mês de cada linha: onde a série termina, o número que aparece na pílula. Os pontos ficam numa camada
 * do Recharts fora do recorte da linha, então surgem sozinhos quando a linha chega.
 */
function endDot(lastIndex: number, color: string, r: number, delayMs: number) {
  return function EndDot({ index, cx, cy }: { index?: number; cx?: number; cy?: number }) {
    if (index !== lastIndex || cx == null || cy == null) return <g key={`d${index}`} />
    return <circle key={`d${index}`} className="chart-dot" style={{ animationDelay: `${delayMs}ms` }} cx={cx} cy={cy} r={r} fill={color} stroke="var(--card)" strokeWidth={2} />
  }
}

/** Linha de um índice. O atraso de entrada é lido só ao montar: ligar o índice depois revela na hora. */
function IndexLine({ dataKey, color, dash, order, lastIndex }: { dataKey: IndexKey; color: string; dash: string; order?: number; lastIndex: number }) {
  const [intro] = useState(order)
  return (
    <Line
      className={cn("chart-reveal", intro != null && INTRO_DELAYS[intro])}
      dataKey={dataKey}
      type="monotone"
      stroke={color}
      strokeWidth={2}
      strokeDasharray={dash}
      strokeLinecap={dash === "1 3" ? "round" : undefined}
      dot={endDot(lastIndex, color, 3.5, dotDelay(intro != null ? introMs(intro) : 0, 700))}
      activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: color }}
      isAnimationActive={false}
    />
  )
}

/** Pílula de uma série: liga/desliga a linha e mostra onde ela termina. Desligada fica tracejada e riscada. */
function SeriesChip({ label, color, dash, value, on, strong, onToggle }: { label: string; color: string; dash?: string; value: number | null; on: boolean; strong?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? `Esconder ${label}` : `Mostrar ${label}`}
      onClick={onToggle}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap outline-none md:h-8 md:gap-2",
        "transition-[opacity,background-color,border-color,color] duration-150 ease-[cubic-bezier(.2,.7,.2,1)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35",
        on ? "border-border bg-card hover:bg-muted" : "border-dashed border-border text-muted-foreground line-through opacity-55 hover:opacity-90",
      )}
    >
      <Swatch color={on ? color : "var(--muted-foreground)"} dash={dash} />
      <span className={cn(on && (strong ? "text-foreground" : "text-muted-foreground"))}>{label}</span>
      {value != null && <span className={cn("tabular-nums", on && "text-foreground")}>{signedPct(value)}</span>}
    </button>
  )
}

/**
 * Evolução da carteira: um gráfico, duas leituras sobre o mesmo eixo de tempo. Em %, rentabilidade acumulada × índices
 * escolhidos (abre nesse modo); em R$, patrimônio × valor aplicado. Nunca as duas escalas juntas.
 */
export function EvolutionChart({ data, allowPct = true, height = 260 }: { data: EvolutionPoint[]; allowPct?: boolean; height?: number }) {
  // Abre em Rentabilidade; sem dois meses de rentabilidade (mas com saldo), abre no Patrimônio para não começar vazio
  const [mode, setMode] = useState<Mode>(() => (allowPct && data.filter((d) => d.acc != null).length >= 2 ? "pct" : "brl"))
  // Janela da abertura: só as linhas montadas nela entram em sequência
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), INTRO_MS)
    return () => clearTimeout(t)
  }, [])
  const fillId = `evo-${useId().replace(/[^\w-]/g, "")}`
  // %: carteira × índices; R$: patrimônio × aplicado. Cada modo tem a sua legenda clicável.
  const money = useSeriesToggle(["value", "applied"])
  const rel = useSeriesToggle(["acc", ...INDEXES.map((i) => i.key)], HIDDEN_AT_START)
  const on = Object.fromEntries(INDEXES.map((i) => [i.key, rel.isVisible(i.key)])) as Record<IndexKey, boolean>
  const pct = allowPct && mode === "pct"
  const rows = pct ? data.filter((d) => d.acc != null) : data.filter((d) => d.value != null)
  const available = INDEXES.filter((i) => rows.some((d) => d[i.key] != null))
  const last = rows[rows.length - 1]
  const lastIndex = rows.length - 1
  const shown = available.filter((i) => on[i.key])

  const tooltip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null
    const p = payload[0].payload as EvolutionPoint
    const items: Row[] = pct
      ? [
          ...(rel.isVisible("acc") ? [{ label: "Carteira", value: signedPct(p.acc ?? 0), color: "var(--foreground)" }] : []),
          ...available.filter((i) => on[i.key] && p[i.key] != null).map((i) => ({ label: i.label, value: signedPct(p[i.key]!), color: i.color, dash: i.dash })),
        ]
      : [
          ...(money.isVisible("value") ? [{ label: "Patrimônio", value: brl(p.value ?? 0), color: "var(--foreground)" }] : []),
          ...(money.isVisible("applied") && p.applied != null ? [{ label: "Aplicado", value: brl(p.applied), color: "var(--muted-foreground)", dash: "5 4" }, ...(money.isVisible("value") ? [{ label: "Ganho", value: `${(p.value ?? 0) - p.applied >= 0 ? "+" : ""}${brl((p.value ?? 0) - p.applied)}` }] : [])] : []),
        ]
    return <Bubble title={monthLabel(String(label))} rows={items} />
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {allowPct && (
          // Segmentado com o fundo do item ativo deslizando de um lado ao outro (como o marcador do menu)
          <div className="relative grid grid-cols-2 rounded-lg bg-muted p-[3px] md:order-last md:inline-grid md:shrink-0" role="group" aria-label="Mostrar em">
            <span
              aria-hidden
              className="absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-md border bg-card shadow-sm transition-transform duration-[220ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
              style={{ transform: mode === MODES[0].key ? undefined : "translateX(100%)" }}
            />
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={mode === m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  "relative h-9 rounded-md px-3 text-xs font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 md:h-8",
                  mode === m.key && "text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        {pct ? (
          // As pílulas quebram em linhas. Rolagem lateral foi descartada: dentro do card arredondado com overflow-hidden o
          // Chromium deixava de pintar a fileira.
          <div role="group" aria-label="Séries do gráfico" className="flex flex-wrap gap-1.5">

            <SeriesChip label="Carteira" color="var(--foreground)" strong value={last?.acc ?? null} on={rel.isVisible("acc")} onToggle={() => rel.toggle("acc")} />
            {available.map((i) => (
              <SeriesChip key={i.key} label={i.label} color={i.color} dash={i.dash} value={last?.[i.key] ?? null} on={on[i.key]} onToggle={() => rel.toggle(i.key)} />
            ))}
            {available.length === 0 && <span className="self-center text-xs text-muted-foreground">Índices ainda não carregados</span>}
          </div>
        ) : (
          <ToggleLegend
            className="justify-start"
            isVisible={money.isVisible}
            onToggle={money.toggle}
            items={[
              { key: "value", label: "Patrimônio", swatch: <LegendLine color="var(--foreground)" /> },
              { key: "applied", label: "Valor aplicado", swatch: <LegendLine color="var(--muted-foreground)" dash="5 4" /> },
            ]}
          />
        )}
      </div>

      {rows.length < 2 ? (
        <p className="grid place-items-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground" style={{ height }}>
          {pct
            ? "A rentabilidade aparece a partir do segundo mês com saldo registrado."
            : rows.length
              ? `Só há saldo de ${monthLabel(rows[0].month)}. A evolução aparece a partir do segundo mês.`
              : "Ainda não há saldo registrado. Ele é gravado a cada sincronização."}
        </p>
      ) : (
        <ComposedChart responsive className={cn(pct && "axis-public")} style={{ width: "100%", height }} data={rows} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <defs>
            {/* a área da carteira some em direção à linha do zero (ou à base, em R$) */}
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.13} />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...grid} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={8} minTickGap={16} />
          <YAxis orientation="right" tickFormatter={pct ? pctTick : compactNum} tick={axis} axisLine={false} tickLine={false} width={64} domain={["auto", "auto"]} />
          <Tooltip content={tooltip} cursor={cursorLine} />
          {pct ? (
            <>
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.35} />
              {shown.map((i) => (
                <IndexLine key={i.key} dataKey={i.key} color={i.color} dash={i.dash} lastIndex={lastIndex} order={intro ? shown.indexOf(i) : undefined} />
              ))}
              {rel.isVisible("acc") && (
                <Area
                  className="chart-reveal [--reveal-duration:900ms]"
                  dataKey="acc"
                  type="monotone"
                  baseValue={0}
                  stroke="var(--foreground)"
                  strokeWidth={2.5}
                  fill={`url(#${fillId})`}
                  dot={endDot(lastIndex, "var(--foreground)", 4, dotDelay(0, 900))}
                  activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--card)" }}
                  isAnimationActive={false}
                />
              )}
            </>
          ) : (
            <>
              {money.isVisible("applied") && (
                <Line className="chart-reveal [--reveal-delay:120ms]" dataKey="applied" type="monotone" stroke="var(--muted-foreground)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
              )}
              {money.isVisible("value") && (
                <Area
                  className="chart-reveal [--reveal-duration:900ms]"
                  dataKey="value"
                  type="monotone"
                  stroke="var(--foreground)"
                  strokeWidth={2.5}
                  fill={`url(#${fillId})`}
                  dot={endDot(lastIndex, "var(--foreground)", 4, dotDelay(0, 900))}
                  activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--card)" }}
                  isAnimationActive={false}
                />
              )}
            </>
          )}
        </ComposedChart>
      )}
    </div>
  )
}

export type Slice = { key: string; label: string; color: string; value: number }

/** Rosca da alocação com o total no meio; a cor de cada fatia é a da categoria e a ordem é fixa. */
export function AllocationDonut({ data, total, size = 168, centerLabel }: { data: Slice[]; total: number; size?: number; centerLabel?: string }) {
  const tooltip = ({ active, payload }: TipProps) => {
    if (!active || !payload?.length) return null
    const s = payload[0].payload as Slice
    return <Bubble title={s.label} rows={[{ label: "Saldo", value: brl(s.value) }, { label: "Carteira", value: `${((s.value / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` }]} />
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <PieChart width={size} height={size} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Pie
          data={data.length ? data : [{ key: "-", label: "—", color: "var(--muted)", value: 1 }]}
          dataKey="value"
          nameKey="label"
          innerRadius="64%"
          outerRadius="100%"
          paddingAngle={data.length > 1 ? 1.5 : 0}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          isAnimationActive={false}
        >
          {(data.length ? data : [{ key: "-", color: "var(--muted)" }]).map((d) => (
            <Cell key={d.key} fill={d.color} />
          ))}
        </Pie>
        {data.length > 0 && <Tooltip content={tooltip} />}
      </PieChart>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <span className="grid">
          <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Total</span>
          <span className="text-base font-bold tabular-nums">{hide(centerLabel ?? brl(total))}</span>
        </span>
      </div>
    </div>
  )
}

export type AllocationRow = Slice

const brl0 = (n: number) => brl(n).replace(/,\d\d$/, "")
const pct1 = (n: number) => `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

/** Rosca + lista de categorias; clicar numa categoria da lista a tira da rosca e os percentuais passam a valer só para o que ficou. */
export function AllocationPanel({ rows, total }: { rows: AllocationRow[]; total: number }) {
  const legend = useSeriesToggle(rows.map((r) => r.key))
  const shown = rows.filter((r) => legend.isVisible(r.key))
  const shownTotal = legend.anyHidden ? shown.reduce((t, r) => t + r.value, 0) : total
  return (
    <div className="flex flex-1 flex-wrap items-center gap-5">
      <AllocationDonut data={shown} total={shownTotal} centerLabel={`R$ ${compactNum(shownTotal)}`} />
      <ul className="grid min-w-44 flex-1" aria-label="Categorias">
        {rows.map((r) => {
          const on = legend.isVisible(r.key)
          return (
            <li key={r.key} className="border-t first:border-0">
              <button
                type="button"
                aria-pressed={on}
                title={on ? `Esconder ${r.label}` : `Mostrar ${r.label}`}
                onClick={() => legend.toggle(r.key)}
                className={cn("flex min-h-9 w-full items-center gap-2.5 rounded-md py-1 text-left transition-opacity duration-150 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50", !on && "opacity-50")}
              >
                <Dot color={r.color} square />
                <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", !on && "line-through")}>{r.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{hide(brl0(r.value))}</span>
                <b className="w-12 text-right text-sm tabular-nums">{on && shownTotal ? pct1(r.value / shownTotal) : "—"}</b>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Rentabilidade de cada mês (barras verdes/vermelhas) com o CDI do mês marcado por um traço. */
export function MonthlyReturnsChart({ data, height = 200 }: { data: { month: string; ret: number | null; cdi: number | null }[]; height?: number }) {
  const rows = data.filter((d) => d.ret != null)
  const legend = useSeriesToggle(["ret", "cdi"])
  if (rows.length === 0) return <p className="grid place-items-center rounded-xl border border-dashed text-sm text-muted-foreground" style={{ height }}>Ainda não há meses fechados com saldo registrado.</p>
  const tooltip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null
    const p = payload[0].payload as (typeof rows)[number]
    return <Bubble title={monthLabel(String(label))} rows={[...(legend.isVisible("ret") ? [{ label: "Carteira", value: signedPct(p.ret ?? 0) }] : []), ...(legend.isVisible("cdi") && p.cdi != null ? [{ label: "CDI", value: signedPct(p.cdi) }] : [])]} />
  }
  return (
    <div className="grid gap-3">
    <ComposedChart responsive className="axis-public" style={{ width: "100%", height }} data={rows} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
      <CartesianGrid {...grid} />
      <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={8} minTickGap={8} />
      <YAxis tickFormatter={pctTick} tick={axis} axisLine={false} tickLine={false} width={48} />
      <Tooltip content={tooltip} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
      <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
      {legend.isVisible("ret") && (
        <Bar dataKey="ret" radius={[4, 4, 4, 4]} maxBarSize={22} isAnimationActive={false}>
          {rows.map((d) => (
            <Cell key={d.month} fill={(d.ret ?? 0) >= 0 ? "var(--income)" : "var(--expense)"} />
          ))}
        </Bar>
      )}
      {legend.isVisible("cdi") && (
      <Line
        dataKey="cdi"
        stroke="none"
        isAnimationActive={false}
        activeDot={false}
        dot={({ cx, cy, index }) =>
          cx != null && cy != null && rows[index]?.cdi != null ? (
            <g key={index}>
              <path d={`M${cx - 13} ${cy} H${cx + 13}`} stroke="var(--card)" strokeWidth={5} strokeLinecap="round" />
              <path d={`M${cx - 13} ${cy} H${cx + 13}`} stroke="var(--foreground)" strokeWidth={2} strokeLinecap="round" />
            </g>
          ) : (
            <g key={index} />
          )
        }
      />
      )}
    </ComposedChart>
      <ToggleLegend
        isVisible={legend.isVisible}
        onToggle={legend.toggle}
        items={[
          { key: "ret", label: "Carteira no mês", swatch: <span className="flex gap-0.5"><Dot color="var(--income)" square /><Dot color="var(--expense)" square /></span> },
          { key: "cdi", label: "CDI do mês", swatch: <LegendLine color="var(--foreground)" width={14} /> },
        ]}
      />
    </div>
  )
}

export const INCOME_SERIES = [
  { key: "fii", label: "Rendimentos FII", color: "var(--inv-fii)" },
  { key: "dividend", label: "Dividendos", color: "var(--inv-acoes)" },
  { key: "jcp", label: "JCP", color: "var(--inv-inflacao)" },
  { key: "interest", label: "Juros", color: "var(--inv-pos)" },
] as const

/** Proventos por mês, empilhados por tipo. */
export function IncomeChart({ data, height = 240 }: { data: { month: string; fii: number; dividend: number; jcp: number; interest: number }[]; height?: number }) {
  const all = INCOME_SERIES.filter((s) => data.some((d) => d[s.key] > 0))
  const legend = useSeriesToggle(all.map((s) => s.key))
  const series = all.filter((s) => legend.isVisible(s.key))
  const tooltip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null
    const p = payload[0].payload as (typeof data)[number]
    const total = series.reduce((t, s) => t + p[s.key], 0)
    return <Bubble title={`${monthLabel(String(label))} · ${brl(total)}`} rows={series.filter((s) => p[s.key] > 0).map((s) => ({ label: s.label, value: brl(p[s.key]), color: s.color }))} />
  }
  return (
    <div className="grid gap-3">
      <BarChart responsive style={{ width: "100%", height }} data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={8} minTickGap={8} />
        <YAxis tickFormatter={compactNum} tick={axis} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={tooltip} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} maxBarSize={28} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} stroke="var(--card)" strokeWidth={1} isAnimationActive={false} />
        ))}
      </BarChart>
      <ToggleLegend isVisible={legend.isVisible} onToggle={legend.toggle} items={all.map((s) => ({ key: s.key, label: s.label, swatch: <Dot color={s.color} square /> }))} />
    </div>
  )
}
