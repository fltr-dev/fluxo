"use client"

import { useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts"
import { Dot, ToggleLegend, useSeriesToggle } from "@/components/chart-legend"
import { brl, monthLabel, signedPct } from "@/lib/format"
import { cn } from "@/lib/utils"

const compactNum = (n: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n)
const axis = { fontSize: 11, fill: "var(--muted-foreground)" }
const grid = { vertical: false, strokeDasharray: "4 4", stroke: "var(--border)" }

/** Tooltip escuro no estilo do design (bolha com título e linhas). */
function Bubble({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
      <div className="mb-1 opacity-70">{typeof label === "string" && /^\d{4}-\d{2}$/.test(label) ? monthLabel(label) : label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          {payload.length > 1 && (
            <span className="flex items-center gap-1.5 opacity-80">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
          )}
          <span className="font-semibold tabular-nums sensitive">{brl(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

const RANGES = [3, 6, 12] as const

/** Patrimônio líquido: área verde com seletor de intervalo (3, 6, 12 meses). */
export function NetWorthArea({ data, current }: { data: { month: string; value: number }[]; current: number }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(12)
  const slice = data.slice(-range)
  const first = slice.find((d) => d.value)?.value ?? 0
  const change = first ? (current - first) / Math.abs(first) : null
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <span className="text-sm font-medium text-muted-foreground">Patrimônio líquido</span>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="text-3xl font-semibold tracking-tight tabular-nums sensitive">{brl(current)}</span>
            {change != null && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", change >= 0 ? "bg-income/10 text-income" : "bg-rose-500/10 text-expense")}>
                {signedPct(change)} em {range} meses
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">Contas + investimentos − fatura aberta dos cartões</span>
        </div>
        <div className="inline-flex rounded-lg bg-muted p-[3px]" role="group" aria-label="Intervalo">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={cn("h-7 min-w-10 rounded-md px-2.5 text-sm font-medium text-muted-foreground", range === r && "bg-card text-foreground shadow-sm")}
            >
              {r}m
            </button>
          ))}
        </div>
      </div>
      <AreaChart responsive style={{ width: "100%", height: 240 }} data={slice} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="nw-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={8} />
        <YAxis orientation="right" tickFormatter={compactNum} tick={axis} axisLine={false} tickLine={false} width={72} domain={["auto", "auto"]} />
        <Tooltip content={<Bubble />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }} />
        <Area dataKey="value" name="Patrimônio" type="monotone" stroke="var(--primary)" strokeWidth={2.25} fill="url(#nw-fill)" activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--card)" }} />
      </AreaChart>
    </div>
  )
}

/** Saldo de uma conta mês a mês (área na cor da conta). */
export function BalanceArea({ data, color }: { data: { month: string; value: number }[]; color: string }) {
  return (
    <AreaChart responsive style={{ width: "100%", height: 200 }} data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
      <defs>
        <linearGradient id="bal-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid {...grid} />
      <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={8} />
      <YAxis orientation="right" tickFormatter={compactNum} tick={axis} axisLine={false} tickLine={false} width={72} domain={["auto", "auto"]} />
      <Tooltip content={<Bubble />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }} />
      <Area dataKey="value" name="Saldo" type="monotone" stroke={color} strokeWidth={2.25} fill="url(#bal-fill)" activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--card)" }} />
    </AreaChart>
  )
}

