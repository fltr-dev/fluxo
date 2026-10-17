"use client"

import { Maximize2, PenSquare, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CofyAvatar } from "@/components/cofy-mascot"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChatView, useScreenContext } from "./chat-view"
import { useCofy } from "./store"

const STORE = "cofy-panel-conv"
const read = () => {
  try {
    return sessionStorage.getItem(STORE)
  } catch {
    return null
  }
}
const write = (v: string | null) => {
  try {
    if (v) sessionStorage.setItem(STORE, v)
    else sessionStorage.removeItem(STORE)
  } catch {}
}

/** Botão flutuante "Perguntar ao Cofy" (Ctrl K) com o chat num painel, em qualquer tela do app (no celular o Cofy está na barra de baixo). */
export function CofyFloating({ userName, demo }: { userName: string; demo: boolean }) {
  const path = usePathname()
  const { newKey, open, conv } = useCofy()
  const screen = useScreenContext()
  const [shown, setShown] = useState(false)
  const [key, setKey] = useState<string | null>(null)

  const toggle = (v?: boolean) =>
    setShown((s) => {
      const next = v ?? !s
      if (next) setKey((k) => k ?? read() ?? newKey())
      return next
    })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        toggle()
      } else if (e.key === "Escape") setShown(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (key && /^\d+$/.test(key)) open(Number(key))
  }, [key, open])

  if (path.startsWith("/cofy")) return null
  const c = key ? conv(key) : undefined
  const id = c?.id ?? (key && /^\d+$/.test(key) ? Number(key) : null)

  return (
    <>
      {shown && key && (
        <section role="dialog" aria-label="Cofy" className="fixed right-6 bottom-24 z-40 hidden h-[min(37.5rem,calc(100svh-8rem))] w-[25rem] flex-col overflow-hidden rounded-2xl border bg-popover shadow-2xl animate-in fade-in-0 slide-in-from-bottom-3 duration-200 md:flex">
          <header className="flex items-center gap-2.5 border-b px-3.5 py-2.5">
            <CofyAvatar size={32} />
            <div className="grid min-w-0 flex-1 leading-tight">
              <b className="text-sm">Cofy</b>
              <span className="truncate text-xs text-muted-foreground">Vendo agora: {screen.label}</span>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Nova conversa" title="Nova conversa" onClick={() => (write(null), setKey(newKey()))}><PenSquare /></Button>
            {id && <Link href={`/cofy?c=${id}`} aria-label="Abrir em tela cheia" title="Abrir em tela cheia" className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Maximize2 className="size-4" /></Link>}
            <Button variant="ghost" size="icon-sm" aria-label="Fechar" onClick={() => setShown(false)}><X /></Button>
          </header>
          <ChatView key={key} convKey={key} userName={userName} demo={demo} compact onConv={(cid) => (write(String(cid)), setKey(String(cid)))} />
        </section>
      )}
      <button
        type="button"
        onClick={() => toggle()}
        aria-expanded={shown}
        className={cn("fixed right-6 bottom-6 z-40 hidden h-[52px] items-center gap-2.5 rounded-full bg-foreground py-0 pr-4 pl-1.5 text-sm font-bold text-background shadow-[0_12px_32px_-8px_rgba(0,0,0,.45)] transition-transform duration-150 outline-none hover:scale-[1.03] focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-[.97] md:flex")}
      >
        <CofyAvatar size={40} />
        <span>Perguntar ao Cofy</span>
        <kbd className="rounded-md bg-background/15 px-1.5 py-0.5 text-[11px] font-semibold">Ctrl K</kbd>
      </button>
    </>
  )
}
