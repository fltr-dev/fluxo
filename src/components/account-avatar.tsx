import type { AccountLook } from "@/lib/banks"
import { cn } from "@/lib/utils"

/** Quadrado da conta: logo do banco sobre a cor dele (ou a cor escolhida); sem banco, as iniciais. */
export function AccountAvatar({ look, size = 32, className }: { look: AccountLook; size?: number; className?: string }) {
  const mark = look.mark
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center overflow-hidden font-semibold select-none", size >= 28 ? "rounded-lg" : "rounded-md", className)}
      style={{ width: size, height: size, background: look.color, color: look.fg, fontSize: size * 0.38 }}
    >
      {mark ? (
        <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: "66%", height: "66%" }}>
          {"path" in mark ? (
            <path d={mark.path} />
          ) : (
            <text x="12" y="12.6" textAnchor="middle" dominantBaseline="central" fontSize={Math.min(17, 21 / (mark.text.length * 0.62))} fontWeight={800} fontFamily="inherit" letterSpacing="-0.03em">
              {mark.text}
            </text>
          )}
        </svg>
      ) : (
        look.initials
      )}
    </span>
  )
}
