"use client"

import { Check, X } from "lucide-react"
import { useRef, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { hexToHsv, hsvToHex, normalizeHex, type HSV } from "@/lib/color"
import { cn } from "@/lib/utils"

// Seletor de cor do próprio design (no lugar do <input type="color">, que abre a janela do sistema operacional):
// paleta pronta + área de saturação/brilho, matiz e campo hexadecimal. Vai em <form> por um input oculto.

export const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
  "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b",
]

/** Área arrastável (mouse, toque e teclado) que informa x e y de 0 a 1. */
function Surface({ className, style, onChange, label, children }: { className?: string; style?: React.CSSProperties; onChange: (x: number, y: number) => void; label: string; children?: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  const move = (e: React.PointerEvent) => {
    const r = el.current!.getBoundingClientRect()
    onChange(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)))
  }
  return (
    <div
      ref={el}
      role="presentation"
      aria-label={label}
      className={cn("relative touch-none rounded-md", className)}
      style={style}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={(e) => e.buttons && move(e)}
    >
      {children}
    </div>
  )
}

const Thumb = ({ x, y, color, label, onKey }: { x: number; y: number; color: string; label: string; onKey: (dx: number, dy: number) => void }) => (
  <span
    role="slider"
    tabIndex={0}
    aria-label={label}
    aria-valuenow={Math.round(x * 100)}
    onKeyDown={(e) => {
      const step = e.shiftKey ? 0.1 : 0.02
      const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key]
      if (d) {
        e.preventDefault()
        onKey(...d)
      }
    }}
    className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)] outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
    style={{ left: `${x * 100}%`, top: `${y * 100}%`, background: color }}
  />
)

type Props = {
  name?: string
  defaultValue?: string | null
  value?: string | null
  onChange?: (hex: string | null) => void
  /** Permite voltar a "sem cor" (valor ""), com este texto no botão */
  clearLabel?: string
  /** Cor mostrada quando não há valor (ex.: a do banco) */
  fallback?: string
  className?: string
  "aria-label"?: string
}

export function ColorPicker({ name, defaultValue, value, onChange, clearLabel, fallback = "#64748b", className, "aria-label": ariaLabel = "Escolher cor" }: Props) {
  const [inner, setInner] = useState<string | null>(normalizeHex(defaultValue ?? "") ?? null)
  const hex = value !== undefined ? (normalizeHex(value ?? "") ?? null) : inner
  const shown = hex ?? fallback
  // Área e campo hexadecimal derivam da cor atual: só guardamos o que o usuário está arrastando/digitando
  const [dragged, setDragged] = useState<HSV | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const hsv = dragged && hsvToHex(dragged) === shown ? dragged : hexToHsv(shown)

  const commit = (next: string | null) => {
    setInner(next)
    onChange?.(next)
  }
  const setHsvAndCommit = (h: HSV) => {
    setDragged(h)
    commit(hsvToHex(h))
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={hex ?? ""} />}
      <Popover>
        <PopoverTrigger
          aria-label={ariaLabel}
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-2 text-sm shadow-xs transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 data-popup-open:border-ring dark:bg-input/30",
            className,
          )}
        >
          <span className="size-5 rounded-md ring-1 ring-foreground/15 ring-inset" style={{ background: shown }} />
          <span className={cn("font-mono text-xs uppercase", !hex && "text-muted-foreground")}>{hex ?? "automática"}</span>
        </PopoverTrigger>
        <PopoverContent className="w-64 gap-3" align="end">
          <div className="grid grid-cols-9 gap-1.5" role="listbox" aria-label="Cores prontas">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={hex === c}
                aria-label={c}
                onClick={() => commit(c)}
                className="grid size-6 place-items-center rounded-full text-white outline-none ring-offset-2 ring-offset-popover focus-visible:ring-2 focus-visible:ring-ring"
                style={{ background: c }}
              >
                {hex === c && <Check className="size-3.5" strokeWidth={3} />}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-2.5 border-t pt-3">
            <span className="text-xs font-medium text-muted-foreground">Personalizada</span>
            <Surface
              label="Saturação e brilho"
              className="h-28"
              style={{ background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${hsv.h} 100% 50%))` }}
              onChange={(x, y) => setHsvAndCommit({ ...hsv, s: x, v: 1 - y })}
            >
              <Thumb x={hsv.s} y={1 - hsv.v} color={shown} label="Saturação e brilho" onKey={(dx, dy) => setHsvAndCommit({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + dx)), v: Math.min(1, Math.max(0, hsv.v - dy)) })} />
            </Surface>
            <Surface
              label="Matiz"
              className="h-3"
              style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}
              onChange={(x) => setHsvAndCommit({ ...hsv, h: Math.min(359.9, x * 360) })}
            >
              <Thumb x={hsv.h / 360} y={0.5} color={`hsl(${hsv.h} 100% 50%)`} label="Matiz" onKey={(dx) => setHsvAndCommit({ ...hsv, h: Math.min(359.9, Math.max(0, hsv.h + dx * 360)) })} />
            </Surface>
            <div className="flex items-center gap-2">
              <span className="size-8 shrink-0 rounded-md ring-1 ring-foreground/15 ring-inset" style={{ background: shown }} />
              <input
                value={draft ?? shown}
                aria-label="Cor em hexadecimal"
                spellCheck={false}
                maxLength={7}
                onChange={(e) => {
                  setDraft(e.target.value)
                  const n = normalizeHex(e.target.value)
                  if (n) commit(n)
                }}
                onBlur={() => setDraft(null)}
                className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 font-mono text-xs uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
              />
            </div>
            {clearLabel && (
              <button
                type="button"
                onClick={() => commit(null)}
                className="flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <X className="size-3.5" />
                {clearLabel}
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
