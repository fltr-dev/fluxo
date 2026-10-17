"use client"

import { ChevronRight, Eye, EyeOff, House, LogOut, Menu, Moon, PiggyBank, Plus, RefreshCw, Settings, Sun, ArrowLeftRight } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import { Logo } from "@/components/logo"
import { useSettings } from "@/components/settings-dialog"
import { NavList, type Badges, type SidebarAccount } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { setCookie } from "@/lib/cookies-client"
import { isDark, applyTheme } from "@/lib/theme-client"
import { cn } from "@/lib/utils"
import { ACCOUNTS_HREF, currentNav, isActive } from "./nav-items"

/** "Visão geral › Dashboard" no desktop; logo + nome da página no celular. */
export function Breadcrumb({ accounts }: { accounts: { id: number; name: string }[] }) {
  const path = usePathname()
  const nav = currentNav(path)
  // /contas/12 → "Configuração › Contas › Nome da conta"
  const account = path.startsWith(`${ACCOUNTS_HREF}/`) ? accounts.find((a) => `${ACCOUNTS_HREF}/${a.id}` === path) : undefined
  return (
    <>
      <nav className="hidden min-w-0 items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground md:flex" aria-label="Trilha">
        <span className="hidden lg:inline">{nav?.group}</span>
        <ChevronRight className="hidden size-3.5 lg:block" />
        {account ? (
          <>
            <Link href={ACCOUNTS_HREF} className="hover:text-foreground">{nav?.item.label}</Link>
            <ChevronRight className="size-3.5" />
            <span className="truncate font-medium text-foreground">{account.name}</span>
          </>
        ) : (
          <span className="truncate font-medium text-foreground">{nav?.item.label}</span>
        )}
      </nav>
      <div className="flex min-w-0 items-center gap-2.5 md:hidden">
        <Logo small />
        <span className="truncate text-base font-semibold">{account?.name ?? nav?.item.label ?? "fluxo"}</span>
      </div>
    </>
  )
}

/** Alterna claro ↔ escuro na barra do topo (as outras opções, como "Cinza" e "Sistema", ficam em Configurações). */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <Button variant="ghost" size="icon-sm" className={cn("max-md:size-9", className)} aria-label="Alternar tema" onClick={() => applyTheme(isDark() ? "light" : "dark")}>
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
    setCookie("privacy", on ? "1" : "0")
  }
  return (
    <Button variant="ghost" size="icon-sm" className={cn("max-md:size-9", className)} aria-label="Mostrar ou esconder valores" title="Mostrar/esconder valores" onClick={toggle}>
      <Eye className="in-[.privacy]:hidden" />
      <EyeOff className="hidden in-[.privacy]:block" />
    </Button>
  )
}

/** Botão de sincronizar: o ícone gira enquanto a server action roda. */
export function SyncButton({ compact }: { compact?: boolean }) {
  const { pending } = useFormStatus()
  // a onda do logo fica em loop enquanto a sincronização roda (CSS lê o atributo no <html>)
  useEffect(() => {
    const root = document.documentElement
    if (pending) root.dataset.syncing = "1"
    else delete root.dataset.syncing
    return () => void delete root.dataset.syncing
  }, [pending])
  return (
    <Button type="submit" variant={compact ? "ghost" : "outline"} size={compact ? "icon-sm" : "sm"} className={cn(compact && "max-md:size-9")} disabled={pending} aria-label="Sincronizar agora">
      <RefreshCw className={cn(pending && "animate-spin")} />
      {!compact && (pending ? "Sincronizando…" : "Sincronizar")}
    </Button>
  )
}

const MOBILE = [
  { href: "/", label: "Início", icon: House },
  { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
  { href: "/cofy", label: "Cofy", icon: PiggyBank },
]

/** Barra inferior do celular; "Mais" abre o restante do menu (com as contas) num painel lateral. */
export function MobileNav({ signOut, badges, accounts, accountsOpen: initialOpen, appName, version }: { signOut: () => Promise<void>; badges: Badges; accounts: SidebarAccount[]; accountsOpen: boolean; appName: string; version: string }) {
  const path = usePathname()
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const [accountsOpen, setAccountsOpen] = useState(initialOpen)
  const toggleAccounts = useCallback((v: boolean) => {
    setAccountsOpen(v)
    setCookie("sidebar-accounts", v ? "open" : "closed")
  }, [])
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
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Navegação principal">
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
            <SheetTitle className="text-[17px] font-extrabold tracking-[-0.03em]">{appName}</SheetTitle>
          </div>
          {/* fechar ao escolher uma tela; o botão de recolher as contas não deve fechar o painel */}
          <div className="flex-1 overflow-y-auto py-2" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
            <NavList badges={badges} accounts={accounts} accountsOpen={accountsOpen} onAccountsOpenChange={toggleAccounts} />
          </div>
          <div className="grid gap-1 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button
                variant="ghost"
                className="flex-1 justify-start"
                onClick={() => {
                  setOpen(false)
                  settings.open()
                }}
              >
                <Settings />
                Configurações
              </Button>
              <form action={signOut}>
                <Button type="submit" variant="destructive">
                  <LogOut />
                  Sair
                </Button>
              </form>
            </div>
            <p className="px-2 text-xs text-muted-foreground tabular-nums">{appName} · v{version}</p>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
