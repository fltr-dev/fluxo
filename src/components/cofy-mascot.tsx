import { cn } from "@/lib/utils"

/**
 * Cofy, o porquinho-cofrinho do fluxo, visto de lado (design: "Dívidas, Capi e melhorias" › Mascote).
 * Corpo rosa, fenda nas costas, moeda verde do fluxo caindo. No tema escuro só o fundo do avatar muda.
 */
export function CofyAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      <circle cx="32" cy="32" r="32" className="fill-[#EDFAF3] dark:fill-[#052e1f]" /><g transform="translate(32 32) scale(1.1) translate(-32 -31)"><rect x="18" y="41" width="8" height="11" rx="3" fill="#E27F98" /><rect x="40" y="41" width="8" height="11" rx="3" fill="#E27F98" /><path d="M53 33 c4.5 0 5.5 5.5 2 5.5 c-2.2 0 -2.2 -3.2 0 -3.2" stroke="#E27F98" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M19 23 L21 11 L30 19Z" fill="#E27F98" /><ellipse cx="34" cy="33" rx="20" ry="15" fill="#F4A7B9" /><rect x="7" y="27" width="11" height="12" rx="4" fill="#E27F98" /><ellipse cx="10.4" cy="33" rx="1.3" ry="2.1" fill="#B0485F" /><rect x="32" y="20.6" width="11" height="2.6" rx="1.3" fill="#B0485F" /><ellipse cx="21.5" cy="36.5" rx="2.6" ry="1.7" fill="#F07C9A" opacity=".55" /><circle cx="23" cy="29" r="2.4" fill="#21160E" /><circle cx="23.8" cy="28.2" r=".8" fill="#FFFFFF" /><circle cx="37.5" cy="10" r="5" fill="#08845A" /><circle cx="37.5" cy="10" r="3" fill="none" stroke="#FFFFFF" strokeOpacity=".45" strokeWidth="1" /></g>
    </svg>
  )
}

export type CofyPoseName = "padrao" | "pensando" | "comemorando"

