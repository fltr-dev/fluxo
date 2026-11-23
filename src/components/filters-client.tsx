"use client"

import { Check, Funnel } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

/** Menu cujas opções são links (ex.: período, que vive na URL). */
export function MenuLinks({ label, items }: { label: React.ReactNode; items: { label: string; href: string; active?: boolean }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>{label}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        {items.map((i) => (
          <DropdownMenuItem key={i.href} render={<Link href={i.href} />}>
            {i.label}
            {i.active && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Busca por descrição que atualiza a URL enquanto se digita (pausa de 300 ms); Enter busca na hora. */
export function SearchInput({ defaultValue, className, ...props }: React.ComponentProps<"input">) {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const timer = useRef<number>(undefined)
  const go = (q: string) => {
    window.clearTimeout(timer.current)
    const p = new URLSearchParams(sp.toString())
    for (const k of ["q", "pagina", "tx", "nova"]) p.delete(k)
    if (q.trim()) p.set("q", q.trim())
    const s = p.toString()
    router.replace(s ? `${path}?${s}` : path, { scroll: false })
  }
  return (
    <input
      {...props}
      type="search"
      defaultValue={defaultValue}
      onChange={(e) => {
        const q = e.target.value
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => go(q), 300)
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return
        e.preventDefault()
        go(e.currentTarget.value)
      }}
      className={className}
    />
  )
}

export function FilterSheet({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>
        <Funnel />
        Filtros
        {count > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{count}</span>}
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-sm">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="text-lg font-semibold">Filtros</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
