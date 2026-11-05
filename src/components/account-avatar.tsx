import type { AccountLook } from "@/lib/banks"
import { cn } from "@/lib/utils"

/**
 * Quadrado da conta: logo do banco sobre a cor dele (ou a cor escolhida); sem logo, monograma/iniciais em HTML
 * (centra igual em todo navegador). O anel interno separa o quadrado do fundo quando as cores se confundem
 * (C6 no escuro, Banco do Brasil no claro); `outline-0` no className tira.
 */
export function AccountAvatar({ look, size = 32, className }: { look: AccountLook; size?: number; className?: string }) {
  const mark = look.mark
  const text = mark && "text" in mark ? mark.text : look.initials
  return (
    <span
      aria-hidden
      className={cn(
        // contorno por outline (pintado por cima do logo, ao contrário de um ring inset, que o SVG de fundo cheio cobriria)
        "grid shrink-0 place-items-center overflow-hidden leading-none font-semibold outline-1 -outline-offset-1 outline-black/10 select-none dark:outline-white/15",
        size >= 28 ? "rounded-lg" : "rounded-md",
        mark && "text" in mark && "font-extrabold",
        className,
      )}
      style={{ width: size, height: size, background: look.color, color: look.fg, fontSize: size * (text.length > 2 ? 0.3 : 0.4) }}
    >
      {mark && "src" in mark ? (
        // eslint-disable-next-line @next/next/no-img-element -- SVG estático e minúsculo; next/image não ajuda aqui
        <img src={mark.src} alt="" draggable={false} className={mark.full ? "size-full" : "size-[68%]"} />
      ) : (
        text
      )}
    </span>
  )
}
