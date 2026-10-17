"use client"

import { usePathname } from "next/navigation"

/** Entrada de página: sobe 8px com fade em 220ms a cada troca de rota (só o caminho conta; abrir um modal não reanima). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div key={path} className="page-enter">
      {children}
    </div>
  )
}
