// Matemática de cores (hex "#rrggbb", RGB 0–255, HSV com h em 0–360 e s/v em 0–1). Sem dependências: usada
// pelo seletor de cores e pelo tema (cor primária), no servidor e no cliente.

export type RGB = { r: number; g: number; b: number }
export type HSV = { h: number; s: number; v: number }

export const HEX_RE = /^#[0-9a-f]{6}$/i

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const byte = (n: number) => Math.round(clamp(n, 0, 255))

/** "#abc", "abc", "#AABBCC" → "#aabbcc"; qualquer outra coisa → null. */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, "").toLowerCase()
  if (/^[0-9a-f]{3}$/.test(s)) return `#${[...s].map((c) => c + c).join("")}`
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null
}

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex) ?? "#000000"
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }
}

export const rgbToHex = ({ r, g, b }: RGB) => `#${[r, g, b].map((v) => byte(v).toString(16).padStart(2, "0")).join("")}`

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const d = max - Math.min(R, G, B)
  let h = 0
  if (d) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return { r: byte(f(5) * 255), g: byte(f(3) * 255), b: byte(f(1) * 255) }
}

export const hexToHsv = (hex: string) => rgbToHsv(hexToRgb(hex))
export const hsvToHex = (hsv: HSV) => rgbToHex(hsvToRgb(hsv))

/** Luminância relativa (WCAG 2.x), 0 = preto, 1 = branco. */
export function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const [R, G, B] = [r, g, b].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/** Razão de contraste (WCAG), de 1 a 21. */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const WHITE = "#ffffff"
export const INK = "#09090b" // zinc-950

/** Cor de texto (branco ou quase preto) com mais contraste sobre `bg`. */
export const readableOn = (bg: string) => (contrast(bg, WHITE) >= contrast(bg, INK) ? WHITE : INK)

/** Mistura `a` com `b`; t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number) {
  const [x, y] = [hexToRgb(a), hexToRgb(b)]
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t })
}
