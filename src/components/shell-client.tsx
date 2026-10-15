"use client"

import { ChevronRight, ChevronsUpDown, Eye, EyeOff, House, LogOut, Menu, Moon, Plus, RefreshCw, Sun, Wallet, ArrowLeftRight, ChartColumn } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { currentNav, isActive, NAV } from "./nav-items"

/** Marca: quadrado verde com a carteira. */
export function Logo({ small }: { small?: boolean }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground", small ? "size-7" : "size-8")}>
      <Wallet className={small ? "size-4" : "size-[18px]"} />
    </span>
  )
}

/** Itens da sidebar; `badges` traz contadores (número) ou alertas (cor do ponto) por rota. */
export function SidebarNav({ badges }: { badges: Record<string, number | "warn" | "danger"> }) {
  const path = usePathname()
  return (
    <nav className="flex flex-col gap-1 px-2" aria-label="Principal">
      {NAV.map((g) => (
        <div key={g.group} className="flex flex-col gap-0.5 py-1">
          <span className="flex h-7 items-center px-2 text-xs font-medium text-muted-foreground">{g.group}</span>
          {g.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, path)
            const b = badges[href]
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground transition-colors hover:bg-muted",
                  active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)] hover:bg-sidebar-accent",
                )}
              >
                <Icon className="size-4" />
                {label}
                {typeof b === "number" && b > 0 && <span className="ml-auto text-xs font-medium text-muted-foreground">{b}</span>}
                {b === "warn" && <span className="ml-auto size-2 rounded-full bg-amber-500" aria-label="Precisa de atenção" />}
                {b === "danger" && <span className="ml-auto size-2 rounded-full bg-red-500" aria-label="Com erro" />}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export function UserMenu({ name, email, signOut }: { name: string; email: string; signOut: () => Promise<void> }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="flex w-full items-center gap-2 rounded-lg p-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />
        }
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">{initials}</span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="w-56">
        <form action={signOut}>
          <DropdownMenuItem render={<button type="submit" className="w-full" />}>
            <LogOut />
            Sair
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** "Visão geral › Dashboard" no desktop; logo + nome da página no celular. */
export function Breadcrumb() {
  const nav = currentNav(usePathname())
  return (
    <>
      <nav className="hidden min-w-0 items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground md:flex" aria-label="Trilha">
        <span className="hidden lg:inline">{nav?.group}</span>
        <ChevronRight className="hidden size-3.5 lg:block" />
        <span className="truncate font-medium text-foreground">{nav?.item.label}</span>
      </nav>
      <div className="flex min-w-0 items-center gap-2.5 md:hidden">
        <Logo small />
        <span className="truncate text-base font-semibold">{nav?.item.label ?? "FLTR Financeiro"}</span>
      </div>
    </>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const html = document.documentElement
    const dark = html.classList.contains("dark") || (!html.classList.contains("light") && matchMedia("(prefers-color-scheme: dark)").matches)
    const next = dark ? "light" : "dark"
    html.classList.remove("dark", "light")
    html.classList.add(next)
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`
  }
  return (
    <Button variant="ghost" size="icon" className={className} aria-label="Alternar tema" onClick={toggle}>
      {/* os dois ícones ficam no DOM; o CSS escolhe, sem depender do tema na hidratação */}
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  )
}

/** Esconde os valores com blur (classe .privacy no <html>, ver globals.css); cookie para o SSR já vir escondido. */
export function PrivacyToggle({ className }: { className?: string }) {
  function toggle() {
    const on = document.documentElement.classList.toggle("privacy")
    document.cookie = `privacy=${on ? 1 : 0}; path=/; max-age=31536000; samesite=lax`
  }
  return (
    <Button variant="ghost" size="icon" className={className} aria-label="Mostrar ou esconder valores" title="Mostrar/esconder valores" onClick={toggle}>
      <Eye className="in-[.privacy]:hidden" />
      <EyeOff className="hidden in-[.privacy]:block" />
    </Button>
  )
}

/** Botão de sincronizar: o ícone gira enquanto a server action roda. */
export function SyncButton({ compact }: { compact?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={compact ? "ghost" : "outline"} size={compact ? "icon" : "default"} disabled={pending} aria-label="Sincronizar agora">
      <RefreshCw className={cn(pending && "animate-spin")} />
      {!compact && (pending ? "Sincronizando…" : "Sincronizar")}
    </Button>
  )
}

const MOBILE = [
  { href: "/", label: "Início", icon: House },
  { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
  { href: "/relatorios", label: "Relatórios", icon: ChartColumn },
]

/** Barra inferior do celular; "Mais" abre o restante do menu num painel lateral. */
export function MobileNav({ signOut }: { signOut: () => Promise<void> }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const item = ({ href, label, icon: Icon }: (typeof MOBILE)[number]) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(href, path) ? "page" : undefined}
      className={cn("flex min-w-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground", isActive(href, path) && "text-primary")}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  )
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-background/95 px-1 backdrop-blur md:hidden" aria-label="Navegação principal">
      {item(MOBILE[0])}
      {item(MOBILE[1])}
      <Link href="/transacoes?nova=1" aria-label="Nova transação" className="grid h-11 w-12 shrink-0 place-items-center self-center rounded-xl bg-primary text-primary-foreground">
        <Plus className="size-5" />
      </Link>
      {item(MOBILE[2])}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="flex min-w-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground">
          <Menu className="size-5" />
          Mais
        </SheetTrigger>
        <SheetContent side="right" className="w-72 gap-0 p-0">
          <div className="flex h-14 items-center gap-2.5 border-b px-4">
            <Logo />
            <SheetTitle className="font-semibold">FLTR Financeiro</SheetTitle>
          </div>
          <div className="flex-1 overflow-y-auto py-2" onClick={() => setOpen(false)}>
            <SidebarNav badges={{}} />
          </div>
          <div className="flex items-center gap-2 border-t p-3">
            <ThemeToggle />
            <span className="text-sm text-muted-foreground">Tema</span>
            <form action={signOut} className="ml-auto">
              <Button type="submit" variant="ghost">
                <LogOut />
                Sair
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
