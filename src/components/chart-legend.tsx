"use client"

import { useCallback, useMemo, useState } from "react"
import { cn } from "@/lib/utils"

// Legenda clicável: tocar num item esconde a série do gráfico (riscado e apagado na legenda); tocar de novo mostra.
// Sempre sobra ao menos uma série visível, e a escala do gráfico se ajusta ao que ficou.

/** Quais séries estão visíveis. `keys` são todas as séries possíveis agora; chaves que sumiram são ignoradas. */
export function useSeriesToggle(keys: readonly string[], initiallyHidden: readonly string[] = []) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(initiallyHidden))
  const id = keys.join("|")
  // visíveis = todas menos as escondidas; se (por mudança dos dados) não sobrar nenhuma, mostra todas
  const visibleKeys = useMemo(() => {
    const v = keys.filter((k) => !hidden.has(k))
    return v.length ? v : [...keys]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hidden])
  const isVisible = useCallback((k: string) => visibleKeys.includes(k), [visibleKeys])
  const toggle = useCallback(
    (k: string) =>
      setHidden(() => {
        const next = new Set(keys.filter((x) => !visibleKeys.includes(x)))
        if (next.has(k)) next.delete(k)
        else if (visibleKeys.some((x) => x !== k)) next.add(k) // a última visível não se esconde
        return next
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, visibleKeys],
  )
  const reset = useCallback(() => setHidden(new Set()), [])
  return { isVisible, toggle, visibleKeys, reset, anyHidden: visibleKeys.length < keys.length }
}

export type LegendItem = {
  key: string
  label: string
  /** Marca de cor (ponto, quadrado ou traço) mostrada antes do nome */
  swatch: React.ReactNode
  /** Texto extra depois do nome (valor, percentual…) */
  detail?: React.ReactNode
}

/** Botão de uma série: `aria-pressed` diz se ela está no gráfico. */
export function LegendButton({ item, on, onToggle, className }: { item: LegendItem; on: boolean; onToggle: (key: string) => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? `Esconder ${item.label}` : `Mostrar ${item.label}`}
      onClick={() => onToggle(item.key)}
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground transition-[opacity,background-color,color] duration-150 ease-[cubic-bezier(.2,.7,.2,1)] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        !on && "opacity-50 line-through",
        className,
      )}
    >
      <span className={cn("inline-flex shrink-0 transition-opacity duration-150", !on && "opacity-60")}>{item.swatch}</span>
      <span className="truncate">{item.label}</span>
      {item.detail != null && <span className="font-bold text-foreground tabular-nums no-underline">{item.detail}</span>}
    </button>
  )
}

/** Legenda em linha, para colocar sob (ou sobre) o gráfico. */
export function ToggleLegend({
  items,
  isVisible,
  onToggle,
  className,
  label = "Séries do gráfico",
}: {
  items: LegendItem[]
  isVisible: (key: string) => boolean
  onToggle: (key: string) => void
  className?: string
  label?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap justify-center gap-x-1 gap-y-0.5", className)}>
      {items.map((i) => (
        <LegendButton key={i.key} item={i} on={isVisible(i.key)} onToggle={onToggle} />
      ))}
    </div>
  )
}

export const Dot = ({ color, square }: { color: string; square?: boolean }) => <span className={cn("size-2.5", square ? "rounded-[3px]" : "rounded-full")} style={{ background: color }} aria-hidden />

export function Line({ color, dash, width = 18 }: { color: string; dash?: string; width?: number }) {
  return (
    <svg width={width} height="8" aria-hidden className="shrink-0">
      <path d={`M1 4 H${width - 1}`} stroke={color} strokeWidth="2" strokeDasharray={dash} strokeLinecap={dash === "1 3" ? "round" : undefined} />
    </svg>
  )
}
