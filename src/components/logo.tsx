import { useId } from "react"
import { cn } from "@/lib/utils"

/** Marca fluxo: moeda com o nível subindo em duas ondas, na cor de destaque (mesmo desenho do ícone do app). */
export function Logo({ small, className }: { small?: boolean; className?: string }) {
  const clip = useId()
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground", small ? "size-7" : "size-8", className)}>
      <svg viewBox="0 0 100 100" aria-hidden className="size-full">
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="25" />
        </clipPath>
        <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="7" />
        <g clipPath={`url(#${clip})`} fill="currentColor">
          <path className="logo-wave" d="M10 50 C 28 38 42 60 60 46 S 84 34 92 38 V95 H10Z" fillOpacity=".45" />
          <path className="logo-wave logo-wave-2" d="M10 62 C 28 50 42 74 60 58 S 84 48 92 52 V95 H10Z" />
        </g>
      </svg>
    </span>
  )
}

// Ondas periódicas (período 50, o dobro da largura visível): andar 50 fecha o ciclo sem emenda.
const WAVE = " q12.5 -5 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 V100 H-50Z"

/**
 * Loading de tela (DESIGN.md › Carregamento): o logo se forma, o anel se desenha enquanto a moeda enche com as
 * ondas correndo, segura um instante formado e recomeça. Só CSS (globals.css, `.ll-*`): anima já no HTML do
 * servidor, antes do JavaScript carregar. Puramente visual: quem usa põe o texto "Carregando…" para leitor de tela.
 */
export function LogoLoader({ className }: { className?: string }) {
  const clip = useId()
  return (
    <span aria-hidden className={cn("grid size-14 shrink-0 place-items-center rounded-[22%] bg-primary text-primary-foreground", className)}>
      <svg viewBox="0 0 100 100" className="size-full">
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="25" />
        </clipPath>
        <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="7" strokeOpacity=".3" />
        <circle className="ll-arc" cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="7" pathLength={100} transform="rotate(-90 50 50)" />
        <g clipPath={`url(#${clip})`} fill="currentColor">
          <g className="ll-level">
            <path className="ll-drift" d={`M-50 44${WAVE}`} fillOpacity=".45" />
            <path className="ll-drift ll-drift-front" d={`M-50 57${WAVE.replace("-5", "5")}`} />
          </g>
        </g>
      </svg>
    </span>
  )
}
