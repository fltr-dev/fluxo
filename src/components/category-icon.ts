import {
  Briefcase,
  Car,
  CirclePlus,
  Ellipsis,
  GraduationCap,
  HeartPulse,
  House,
  Receipt,
  Repeat,
  ShoppingBag,
  Tag,
  Ticket,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from "lucide-react"

// ponytail: o schema não guarda ícone por categoria; usa o nome das categorias padrão e cai em Tag para as demais
const BY_NAME: Record<string, LucideIcon> = {
  moradia: House,
  "alimentação": Utensils,
  transporte: Car,
  "saúde": HeartPulse,
  lazer: Ticket,
  "educação": GraduationCap,
  compras: ShoppingBag,
  assinaturas: Repeat,
  "impostos e taxas": Receipt,
  outros: Ellipsis,
  "salário": Briefcase,
  rendimentos: TrendingUp,
  "outras receitas": CirclePlus,
}

export const categoryIcon = (name?: string | null): LucideIcon => BY_NAME[name?.trim().toLowerCase() ?? ""] ?? Tag
