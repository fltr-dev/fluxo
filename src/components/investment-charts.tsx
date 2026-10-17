"use client"

import { useState } from "react"
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts"
import { brl, monthLabel, signedPct } from "@/lib/format"
import { cn } from "@/lib/utils"

// Gráficos da tela de Investimentos. A carteira é sempre a linha escura e forte; os índices ficam em cinza,
// com traços diferentes e o nome escrito, para não competir com as cores das categorias.

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
      <div className="mb-0.5 opacity-70">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-1.5 opacity-80">
            {r.color && <Swatch color={r.color} dash={r.dash} />}
            {r.label}
          </span>
          <span className="font-semibold tabular-nums">{r.value}</span>
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
}

const INDEXES = [
  { key: "cdiAcc", label: "CDI", color: "var(--muted-foreground)", dash: "6 4" },
  { key: "ibovAcc", label: "IBOV", color: "var(--muted-foreground)", dash: "1 3" },
  { key: "ipcaAcc", label: "IPCA", color: "var(--muted-foreground)", dash: "8 3 2 3" },
] as const
type IndexKey = (typeof INDEXES)[number]["key"]

/**
 * Evolução da carteira: um gráfico, duas leituras sobre o mesmo eixo de tempo. Em R$, patrimônio × valor aplicado;
 * em %, rentabilidade acumulada × índices escolhidos. Nunca as duas escalas juntas.
 */
export function EvolutionChart({ data, allowPct = true, height = 260 }: { data: EvolutionPoint[]; allowPct?: boolean; height?: number }) {
  const [mode, setMode] = useState<"brl" | "pct">("brl")
  const [on, setOn] = useState<Record<IndexKey, boolean>>({ cdiAcc: true, ibovAcc: true, ipcaAcc: false })
  const pct = allowPct && mode === "pct"
  const rows = pct ? data.filter((d) => d.acc != null) : data.filter((d) => d.value != null)
  const available = INDEXES.filter((i) => rows.some((d) => d[i.key] != null))
  const last = rows[rows.length - 1]

  const tooltip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null
    const p = payload[0].payload as EvolutionPoint
    const items: Row[] = pct
      ? [
          { label: "Carteira", value: signedPct(p.acc ?? 0), color: "var(--foreground)" },
          ...available.filter((i) => on[i.key] && p[i.key] != null).map((i) => ({ label: i.label, value: signedPct(p[i.key]!), color: i.color, dash: i.dash })),
        ]
      : [
          { label: "Patrimônio", value: brl(p.value ?? 0), color: "var(--foreground)" },
          ...(p.applied != null ? [{ label: "Aplicado", value: brl(p.applied), color: "var(--muted-foreground)", dash: "5 4" }, { label: "Ganho", value: `${(p.value ?? 0) - p.applied >= 0 ? "+" : ""}${brl((p.value ?? 0) - p.applied)}` }] : []),
        ]
    return <Bubble title={monthLabel(String(label))} rows={items} />
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {pct ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Comparar com">
            {available.map((i) => (
              <button
                key={i.key}
                type="button"
                aria-pressed={on[i.key]}
                onClick={() => setOn((o) => ({ ...o, [i.key]: !o[i.key] }))}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold text-muted-foreground",
                  on[i.key] && "border-foreground bg-foreground text-background",
                )}
              >
                <Swatch color="currentColor" dash={i.dash} />
                {i.label}
              </button>
            ))}
            {available.length === 0 && <span className="text-xs text-muted-foreground">Índices ainda não carregados</span>}
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5"><Swatch color="var(--foreground)" />Patrimônio</span>
            <span className="flex items-center gap-1.5"><Swatch color="var(--muted-foreground)" dash="5 4" />Valor aplicado</span>
          </div>
        )}
        {allowPct && (
          <div className="inline-flex rounded-lg bg-muted p-[3px]" role="group" aria-label="Mostrar em">
            {(["brl", "pct"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn("h-7 rounded-md px-2.5 text-xs font-semibold text-muted-foreground", mode === m && "bg-card text-foreground shadow-sm")}
              >
                {m === "brl" ? "R$ Patrimônio" : "% Rentabilidade"}
              </button>
            ))}
          </div>
        )}
      </div>

      {rows.length < 2 ? (
        <p className="grid place-items-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground" style={{ height }}>
          {pct ? "A rentabilidade aparece a partir do segundo mês com saldo registrado." : "O histórico começa a ser registrado na primeira sincronização."}
        </p>
      ) : (
        <ComposedChart responsive style={{ width: "100%", height }} data={rows} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={8} minTickGap={16} />
          <YAxis orientation="right" tickFormatter={pct ? pctTick : compactNum} tick={axis} axisLine={false} tickLine={false} width={64} domain={["auto", "auto"]} />
          <Tooltip content={tooltip} cursor={cursorLine} />
          {pct ? (
            <>
              <ReferenceLine y={0} stroke="var(--border)" />
              {available.map((i) => on[i.key] && <Line key={i.key} dataKey={i.key} type="monotone" stroke={i.color} strokeWidth={2} strokeDasharray={i.dash} dot={false} activeDot={false} isAnimationActive={false} />)}
              <Line dataKey="acc" type="monotone" stroke="var(--foreground)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--card)" }} isAnimationActive={false} />
            </>
          ) : (
            <>
              <Area dataKey="value" type="monotone" stroke="var(--foreground)" strokeWidth={2.5} fill="var(--foreground)" fillOpacity={0.05} activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--card)" }} isAnimationActive={false} />
              <Line dataKey="applied" type="monotone" stroke="var(--muted-foreground)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
            </>
          )}
        </ComposedChart>
      )}

      {pct && last && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1.5"><Swatch color="var(--foreground)" />Carteira <b className="text-foreground tabular-nums">{signedPct(last.acc ?? 0)}</b></span>
          {available.filter((i) => on[i.key] && last[i.key] != null).map((i) => (
            <span key={i.key} className="flex items-center gap-1.5"><Swatch color={i.color} dash={i.dash} />{i.label} <b className="text-foreground tabular-nums">{signedPct(last[i.key]!)}</b></span>
          ))}
        </div>
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
          <span className="text-base font-bold tabular-nums">{centerLabel ?? brl(total)}</span>
        </span>
      </div>
    </div>
  )
}

