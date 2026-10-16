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
          <path d="M10 50 C 28 38 42 60 60 46 S 84 34 92 38 V95 H10Z" fillOpacity=".45" />
          <path d="M10 62 C 28 50 42 74 60 58 S 84 48 92 52 V95 H10Z" />
        </g>
      </svg>
    </span>
  )
}
