import { BriefcaseBusiness, ShoppingCart } from "lucide-react"
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

const card = "float absolute rounded-xl border bg-card shadow-[0_8px_24px_-8px_rgb(0_0_0/.18)] max-sm:hidden"

function Chip({ icon, label, value, tone, className }: { icon: React.ReactNode; label: string; value: string; tone: "income" | "expense"; className?: string }) {
  return (
    <div className={cn(card, "flex items-center gap-2.5 py-2 pr-4 pl-2", className)}>
      <span className={cn("grid size-9 place-items-center rounded-full", tone === "income" ? "bg-income/12 text-income" : "bg-expense/12 text-expense")}>{icon}</span>
      <span className="grid leading-tight">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className={cn("text-[13px] font-semibold tabular-nums", tone === "income" ? "text-income" : "text-expense")}>{value}</span>
      </span>
    </div>
  )
}

// mesma onda do símbolo, em dois ciclos de 200 (a moeda tem 200 de largura): andar 200 fecha o loop
const COIN_FRONT = "M0 112 C33 100 67 100 100 112 S167 124 200 112 S267 100 300 112 S367 124 400 112 V200 H0Z"
const COIN_BACK = "M0 96 C33 84 67 84 100 96 S167 108 200 96 S267 84 300 96 S367 108 400 96 V200 H0Z"

/**
 * A moeda do fluxo em escala de ilustração: o nível sobe ao abrir e as duas ondas correm dentro dela, entre um
 * salário que entra, uma compra que sai e a reserva enchendo. O que o app faz, sem texto. Decorativo: fica fora
 * da árvore de acessibilidade.
 */
export function LoginIllustration() {
  return (
    <div aria-hidden className="relative grid size-[164px] place-items-center sm:size-[380px]">
      <div className="float relative">
        <svg viewBox="0 0 200 200" className="size-[132px] sm:size-[240px]">
          <clipPath id="login-coin">
            <circle cx="100" cy="100" r="72" />
          </clipPath>
          <circle cx="100" cy="100" r="72" className="fill-primary/8" />
          <g clipPath="url(#login-coin)">
            <g className="coin-fill">
              <path d={COIN_BACK} className="coin-wave coin-wave-back fill-primary/45" />
              <path d={COIN_FRONT} className="coin-wave fill-primary" />
            </g>
          </g>
          <circle cx="100" cy="100" r="86" fill="none" strokeWidth="20" className="stroke-primary" />
        </svg>
      </div>
      {/* sombra no chão, respirando com a flutuação */}
      <div className="float-shadow absolute bottom-[6%] h-3 w-[44%] rounded-[50%] bg-foreground/8 blur-[2px] max-sm:bottom-0" />

      <Chip icon={<BriefcaseBusiness className="size-4" />} label="Salário" value="+R$ 5.200,00" tone="income" className="top-[10%] -left-[10%]" />
      <Chip icon={<ShoppingCart className="size-4" />} label="Mercado" value="-R$ 84,90" tone="expense" className="bottom-[16%] -left-[16%] [animation-delay:-2s]" />
      <div className={cn(card, "bottom-[34%] left-[75%] grid w-44 gap-2 p-3 [animation-delay:-4s]")}>
        <div className="flex items-baseline justify-between text-[13px] font-semibold">
          <span>Reserva</span>
          <span className="text-primary tabular-nums">72%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="bar-fill h-full w-[72%] rounded-full bg-primary" />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">R$ 7.200 de R$ 10.000</span>
      </div>
    </div>
  )
}