/** Meio-donut com o total no centro e legenda em percentuais; clicar numa categoria da legenda a tira do gráfico. */
export function ExpenseGauge({ data, total }: { data: { name: string; value: number; color: string }[]; total: number }) {
  const legend = useSeriesToggle(data.map((d) => d.name))
  const shown = data.filter((d) => legend.isVisible(d.name))
  const shownTotal = legend.anyHidden ? shown.reduce((t, d) => t + d.value, 0) : total
  return (
    <div className="grid justify-items-center gap-4">
      <div className="relative w-full max-w-60">
        <PieChart responsive style={{ width: "100%", aspectRatio: 2 }} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={shown.length ? shown : [{ name: "—", value: 1, color: "var(--muted)" }]}
            dataKey="value"
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius="140%"
            outerRadius="190%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {(shown.length ? shown : [{ color: "var(--muted)" }]).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          {shown.length > 0 && <Tooltip content={<Bubble />} />}
        </PieChart>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 grid justify-items-center">
          <span className="text-xs text-muted-foreground">{legend.anyHidden ? "Total selecionado" : "Total no período"}</span>
          <span className="text-xl font-semibold tabular-nums sensitive">{brl(shownTotal)}</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-3 gap-x-1 gap-y-1" aria-label="Categorias">
        {data.map((d) => {
          const on = legend.isVisible(d.name)
          return (
            <li key={d.name} className="min-w-0">
              <button
                type="button"
                aria-pressed={on}
                title={on ? `Esconder ${d.name}` : `Mostrar ${d.name}`}
                onClick={() => legend.toggle(d.name)}
                className={cn(
                  "grid w-full min-w-0 gap-0.5 rounded-md px-1.5 py-1 text-left transition-opacity duration-150 ease-[cubic-bezier(.2,.7,.2,1)] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                  !on && "opacity-50",
                )}
              >
                <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", !on && "line-through")}>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />
                  <span className="truncate">{d.name}</span>
                </span>
                <span className="pl-3.5 text-sm font-semibold tabular-nums">{on && shownTotal ? ((d.value / shownTotal) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : 0}%</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Receitas x despesas por mês, com o último mês em destaque; a legenda liga e desliga cada série. */
export function IncomeExpenseChart({ data, height = 200 }: { data: { month: string; income: number; expense: number }[]; height?: number }) {
  const last = data.length - 1
  const legend = useSeriesToggle(["income", "expense"])
  return (
    <div className="grid gap-3">
      <BarChart responsive style={{ width: "100%", height }} data={data} barGap={3} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis
          dataKey="month"
          tickFormatter={monthLabel}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          tick={({ x, y, payload, index }) => (
            <text x={x} y={y} dy={10} textAnchor="middle" fontSize={11} fontWeight={index === last ? 600 : 400} fill={index === last ? "var(--income)" : "var(--muted-foreground)"}>
              {monthLabel(payload.value)}
            </text>
          )}
        />
        <YAxis tickFormatter={compactNum} tick={axis} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={<Bubble />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        {legend.isVisible("income") && (
          <Bar dataKey="income" name="Receitas" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={12}>
            {data.map((_, i) => (
              <Cell key={i} fillOpacity={i === last ? 1 : 0.55} />
            ))}
          </Bar>
        )}
        {legend.isVisible("expense") && (
          <Bar dataKey="expense" name="Despesas" fill="var(--chart-5)" radius={[4, 4, 0, 0]} maxBarSize={12}>
            {data.map((_, i) => (
              <Cell key={i} fillOpacity={i === last ? 1 : 0.55} />
            ))}
          </Bar>
        )}
      </BarChart>
      <ToggleLegend
        isVisible={legend.isVisible}
        onToggle={legend.toggle}
        items={[
          { key: "income", label: "Receitas", swatch: <Dot color="var(--chart-1)" /> },
          { key: "expense", label: "Despesas", swatch: <Dot color="var(--chart-5)" /> },
        ]}
      />
    </div>
  )
}

/** Barras empilhadas por categoria ao longo dos meses; clicar numa categoria da legenda a tira da pilha. */
export function StackedCategoryChart({ data, series }: { data: Record<string, string | number>[]; series: { key: string; name: string; color: string }[] }) {
  const legend = useSeriesToggle(series.map((s) => s.key))
  const shown = series.filter((s) => legend.isVisible(s.key))
  return (
    <div className="grid gap-3">
      <BarChart responsive style={{ width: "100%", height: 280 }} data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={8} />
        <YAxis tickFormatter={compactNum} tick={axis} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={<Bubble />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        {shown.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} maxBarSize={48} radius={i === shown.length - 1 ? [4, 4, 0, 0] : 0} />
        ))}
      </BarChart>
      <ToggleLegend isVisible={legend.isVisible} onToggle={legend.toggle} items={series.map((s) => ({ key: s.key, label: s.name, swatch: <Dot color={s.color} square /> }))} />
    </div>
  )
}

/** Comparativo por categoria: período atual (cor da categoria) vs referência (cinza); a legenda liga e desliga cada um. */
export function CompareBars({ data, refLabel }: { data: { name: string; color: string; cur: number; prev: number }[]; refLabel: string }) {
  const legend = useSeriesToggle(["cur", "prev"])
  return (
    <div className="grid gap-3">
      <BarChart responsive style={{ width: "100%", height: 260 }} data={data} barGap={4} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} tickMargin={8} interval={0} />
        <YAxis tickFormatter={compactNum} tick={axis} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={<Bubble />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        {legend.isVisible("cur") && (
          <Bar dataKey="cur" name="Período" radius={[4, 4, 0, 0]} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        )}
        {legend.isVisible("prev") && <Bar dataKey="prev" name={refLabel} fill="var(--border)" radius={[4, 4, 0, 0]} maxBarSize={22} />}
      </BarChart>
      <ToggleLegend
        isVisible={legend.isVisible}
        onToggle={legend.toggle}
        items={[
          {
            key: "cur",
            label: "Período",
            swatch: (
              <span className="flex gap-0.5">
                {data.slice(0, 3).map((d) => (
                  <Dot key={d.name} color={d.color} square />
                ))}
              </span>
            ),
          },
          { key: "prev", label: refLabel, swatch: <Dot color="var(--muted-foreground)" square /> },
        ]}
      />
    </div>
  )
}

/** Linha simples (patrimônio nos relatórios). */
export function NetWorthChart({ data }: { data: { month: string; value: number }[] }) {
  return (
    <LineChart responsive style={{ width: "100%", height: 260 }} data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
      <CartesianGrid {...grid} />
      <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={8} />
      <YAxis orientation="right" tickFormatter={compactNum} tick={axis} axisLine={false} tickLine={false} width={72} domain={["auto", "auto"]} />
      <Tooltip content={<Bubble />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }} />
      <Line dataKey="value" name="Patrimônio" type="monotone" stroke="var(--primary)" strokeWidth={2.25} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--card)" }} />
    </LineChart>
  )
}

/** Despesa mensal com a linha tracejada da média (reserva). */
export function MonthlyExpenseChart({ data, average }: { data: { month: string; value: number }[]; average: number }) {
  return (
    <BarChart responsive style={{ width: "100%", height: 200 }} data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
      <CartesianGrid {...grid} />
      <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={8} />
      <YAxis tickFormatter={compactNum} tick={axis} axisLine={false} tickLine={false} width={64} />
      <Tooltip content={<Bubble />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
      <Bar dataKey="value" name="Despesa" radius={[4, 4, 0, 0]} maxBarSize={28}>
        {data.map((d) => (
          <Cell key={d.month} fill={d.value > average ? "var(--muted-foreground)" : "var(--border)"} />
        ))}
      </Bar>
      <ReferenceLine y={average} stroke="var(--primary)" strokeDasharray="5 4" strokeWidth={2} />
    </BarChart>
  )
}
