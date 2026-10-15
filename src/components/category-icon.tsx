import {
  Briefcase,
  Car,
  CirclePlus,
  Ellipsis,
  GraduationCap,
  HeartPulse,
  House,
  icons,
  Receipt,
  Repeat,
  ShoppingBag,
  Tag,
  Ticket,
  TrendingUp,
  Utensils,
  type LucideIcon,
  type LucideProps,
} from "lucide-react"
import { createElement } from "react"

// Categorias criadas antes do seletor de ícone não têm `icon` no banco: caem aqui, pelo nome das categorias padrão
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

/** Só o servidor resolve nomes → componentes (o mapa completo do Lucide não vai para o bundle do cliente). */
export const lucideByName = (name?: string | null): LucideIcon | undefined => (name ? (icons as Record<string, LucideIcon>)[name] : undefined)

/** Ícone da categoria: o escolhido (`icon`), senão o da categoria padrão de mesmo nome, senão uma etiqueta. */
export const categoryIcon = (name?: string | null, icon?: string | null): LucideIcon =>
  lucideByName(icon) ?? BY_NAME[name?.trim().toLowerCase() ?? ""] ?? Tag

/** O ícone da categoria já como elemento (para quem precisa de um nó, não de um componente). */
export const CategoryIcon = ({ name, icon, ...props }: { name?: string | null; icon?: string | null } & LucideProps) => createElement(categoryIcon(name, icon), props)