/** Rentabilidade de cada mês (barras verdes/vermelhas) com o CDI do mês marcado por um traço. */
export function MonthlyReturnsChart({ data, height = 200 }: { data: { month: string; ret: number | null; cdi: number | null }[]; height?: number }) {
  const rows = data.filter((d) => d.ret != null)
  if (rows.length === 0) return <p className="grid place-items-center rounded-xl border border-dashed text-sm text-muted-foreground" style={{ height }}>Ainda não há meses fechados com saldo registrado.</p>
  const tooltip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null
    const p = payload[0].payload as (typeof rows)[number]
    return <Bubble title={monthLabel(String(label))} rows={[{ label: "Carteira", value: signedPct(p.ret ?? 0) }, ...(p.cdi != null ? [{ label: "CDI", value: signedPct(p.cdi) }] : [])]} />
  }
  return (
    <ComposedChart responsive style={{ width: "100%", height }} data={rows} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
      <CartesianGrid {...grid} />
      <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={8} minTickGap={8} />
      <YAxis tickFormatter={pctTick} tick={axis} axisLine={false} tickLine={false} width={48} />
      <Tooltip content={tooltip} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
      <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
      <Bar dataKey="ret" radius={[4, 4, 4, 4]} maxBarSize={22} isAnimationActive={false}>
        {rows.map((d) => (
          <Cell key={d.month} fill={(d.ret ?? 0) >= 0 ? "var(--income)" : "var(--expense)"} />
        ))}
      </Bar>
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
    </ComposedChart>
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
  const series = INCOME_SERIES.filter((s) => data.some((d) => d[s.key] > 0))
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
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
    </div>
  )
}
