"use client"

import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { cn } from "@/lib/utils"

const TRIGGER = 72 // distância (já amortecida) que dispara a atualização
const MAX = 110

/** Celular: puxar a tela para baixo estando no topo recarrega os dados da tela (router.refresh). */
export function PullToRefresh() {
  const router = useRouter()
  const [pull, setPull] = useState(0)
  const [pending, start] = useTransition()
  const g = useRef({ x0: 0, y0: 0, on: false, dir: "" as "" | "v" | "h", dist: 0 })

  useEffect(() => {
    const mobile = matchMedia("(max-width: 767px)")
    const set = (v: number) => {
      g.current.dist = v
      setPull(v)
    }
    const down = (e: TouchEvent) => {
      const s = g.current
      // só no topo, com um dedo, e sem painel, modal ou menu aberto por cima
      s.on = mobile.matches && scrollY <= 0 && e.touches.length === 1 && !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')
      s.dir = ""
      s.x0 = e.touches[0].clientX
      s.y0 = e.touches[0].clientY
    }
    const move = (e: TouchEvent) => {
      const s = g.current
      if (!s.on) return
      const dx = e.touches[0].clientX - s.x0
      const dy = e.touches[0].clientY - s.y0
      if (!s.dir) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        s.dir = Math.abs(dy) > Math.abs(dx) && dy > 0 ? "v" : "h"
      }
      if (s.dir !== "v" || scrollY > 0) return set(0)
      set(Math.min(MAX, Math.max(0, dy) * 0.5))
    }
    const up = () => {
      const s = g.current
      if (!s.on) return
      s.on = false
      if (s.dist >= TRIGGER) {
        navigator.vibrate?.(10)
        start(() => router.refresh())
      }
      set(0)
    }
    addEventListener("touchstart", down, { passive: true })
    addEventListener("touchmove", move, { passive: true })
    addEventListener("touchend", up)
    addEventListener("touchcancel", up)
    return () => {
      removeEventListener("touchstart", down)
      removeEventListener("touchmove", move)
      removeEventListener("touchend", up)
      removeEventListener("touchcancel", up)
    }
  }, [router])

  const y = pending ? TRIGGER * 0.75 : pull
  const ready = pull >= TRIGGER
  if (!y && !pending) return null
  return (
    <div
      aria-hidden={!pending}
      role={pending ? "status" : undefined}
      aria-label={pending ? "Atualizando" : undefined}
      className={cn(
        "pointer-events-none fixed top-14 left-1/2 z-20 grid size-10 place-items-center rounded-full border bg-card shadow-[0_6px_16px_-6px_rgb(0_0_0/.25)] md:hidden",
        !pull && "transition-transform duration-200 ease-out",
      )}
      style={{ transform: `translate(-50%, ${y - 40}px)`, opacity: pending ? 1 : Math.min(1, pull / (TRIGGER * 0.6)) }}
    >
      <RefreshCw
        className={cn("size-5 transition-colors", ready || pending ? "text-primary" : "text-muted-foreground", pending && "animate-spin motion-reduce:animate-none")}
        style={pending ? undefined : { transform: `rotate(${(pull / TRIGGER) * 270}deg)` }}
      />
    </div>
  )
}
