"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const links = [
  ["/", "Dashboard"],
  ["/transacoes", "Transações"],
  ["/categorias", "Categorias"],
  ["/regras", "Regras"],
  ["/limites", "Limites"],
  ["/metas", "Metas"],
  ["/reserva", "Reserva"],
  ["/conexoes", "Contas"],
] as const

export function Nav() {
  const path = usePathname()
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 text-sm" aria-label="Principal">
      {links.map(([href, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
