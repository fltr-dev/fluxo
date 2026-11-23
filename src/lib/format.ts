const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const pctFmt = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 })
const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

export const brl = (n: number) => brlFmt.format(n)
export const pct = (n: number) => pctFmt.format(n)
export const num1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** "2026-03-05" → "05/03/2026" */
export const dateBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
/** Máscara enquanto se digita: "05032026" → "05/03/2026" (só dígitos, no máximo 8). */
export function maskDateBR(s: string) {
  const d = s.replace(/\D/g, "").slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/")
}
/** "05/03/2026" → "2026-03-05"; null se incompleta ou inexistente (31/02). */
export function isoFromBR(s: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(`${iso}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null
}
/** "2026-11-06" → "6 nov" */
export const dayMonth = (d: string) => `${+d.slice(8, 10)} ${months[+d.slice(5, 7) - 1]}`
/** "2026-03" → "mar/26" */
export const monthLabel = (ym: string) => `${months[+ym.slice(5, 7) - 1]}/${ym.slice(2, 4)}`
const rel = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" })
/** "há 2 horas", "ontem"… */
export function ago(d: Date, now = Date.now()) {
  const min = Math.round((d.getTime() - now) / 60_000)
  if (Math.abs(min) < 60) return rel.format(min, "minute")
  const h = Math.round(min / 60)
  return Math.abs(h) < 24 ? rel.format(h, "hour") : rel.format(Math.round(h / 24), "day")
}
/** "+3,2%" com sinal de menos tipográfico */
export const signedPct = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

/** Variação relativa; null quando não há base de comparação. */
export const delta = (cur: number, prev: number) => (prev ? (cur - prev) / Math.abs(prev) : null)

const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
/** "2026-03-05" → "Quinta-feira, 5 de março" */
export function dayLabel(d: string) {
  const s = dayFmt.format(new Date(`${d}T00:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Valor colado ou digitado → número: "R$ 1.234,56" → 1234.56, "1,234.56" → 1234.56, "12.5" → 12.5, "1.234" → 1234.
 * O último separador seguido de 1–2 dígitos é o decimal; os outros são de milhar. Sem número, 0.
 */
export function parseMoney(text: string) {
  const s = text.replace(/[^\d.,]/g, "")
  const m = /^(.*)[.,](\d{1,2})$/.exec(s)
  const int = (m ? m[1] : s).replace(/\D/g, "")
  return Number(`${int || 0}.${m ? m[2] : 0}`) || 0
}
