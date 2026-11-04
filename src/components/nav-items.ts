import {
  ArrowLeftRight,
  CalendarDays,
  ChartColumn,
  Gauge,
  HandCoins,
  Landmark,
  LayoutDashboard,
  ListChecks,
  PiggyBank,
  ShieldCheck,
  Tags,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

/** `disabled`: aparece no menu, mas inativo (recurso escondido por enquanto) */
export type NavItem = { href: string; label: string; icon: LucideIcon; disabled?: boolean }

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Visão geral",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/cofy", label: "Cofy", icon: PiggyBank, disabled: true },
      { href: "/relatorios", label: "Relatórios", icon: ChartColumn },
      { href: "/investimentos", label: "Investimentos", icon: TrendingUp },
      { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
      { href: "/calendario", label: "Calendário", icon: CalendarDays },
    ],
  },
  {
    group: "Planejamento",
    items: [
      { href: "/limites", label: "Limites", icon: Gauge },
      { href: "/metas", label: "Metas", icon: Target },
      { href: "/dividas", label: "Dívidas", icon: HandCoins },
      { href: "/reserva", label: "Reserva", icon: ShieldCheck },
    ],
  },
  {
    group: "Configuração",
    items: [
      { href: "/categorias", label: "Categorias", icon: Tags },
      { href: "/regras", label: "Regras", icon: ListChecks },
      { href: "/contas", label: "Contas", icon: Landmark },
    ],
  },
]

/** Rota cujos itens-filhos são as contas do usuário (sidebar). */
export const ACCOUNTS_HREF = "/contas"

export const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href))

/** Grupo e item da rota atual, para o breadcrumb. */
export function currentNav(path: string) {
  for (const g of NAV) for (const i of g.items) if (isActive(i.href, path)) return { group: g.group, item: i }
  return undefined
}
