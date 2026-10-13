import {
  ArrowLeftRight,
  ChartColumn,
  Gauge,
  Landmark,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  Tags,
  Target,
  type LucideIcon,
} from "lucide-react"

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Visão geral",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/relatorios", label: "Relatórios", icon: ChartColumn },
      { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
    ],
  },
  {
    group: "Planejamento",
    items: [
      { href: "/limites", label: "Limites", icon: Gauge },
      { href: "/metas", label: "Metas", icon: Target },
      { href: "/reserva", label: "Reserva", icon: ShieldCheck },
    ],
  },
  {
    group: "Configuração",
    items: [
      { href: "/categorias", label: "Categorias", icon: Tags },
      { href: "/regras", label: "Regras", icon: ListChecks },
      { href: "/conexoes", label: "Contas", icon: Landmark },
    ],
  },
]

export const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href))

/** Grupo e item da rota atual, para o breadcrumb. */
export function currentNav(path: string) {
  for (const g of NAV) for (const i of g.items) if (isActive(i.href, path)) return { group: g.group, item: i }
  return undefined
}
