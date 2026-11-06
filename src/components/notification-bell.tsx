"use client"

import { Bell, BellRing, CalendarClock, CircleAlert, Gauge, Settings, Wallet } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { markAllNotificationsRead, markNotificationRead } from "@/app/(app)/notifications-actions"
import { useSettings } from "@/components/settings-dialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ago } from "@/lib/format"
import { cn } from "@/lib/utils"

export type BellItem = { id: number; kind: "DEBT_DUE" | "DEBT_OVERDUE" | "SALARY" | "LIMIT" | "SYSTEM"; title: string; body: string; href: string | null; createdAt: string; read: boolean }

const KIND = {
  DEBT_OVERDUE: { icon: CircleAlert, cls: "bg-expense/10 text-expense" },
  DEBT_DUE: { icon: CalendarClock, cls: "bg-amber-500/10 text-warning" },
  SALARY: { icon: Wallet, cls: "bg-income/10 text-income" },
  LIMIT: { icon: Gauge, cls: "bg-amber-500/10 text-warning" },
  SYSTEM: { icon: Bell, cls: "bg-muted text-muted-foreground" },
} as const

/** Sino do cabeçalho: contador de não lidos e lista dos avisos recentes (dívidas, salário, limites). */
export function NotificationBell({ items, unread }: { items: BellItem[]; unread: number }) {
  const router = useRouter()
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  const go = (n: BellItem) => {
    setOpen(false)
    start(async () => {
      if (!n.read) await markNotificationRead(n.id)
      if (n.href) router.push(n.href)
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-sm" className="relative max-md:size-9" aria-label={unread ? `Avisos (${unread} novos)` : "Avisos"} title="Avisos" />}
      >
        {unread ? <BellRing /> : <Bell />}
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full border-2 border-background bg-expense px-0.5 text-[10px] leading-3 font-extrabold text-white tabular-nums">{unread > 9 ? "9+" : unread}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 p-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="flex-1 text-sm font-semibold">Avisos</h2>
          {unread > 0 && (
            <Button variant="ghost" size="xs" disabled={pending} onClick={() => start(async () => void (await markAllNotificationsRead()))}>
              Marcar todos como lidos
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Configurar avisos"
            title="Configurar avisos e push"
            onClick={() => {
              setOpen(false)
              settings.open("notifications")
            }}
          >
            <Settings />
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum aviso por enquanto. Quando uma dívida estiver perto de vencer, ela aparece aqui.</p>
        ) : (
          <ul className="max-h-[26rem] divide-y overflow-y-auto">
            {items.map((n) => {
              const k = KIND[n.kind]
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => go(n)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50", !n.read && "bg-primary/[0.04]")}>
                    <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", k.cls)}>
                      <k.icon className="size-4" />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className={cn("text-sm", !n.read && "font-semibold", n.title.includes("R$") && "sensitive")}>{n.title}</span>
                      <span className={cn("text-xs text-muted-foreground", n.body.includes("R$") && "sensitive")}>{n.body}</span>
                      <span className="text-[11px] text-muted-foreground/80">{ago(new Date(n.createdAt))}</span>
                    </span>
                    {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Não lido" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          <Link href="/dividas" onClick={() => setOpen(false)} className="font-medium text-primary hover:underline">
            Ver dívidas
          </Link>
          {" · "}
          <Link href="/calendario" onClick={() => setOpen(false)} className="font-medium text-primary hover:underline">
            Calendário
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
