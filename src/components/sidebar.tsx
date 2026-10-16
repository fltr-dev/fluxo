"use client"

import { ChevronDown, ChevronsUpDown, LogOut, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { AccountAvatar } from "@/components/account-avatar"
import { Logo } from "@/components/logo"
import { useSettings } from "@/components/settings-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { AccountLook } from "@/lib/banks"
import { setCookie } from "@/lib/cookies-client"
import { cn } from "@/lib/utils"
import { ACCOUNTS_HREF, isActive, NAV } from "./nav-items"

export type SidebarAccount = { id: number; name: string; look: AccountLook }
export type Badges = Record<string, number | "warn" | "danger">

/** Dica ao lado do ícone, só com a sidebar recolhida (aberta, o rótulo já está visível). */
function Tip({ label, show, children }: { label: string; show: boolean; children: React.ReactElement }) {
  if (!show) return children
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

const itemClass = "relative flex h-9 items-center gap-2.5 overflow-hidden rounded-md px-3 text-sm whitespace-nowrap text-sidebar-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring/50"
const activeClass = "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent"

function BadgeMark({ value, collapsed }: { value?: number | "warn" | "danger"; collapsed: boolean }) {
  if (!value) return null
  if (typeof value === "number")
    return collapsed ? (
      <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" aria-label={`${value} pendentes`} />
    ) : (
      <span className="ml-auto text-xs font-medium text-muted-foreground">{value}</span>
    )
  const color = value === "warn" ? "bg-amber-500" : "bg-red-500"
  return <span className={cn("size-2 rounded-full", color, collapsed ? "absolute top-1.5 right-1.5" : "ml-auto")} aria-label={value === "warn" ? "Precisa de atenção" : "Com erro"} />
}

/** Itens do menu; "Contas" leva as contas do usuário como subitens (recolhíveis). */
export function NavList({
  badges,
  accounts,
  collapsed = false,
  accountsOpen,
  onAccountsOpenChange,
}: {
  badges: Badges
  accounts: SidebarAccount[]
  collapsed?: boolean
  accountsOpen: boolean
  onAccountsOpenChange: (open: boolean) => void
}) {
  const path = usePathname()
  // Entrar numa conta (link, histórico do navegador) abre a lista para mostrar onde você está
  useEffect(() => {
    if (path.startsWith(`${ACCOUNTS_HREF}/`)) onAccountsOpenChange(true)
  }, [path, onAccountsOpenChange])

  return (
    <nav className={cn("flex flex-col gap-1 px-2", collapsed && "items-stretch")} aria-label="Principal">
      {NAV.map((g, gi) => (
        <div key={g.group} className="flex flex-col gap-0.5 py-1">
          {collapsed ? (
            gi > 0 && <span className="mx-3 mb-1.5 h-px bg-sidebar-border" aria-hidden />
          ) : (
            <span className="flex h-7 items-center px-3 text-xs font-medium text-muted-foreground">{g.group}</span>
          )}
          {g.items.map(({ href, label, icon: Icon }) => {
            const hasAccounts = href === ACCOUNTS_HREF
            // "Contas" só fica ativo no resumo; dentro de uma conta o destaque vai para ela
            const active = hasAccounts ? path === href : isActive(href, path)
            const link = (
              <Link href={href} aria-current={active ? "page" : undefined} className={cn(itemClass, hasAccounts && accounts.length > 0 && !collapsed && "pr-9", active && activeClass)}>
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
                <BadgeMark value={badges[href]} collapsed={collapsed} />
              </Link>
            )
            return (
              <div key={href}>
                <div className="relative">
                  <Tip label={label} show={collapsed}>
                    {link}
                  </Tip>
                  {hasAccounts && accounts.length > 0 && !collapsed && (
                    <button
                      type="button"
                      aria-expanded={accountsOpen}
                      aria-label={accountsOpen ? "Recolher contas" : "Expandir contas"}
                      onClick={() => onAccountsOpenChange(!accountsOpen)}
                      className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground outline-none hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50"
                    >
                      <ChevronDown className={cn("size-4 transition-transform", !accountsOpen && "-rotate-90")} />
                    </button>
                  )}
                </div>
                {hasAccounts && accountsOpen && accounts.length > 0 && (
                  <ul className={cn("grid gap-0.5", collapsed ? "mt-1 justify-items-center" : "mt-0.5 ml-5 border-l border-sidebar-border pl-2")} aria-label="Contas">
                    {accounts.map((a) => {
                      const on = path === `${ACCOUNTS_HREF}/${a.id}`
                      return (
                        <li key={a.id} className={cn(!collapsed && "min-w-0")}>
                          <Tip label={a.name} show={collapsed}>
                            <Link
                              href={`${ACCOUNTS_HREF}/${a.id}`}
                              aria-current={on ? "page" : undefined}
                              aria-label={a.name}
                              className={cn(
                                "flex items-center gap-2.5 rounded-md text-[0.8125rem] text-sidebar-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
                                collapsed ? "size-9 justify-center" : "h-8 px-2",
                                on && activeClass,
                              )}
                            >
                              <AccountAvatar look={a.look} size={collapsed ? 24 : 20} />
                              {!collapsed && <span className="truncate">{a.name}</span>}
                            </Link>
                          </Tip>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export function UserMenu({ name, email, signOut, collapsed }: { name: string; email: string; signOut: () => Promise<void>; collapsed?: boolean }) {
  const settings = useSettings()
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"
  return (
    <DropdownMenu>
      <Tip label={name} show={!!collapsed}>
        <DropdownMenuTrigger
          render={<button className="flex w-full items-center gap-2.5 overflow-hidden rounded-lg p-1 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">{initials}</span>
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
          </span>
          <ChevronsUpDown className="mr-1 size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} className="w-56">
        <DropdownMenuItem onClick={() => settings.open()}>
          <Settings />
          Configurações
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem variant="destructive" nativeButton render={<button type="submit" className="w-full" />}>
            <LogOut />
            Sair
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type SidebarProps = {
  badges: Badges
  accounts: SidebarAccount[]
  user: { name: string; email: string }
  version: string
  appName: string
  collapsed: boolean
  accountsOpen: boolean
  signOut: () => Promise<void>
}

/** Sidebar do desktop: abre (16rem) ou recolhe só com ícones e dicas (3.5rem); a escolha fica num cookie. */
export function Sidebar({ badges, accounts, user, version, appName, collapsed: initialCollapsed, accountsOpen: initialOpen, signOut }: SidebarProps) {
  const settings = useSettings()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [open, setOpen] = useState(initialOpen)

  const toggle = useCallback(() => {
    const next = !collapsed
    setCollapsed(next)
    // o atributo no <html> dá a largura (--sidebar-w) ao resto da página, inclusive à barra de ações em lote
    document.documentElement.dataset.sidebar = next ? "collapsed" : "expanded"
    setCookie("sidebar", next ? "collapsed" : "expanded")
  }, [collapsed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle])

  const setAccountsOpen = useCallback((v: boolean) => {
    setOpen(v)
    setCookie("sidebar-accounts", v ? "open" : "closed")
  }, [])

  const toggleLabel = collapsed ? "Expandir menu (Ctrl+B)" : "Recolher menu (Ctrl+B)"
  return (
    <TooltipProvider delay={150}>
      <aside
        data-collapsed={collapsed}
        className="sticky top-0 hidden h-svh w-(--sidebar-w) shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex"
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 overflow-hidden px-2.5">
          <Tip label={toggleLabel} show={collapsed}>
            <button type="button" onClick={toggle} aria-label={toggleLabel} aria-expanded={!collapsed} className="group/logo relative grid size-9 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50">
              <Logo className={cn(collapsed && "group-hover/logo:opacity-0")} />
              {collapsed && <PanelLeftOpen className="absolute size-4 opacity-0 group-hover/logo:opacity-100" />}
            </button>
          </Tip>
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-[17px] font-extrabold tracking-[-0.03em]">{appName}</span>
            <span className="truncate text-xs text-muted-foreground">Controle pessoal</span>
          </div>
          {!collapsed && (
            <button type="button" onClick={toggle} aria-label={toggleLabel} title={toggleLabel} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50">
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <NavList badges={badges} accounts={accounts} collapsed={collapsed} accountsOpen={open} onAccountsOpenChange={setAccountsOpen} />
        </div>

        <div className="grid gap-1 border-t border-sidebar-border p-2">
          <UserMenu name={user.name} email={user.email} signOut={signOut} collapsed={collapsed} />
          <Tip label={`${appName} · versão ${version}`} show={collapsed}>
            <button
              type="button"
              onClick={() => settings.open("about")}
              className={cn("flex items-center justify-center gap-1 rounded-md py-1 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50", !collapsed && "justify-start px-1")}
            >
              {!collapsed && <span className="truncate">{appName}</span>}
              <span className="tabular-nums">v{version}</span>
            </button>
          </Tip>
        </div>
      </aside>
    </TooltipProvider>
  )
}
