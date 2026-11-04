import { BriefcaseBusiness, ShoppingCart } from "lucide-react"
import { CofyPose } from "@/components/cofy-mascot"
import { cn } from "@/lib/utils"

// Ondas do símbolo do fluxo (a de trás translúcida, a da frente cheia), periódicas: dois ciclos no desenho,
// para que andar 50% (globals.css) feche o loop sem emenda. preserveAspectRatio="none" estica um ciclo pela faixa.
const VERTICAL = "M70 0 C30 133 30 267 70 400 C110 533 110 667 70 800 C30 933 30 1067 70 1200 C110 1333 110 1467 70 1600 H120 V0Z"
const HORIZONTAL = "M0 30 C133 10 267 10 400 30 S667 50 800 30 S1067 10 1200 30 S1467 50 1600 30 V80 H0Z"

const BACK = "fill-primary/35 dark:fill-primary/20"
const FRONT = "fill-primary dark:fill-sidebar-accent"

/**
 * Divisor entre a ilustração e o painel do login: vertical na lateral do painel (desktop), horizontal no topo
 * (celular). Fica fora do painel, colado nele, e ondula devagar.
 */
export function WaveEdge() {
  return (
    <div aria-hidden className="pointer-events-none absolute overflow-hidden max-lg:inset-x-0 max-lg:bottom-[calc(100%-1px)] max-lg:h-12 lg:inset-y-0 lg:right-[calc(100%-1px)] lg:w-28">
      {[
        { cls: cn(BACK, "wave-slow"), shift: true },
        { cls: FRONT, shift: false },
      ].map(({ cls, shift }, i) => (
        <div key={i} className="absolute inset-0">
          <svg viewBox="0 0 120 1600" preserveAspectRatio="none" className={cn("wave-drift-y h-[200%] w-full max-lg:hidden", shift && "-translate-x-6")}>
            <path d={VERTICAL} className={cls} />
          </svg>
          <svg viewBox="0 0 1600 80" preserveAspectRatio="none" className={cn("wave-drift-x h-full w-[200%] lg:hidden", shift && "-translate-y-2.5")}>
            <path d={HORIZONTAL} className={cls} />
          </svg>
        </div>
      ))}
    </div>
  )
}

function Chip({ icon, label, value, tone, className }: { icon: React.ReactNode; label: string; value: string; tone: "income" | "expense"; className?: string }) {
  return (
    <div className={cn("float absolute flex items-center gap-2.5 rounded-xl border bg-card py-2 pr-4 pl-2 shadow-[0_8px_24px_-8px_rgb(0_0_0/.18)]", className)}>
      <span className={cn("grid size-9 place-items-center rounded-full", tone === "income" ? "bg-income/12 text-income" : "bg-expense/12 text-expense")}>{icon}</span>
      <span className="grid leading-tight">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className={cn("text-[13px] font-semibold tabular-nums", tone === "income" ? "text-income" : "text-expense")}>{value}</span>
      </span>
    </div>
  )
}

/**
 * Cofy guardando a moeda do fluxo, entre um salário que entra e uma compra que sai: o que o app faz, sem texto.
 * Decorativo: fica fora da árvore de acessibilidade.
 */
export function LoginIllustration() {
  return (
    <div aria-hidden className="login-art relative grid size-[164px] place-items-center sm:size-[360px]">
      {/* o anel da moeda do logo, ao fundo */}
      <div className="absolute inset-[6%] rounded-full border-[12px] border-primary/10 sm:border-[22px]" />
      <div className="cofy-gulp">
        <CofyPose size={300} className="size-[148px] sm:size-[300px]" />
      </div>
      <Chip icon={<BriefcaseBusiness className="size-4" />} label="Salário" value="+R$ 5.200,00" tone="income" className="top-[14%] -left-[12%] max-sm:hidden" />
      <Chip icon={<ShoppingCart className="size-4" />} label="Mercado" value="-R$ 84,90" tone="expense" className="-right-[10%] bottom-[12%] [animation-delay:-3s] max-sm:hidden" />
    </div>
  )
}