const POSES: Record<CofyPoseName, React.ReactNode> = {
  padrao: (
    <>
      <ellipse cx="108" cy="182" rx="70" ry="6" fill="#09090B" opacity=".08" />
        <g><rect x="60" y="140" width="24" height="32" rx="9" fill="#E27F98" /><rect x="132" y="140" width="24" height="32" rx="9" fill="#E27F98" /><path d="M172 108 c15 -2 17 15 6 15 c-8 0 -8 -10 0 -10" stroke="#E27F98" strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M64 74 L72 36 L102 62Z" fill="#E27F98" /><path d="M72 66 L76 48 L90 61Z" fill="#F9C9D4" /><ellipse cx="108" cy="110" rx="66" ry="50" fill="#F4A7B9" /><path d="M84 74 C104 62 140 62 160 82 C140 74 106 72 84 80Z" fill="#F9C9D4" opacity=".9" /><rect x="22" y="94" width="32" height="38" rx="11" fill="#E27F98" /><ellipse cx="31" cy="113" rx="3.6" ry="6" fill="#B0485F" /><rect x="104" y="72" width="36" height="7" rx="3.5" fill="#B0485F" /><ellipse cx="72" cy="122" rx="9" ry="5.5" fill="#F07C9A" opacity=".55" /><circle cx="72" cy="98" r="6" fill="#21160E" /><circle cx="74.2" cy="95.8" r="2" fill="#FFFFFF" /><path d="M57 135 q7 5 14 0" stroke="#B0485F" strokeWidth="3" fill="none" strokeLinecap="round" /></g>
        {/* cofy-coin: o login anima a moeda caindo na fenda (globals.css); nas outras telas fica parada */}
        <g className="cofy-coin"><circle cx="122" cy="34" r="20" fill="#08845A" /><circle cx="122" cy="34" r="14" fill="none" stroke="#FFFFFF" strokeOpacity=".4" strokeWidth="2" /><text x="122" y="42" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="22" fill="#FFFFFF">$</text></g>
    </>
  ),
  pensando: (
    <>
      <ellipse cx="108" cy="182" rx="70" ry="6" fill="#09090B" opacity=".08" />
        <g><rect x="60" y="140" width="24" height="32" rx="9" fill="#E27F98" /><rect x="132" y="140" width="24" height="32" rx="9" fill="#E27F98" /><path d="M172 108 c15 -2 17 15 6 15 c-8 0 -8 -10 0 -10" stroke="#E27F98" strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M64 74 L72 36 L102 62Z" fill="#E27F98" /><path d="M72 66 L76 48 L90 61Z" fill="#F9C9D4" /><ellipse cx="108" cy="110" rx="66" ry="50" fill="#F4A7B9" /><path d="M84 74 C104 62 140 62 160 82 C140 74 106 72 84 80Z" fill="#F9C9D4" opacity=".9" /><rect x="22" y="94" width="32" height="38" rx="11" fill="#E27F98" /><ellipse cx="31" cy="113" rx="3.6" ry="6" fill="#B0485F" /><rect x="104" y="72" width="36" height="7" rx="3.5" fill="#B0485F" /><ellipse cx="72" cy="122" rx="9" ry="5.5" fill="#F07C9A" opacity=".55" /><circle cx="74" cy="94" r="6" fill="#21160E" /><circle cx="76.4" cy="91.4" r="2" fill="#FFFFFF" /><path d="M58 136 h12" stroke="#B0485F" strokeWidth="3" strokeLinecap="round" /></g>
        <circle cx="44" cy="70" r="4" fill="#D4D4D8" /><circle cx="34" cy="54" r="6" fill="#D4D4D8" /><circle cx="34" cy="24" r="18" fill="#F4F4F5" stroke="#D4D4D8" strokeWidth="2" /><circle cx="34" cy="24" r="8" fill="#08845A" /><text x="34" y="28.5" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="11" fill="#FFFFFF">$</text>
    </>
  ),
  comemorando: (
    <>
      <ellipse cx="108" cy="182" rx="58" ry="6" fill="#09090B" opacity=".08" />
        <g transform="translate(0 -10)"><rect x="60" y="140" width="24" height="32" rx="9" fill="#E27F98" /><rect x="132" y="140" width="24" height="32" rx="9" fill="#E27F98" /><path d="M172 108 c15 -2 17 15 6 15 c-8 0 -8 -10 0 -10" stroke="#E27F98" strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M64 74 L72 36 L102 62Z" fill="#E27F98" /><path d="M72 66 L76 48 L90 61Z" fill="#F9C9D4" /><ellipse cx="108" cy="110" rx="66" ry="50" fill="#F4A7B9" /><path d="M84 74 C104 62 140 62 160 82 C140 74 106 72 84 80Z" fill="#F9C9D4" opacity=".9" /><rect x="22" y="94" width="32" height="38" rx="11" fill="#E27F98" /><ellipse cx="31" cy="113" rx="3.6" ry="6" fill="#B0485F" /><rect x="104" y="72" width="36" height="7" rx="3.5" fill="#B0485F" /><ellipse cx="72" cy="122" rx="9" ry="5.5" fill="#F07C9A" opacity=".55" /><path d="M65 98 q7 -8 14 0" stroke="#21160E" strokeWidth="4" fill="none" strokeLinecap="round" /><path d="M55 133 q8 10 16 0z" fill="#B0485F" /></g>
        <circle cx="122" cy="26" r="13" fill="#08845A" /><text x="122" y="31.5" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="15" fill="#FFFFFF">$</text><circle cx="160" cy="44" r="9" fill="#08845A" /><circle cx="88" cy="20" r="7" fill="#08845A" /><path d="M30 54 l4 8 l8 4 l-8 4 l-4 8 l-4 -8 l-8 -4 l8 -4z" fill="#F59E0B" /><path d="M182 70 l3 6 l6 3 l-6 3 l-3 6 l-3 -6 l-6 -3 l6 -3z" fill="#12A06A" />
    </>
  ),
}

const ALT: Record<CofyPoseName, string> = { padrao: "Cofy, o porquinho do fluxo", pensando: "Cofy pensando", comemorando: "Cofy comemorando" }

/** Corpo inteiro: estado vazio do chat (padrão), enquanto responde (pensando) e quando algo dá certo (comemorando). */
export function CofyPose({ pose = "padrao", size = 160, className }: { pose?: CofyPoseName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={ALT[pose]} className={cn("shrink-0", className)}>
      {POSES[pose]}
    </svg>
  )
}
