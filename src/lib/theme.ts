import { INK, mix, readableOn } from "./color"

// Aparência (Configurações › Aparência): fundo e cor de destaque, ambos por escolha entre opções fixas,
// guardados em cookies (por aparelho) para o servidor já renderizar o tema certo, sem piscar.

/** Valor do cookie "theme" (sem cookie = segue o sistema). "dim" é o fundo cinza. */
export const THEMES = [
  { id: "system", label: "Sistema" },
  { id: "light", label: "Claro" },
  { id: "dim", label: "Cinza" },
  { id: "dark", label: "Preto" },
] as const
export type ThemeId = (typeof THEMES)[number]["id"]

export const themeFromCookie = (v?: string): ThemeId => (v === "light" || v === "dim" || v === "dark" ? v : "system")

/** `light` é o tom usado no tema claro (contraste AA com texto branco); `vivid`, nos temas escuros e nos círculos. */
export const PRIMARIES = [
  { id: "green", label: "Verde", light: "#08845a", vivid: "#36bc84" }, // padrão: Verde fluxo (DESIGN.md)
  { id: "teal", label: "Turquesa", light: "#0f766e", vivid: "#14b8a6" },
  { id: "blue", label: "Azul", light: "#1d4ed8", vivid: "#3b82f6" },
  { id: "indigo", label: "Índigo", light: "#4338ca", vivid: "#5f62ee" },
  { id: "purple", label: "Roxo", light: "#7e22ce", vivid: "#a855f7" },
  { id: "yellow", label: "Amarelo", light: "#a16207", vivid: "#eab308" },
  { id: "orange", label: "Laranja", light: "#c2410c", vivid: "#f97316" },
  { id: "red", label: "Vermelho", light: "#b91c1c", vivid: "#ef4444" },
  { id: "pink", label: "Rosa", light: "#be185d", vivid: "#ec4899" },
] as const
export type PrimaryId = (typeof PRIMARIES)[number]["id"]

export const DEFAULT_PRIMARY: PrimaryId = "green"

/** Só aceita ids conhecidos: o valor do cookie nunca vira CSS sem passar por aqui. */
export const primaryFromCookie = (v?: string): PrimaryId | null => PRIMARIES.find((p) => p.id === v)?.id ?? null

const vars = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";")

/**
 * CSS que sobrescreve as variáveis de destaque do globals.css. O seletor `html:root` ganha de `:root`;
 * `.dark`/`.dim` (ou o sistema escuro, sem `.light`/`.dim`) usam o tom vivo.
 */
export function primaryCss(id: PrimaryId | null): string {
  const p = PRIMARIES.find((x) => x.id === id)
  if (!p) return ""
  const light = vars({
    "--primary": p.light,
    "--primary-foreground": readableOn(p.light),
    "--ring": p.vivid,
    "--sidebar-primary": p.light,
    "--sidebar-primary-foreground": readableOn(p.light),
    "--sidebar-accent": mix(p.light, "#ffffff", 0.92),
    "--sidebar-accent-foreground": p.light,
    "--sidebar-ring": p.vivid,
  })
  const dark = vars({
    "--primary": p.vivid,
    "--primary-foreground": readableOn(p.vivid),
    "--ring": p.vivid,
    "--sidebar-primary": p.vivid,
    "--sidebar-primary-foreground": readableOn(p.vivid),
    "--sidebar-accent": mix(p.vivid, INK, 0.86),
    "--sidebar-accent-foreground": mix(p.vivid, "#ffffff", 0.3),
    "--sidebar-ring": p.vivid,
  })
  return `html:root{${light}}html:root.dark,html:root.dim{${dark}}@media (prefers-color-scheme:dark){html:root:not(.light):not(.dim){${dark}}}`
}
