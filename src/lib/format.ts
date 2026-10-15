const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const pctFmt = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 })
const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

export const brl = (n: number) => brlFmt.format(n)
export const pct = (n: number) => pctFmt.format(n)
export const num1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** "2026-03-05" → "05/03/2026" */
export const dateBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
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
