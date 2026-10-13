"use client"

import { Check, Funnel } from "lucide-react"
import Link from "next/link"
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
