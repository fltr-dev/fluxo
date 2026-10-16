"use client"

import { Archive, ArrowLeftRight, Check, ChevronRight, Eye, EyeOff, ListChecks, Pencil, Plus, Search, Tag, Trash2, X, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

// Gestos de lista: arrastar a linha para o lado revela botões (no toque); pressionar e segurar,
// ou o clique direito no computador, abre o painel com todas as ações do item.

const ICONS = { archive: Archive, check: Check, details: ChevronRight, edit: Pencil, eye: Eye, eyeOff: EyeOff, plus: Plus, rule: ListChecks, list: Search, tag: Tag, transfer: ArrowLeftRight, trash: Trash2, x: X } satisfies Record<string, LucideIcon>

export type RowAction = {
  label: string
  icon: keyof typeof ICONS
  tone?: "primary" | "neutral" | "warning" | "danger"
  /** Navega (os painéis e modais do app abrem pela URL). */
  href?: string
  /** Server action que recebe só o `id`. */
  run?: (form: FormData) => Promise<void>
  id?: number
  /** Pede um segundo toque em até 3 s; é o texto do botão nesse meio tempo. */
  confirm?: string
  /** Abre o painel do item (ex.: para escolher a categoria). */
  sheet?: boolean
}

type SheetProps = {
  title: string
  description?: string
  menu: RowAction[]
  /** Conteúdo extra no topo do painel; `run` executa com o mesmo tratamento de erro das ações. */
  extra?: (ctx: { close: () => void; run: (fn: () => Promise<unknown>) => void }) => ReactNode
}

const TONE = {
  primary: "bg-primary text-primary-foreground",
  neutral: "bg-zinc-500 text-white dark:bg-zinc-600",
  warning: "bg-amber-400 text-amber-950",
  danger: "bg-destructive text-white",
}
const BTN = 76 // largura de cada botão revelado
const LONG_PRESS = 450
let closeOpenRow: (() => void) | null = null // só uma linha aberta por vez

// Em produção o Next.js esconde a mensagem das server actions; só as conhecidas passam
const message = (e: unknown) => {
  const m = e instanceof Error ? e.message : ""
  return /somente leitura|não autorizado/i.test(m) ? m : "Não deu para concluir. Tente de novo."
}

function useRowActions({ title, description, menu, extra }: SheetProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<"bottom" | "right">("bottom")
  const [error, setError] = useState("")
  const [confirming, setConfirming] = useState("")
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(""), 3000)
    return () => clearTimeout(t)
  }, [confirming])

  const show = () => {
    setSide(matchMedia("(min-width: 768px)").matches ? "right" : "bottom")
    setError("")
    setConfirming("")
    setOpen(true)
  }
  const close = () => setOpen(false)
  const run = (fn: () => Promise<unknown>, done?: () => void) =>
    start(async () => {
      try {
        await fn()
        setOpen(false)
        done?.()
      } catch (e) {
        show()
        setError(message(e))
      }
    })

  /** `done` roda quando a ação termina (fecha a linha arrastada). */
  const exec = (a: RowAction, done?: () => void) => {
    if (a.sheet) return show()
    if (a.confirm && confirming !== a.label) return setConfirming(a.label)
    if (a.href) {
      router.push(a.href, { scroll: false })
      close()
      done?.()
    } else if (a.run) {
      const f = new FormData()
      if (a.id != null) f.set("id", String(a.id))
      run(() => a.run!(f), done)
    }
  }

  const sheet = (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side={side} className={cn("gap-0", side === "bottom" ? "max-h-[85dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]" : "w-full data-[side=right]:sm:max-w-sm")}>
        {side === "bottom" && <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />}
        <SheetHeader className="border-b px-5 pt-3 pb-3 pr-12">
          <SheetTitle className="truncate text-base font-semibold">{title}</SheetTitle>
          {description && <SheetDescription className="tabular-nums">{description}</SheetDescription>}
        </SheetHeader>
        <div className="grid gap-3 overflow-y-auto p-3">
          {extra && <div className="px-2 pt-1">{extra({ close, run: (fn) => run(fn) })}</div>}
          {error && (
            <p role="alert" className="mx-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="grid">
            {menu.map((a) => {
              const Icon = ICONS[a.icon]
              const asking = confirming === a.label
              const cls = cn(
                "flex h-12 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50",
                (a.tone === "danger" || asking) && "text-destructive",
              )
              const body = (
                <>
                  <Icon className="size-5 shrink-0 opacity-80" />
                  {asking ? a.confirm : a.label}
                </>
              )
              return a.href ? (
                <Link key={a.label} href={a.href} scroll={false} onClick={close} className={cls}>
                  {body}
                </Link>
              ) : (
                <button key={a.label} type="button" disabled={pending} onClick={() => exec(a)} className={cls}>
                  {body}
                </button>
              )
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )

  return { show, exec, sheet, confirming, pending }
}

/** Item de lista com ações: `left` aparece ao arrastar para a direita, `right` ao arrastar para a esquerda.
 *  O índice 0 de cada lado fica na borda e é executado ao arrastar até o fim (se não pedir confirmação). */
export function SwipeRow({ left = [], right = [], className, children, ...sheetProps }: SheetProps & { left?: RowAction[]; right?: RowAction[]; className?: string; children: ReactNode }) {
  const { show, exec, sheet, confirming, pending } = useRowActions(sheetProps)
  const root = useRef<HTMLDivElement>(null)
  const [x, setX] = useState(0)
  const [drag, setDrag] = useState(false)
  const g = useRef({ x0: 0, y0: 0, base: 0, w: 0, cur: 0, mode: "" as "" | "h" | "v", pressed: false, timer: undefined as ReturnType<typeof setTimeout> | undefined })
  const leftW = left.length * BTN
  const rightW = right.length * BTN
  const swipe = left.length + right.length > 0

  const move = (v: number) => {
    g.current.cur = v
    setX(v)
  }
  const close = useCallback(() => {
    g.current.cur = 0
    setX(0)
  }, [])
  const settle = (v: number) => {
    move(v)
    if (v !== 0) {
      if (closeOpenRow !== close) closeOpenRow?.()
      closeOpenRow = close
    } else if (closeOpenRow === close) closeOpenRow = null
  }

  // Aberta: tocar fora fecha
  useEffect(() => {
    if (x === 0 || drag) return
    const out = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close()
    document.addEventListener("pointerdown", out, true)
    return () => document.removeEventListener("pointerdown", out, true)
  }, [x, drag, close])
  useEffect(() => () => {
    clearTimeout(g.current.timer)
    if (closeOpenRow === close) closeOpenRow = null
  }, [close])

  const longPress = () => {
    const s = g.current
    if (s.pressed) return
    s.pressed = true
    clearTimeout(s.timer)
    navigator.vibrate?.(10)
    show()
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = g.current
    s.mode = ""
    s.pressed = false
    if (e.pointerType === "mouse") return
    Object.assign(s, { x0: e.clientX, y0: e.clientY, base: s.cur, w: e.currentTarget.offsetWidth })
    clearTimeout(s.timer)
    s.timer = setTimeout(() => s.mode === "" && longPress(), LONG_PRESS)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = g.current
    if (e.pointerType === "mouse" || s.pressed) return
    const dx = e.clientX - s.x0
    const dy = e.clientY - s.y0
    if (s.mode === "") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      clearTimeout(s.timer)
      s.mode = swipe && Math.abs(dx) > Math.abs(dy) ? "h" : "v"
      if (s.mode === "h") {
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {} // ponteiro já liberado: segue sem captura
        setDrag(true)
      }
    }
    if (s.mode === "h") move(Math.max(rightW ? -s.w : 0, Math.min(leftW ? s.w : 0, s.base + dx)))
  }

  const onPointerUp = () => {
    const s = g.current
    clearTimeout(s.timer)
    if (s.mode !== "h") return
    setDrag(false)
    const v = s.cur
    const edge = v > 0 ? left[0] : right[0]
    if (edge && !edge.confirm && Math.abs(v) > s.w * 0.6) {
      settle(0)
      exec(edge)
      return
    }
    settle(v > leftW / 2 ? leftW : v < -rightW / 2 ? -rightW : 0)
  }

  // Depois de arrastar ou pressionar, o clique não abre o item; com a linha aberta, tocar só fecha
  const onClickCapture = (e: React.MouseEvent) => {
    const s = g.current
    if (s.mode === "h" || s.pressed || s.cur !== 0) {
      e.preventDefault()
      e.stopPropagation()
      if (s.mode !== "h" && !s.pressed) settle(0)
    }
  }

  const button = (a: RowAction, i: number) => {
    const Icon = ICONS[a.icon]
    return (
      <button
        key={a.label}
        type="button"
        disabled={pending}
        onClick={() => {
          // Fecha a linha, menos no primeiro toque de uma ação que pede confirmação
          if (!a.confirm || confirming === a.label) settle(0)
          exec(a)
        }}
        className={cn("flex h-full min-w-[76px] flex-col items-center justify-center gap-1 px-2 text-center text-xs leading-tight font-medium disabled:opacity-70", TONE[a.tone ?? "neutral"], i === 0 && "flex-1")}
      >
        <Icon className="size-5" />
        {confirming === a.label ? a.confirm : a.label}
      </button>
    )
  }

  return (
    <div ref={root} className={cn("relative overflow-hidden", className)}>
      {x > 0 && <div className="absolute inset-y-0 left-0 flex" style={{ width: Math.max(x, leftW) }}>{left.map(button)}</div>}
      {x < 0 && <div className="absolute inset-y-0 right-0 flex flex-row-reverse" style={{ width: Math.max(-x, rightW) }}>{right.map(button)}</div>}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onContextMenu={(e) => {
          e.preventDefault()
          longPress()
        }}
        style={x ? { transform: `translateX(${x}px)` } : undefined}
        className={cn("relative h-full bg-card select-none [-webkit-touch-callout:none]", swipe && "touch-pan-y", !drag && "transition-transform duration-200 ease-out motion-reduce:transition-none")}
      >
        {children}
      </div>
      {sheet}
    </div>
  )
}

/** Linha de tabela (desktop): só o painel, aberto pelo clique direito ou pela tecla de menu. */
export function ContextRow({ className, children, ...sheetProps }: SheetProps & { className?: string; children: ReactNode }) {
  const { show, sheet } = useRowActions(sheetProps)
  return (
    <tr
      className={className}
      onContextMenu={(e) => {
        e.preventDefault()
        show()
      }}
    >
      {children}
      {sheet}
    </tr>
  )
}
