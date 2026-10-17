"use client"

import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

// Modais e painéis abertos pela URL (?nova=1, ?tx=12…): o servidor renderiza o conteúdo
// com server actions normais; fechar só navega para `closeHref`.

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

export function RouteSheet({ closeHref, title, description, children, className }: Props) {
  const router = useRouter()
  return (
    <Sheet open onOpenChange={(o) => !o && router.push(closeHref, { scroll: false })}>
      <SheetContent side="right" className={cn("w-full gap-0 data-[side=right]:sm:max-w-md", className)}>
        <SheetHeader className="border-b px-6 py-5 pr-12">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
