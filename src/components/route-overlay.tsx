"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useSyncExternalStore } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

// Modais e painéis abertos pela URL (?nova=1, ?tx=12…): o servidor renderiza o conteúdo
// com server actions normais; fechar só navega para `closeHref`.
//
// Rodapé de ações: use <FormActions> (components/bits) como último filho. Ele fica colado ao fim da área rolável,
// com os botões no canto inferior direito.

type Props = { closeHref: string; title: string; description?: React.ReactNode; children: React.ReactNode; className?: string }

export function RouteDialog({ closeHref, title, description, children, className }: Props) {
  const router = useRouter()
  return (
    <Dialog open onOpenChange={(o) => !o && router.push(closeHref, { scroll: false })}>
      <DialogContent className={cn("max-h-[calc(100svh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-lg", className)}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

const MOBILE = "(max-width: 767px)"
const subscribeMobile = (cb: () => void) => {
  const mq = window.matchMedia(MOBILE)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}
/** Celular (PWA): abaixo de 768px o painel lateral sobe de baixo. No servidor vale o painel lateral. */
export function useIsMobile() {
  return useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE).matches, () => false)
}

const CLOSE_AT = 96 // px arrastados para baixo que fecham o painel

/**
 * Painel de detalhe: lateral no computador, bottom sheet no celular (alça, até 90% da tela, arrastar para baixo
 * fecha, respeita a área segura do iPhone).
 */
export function RouteSheet({ closeHref, title, description, children, className }: Props) {
  const router = useRouter()
  const mobile = useIsMobile()
  const close = () => router.push(closeHref, { scroll: false })
  const [dy, setDy] = useState<number | null>(null)
  const start = useRef(0)

  const onDown = (e: React.PointerEvent) => {
    start.current = e.clientY
    setDy(0)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => dy !== null && setDy(Math.max(0, e.clientY - start.current))
  const onUp = () => {
    if (dy !== null && dy > CLOSE_AT) close()
    setDy(null)
  }

  return (
    <Sheet open onOpenChange={(o) => !o && close()}>
      <SheetContent
        side={mobile ? "bottom" : "right"}
        className={cn("w-full gap-0 data-[side=right]:sm:max-w-md data-[side=bottom]:max-h-[90svh] data-[side=bottom]:rounded-t-2xl", className)}
        style={dy ? { transform: `translateY(${dy}px)`, transition: "none" } : undefined}
      >
        {mobile && (
          <div
            data-slot="sheet-handle"
            className="grid shrink-0 touch-none place-items-center pt-2 pb-1"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDy(null)}
          >
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          </div>
        )}
        <SheetHeader className="border-b px-6 py-4 pr-12 md:py-5">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 pt-5 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
