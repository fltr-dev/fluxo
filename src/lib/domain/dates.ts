// Datas são strings "YYYY-MM-DD" já no fuso America/Sao_Paulo; meses são "YYYY-MM".
export const TZ = "America/Sao_Paulo"

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
const pad = (n: number) => String(n).padStart(2, "0")

export const toLocalDate = (d: Date | string) => fmt.format(new Date(d))
export const today = () => toLocalDate(new Date())
export const monthOf = (date: string) => date.slice(0, 7)

const monthIndex = (ym: string) => {
  const [y, m] = ym.split("-").map(Number)
  return y * 12 + m - 1
}
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`

export const addMonths = (ym: string, n: number) => fromIndex(monthIndex(ym) + n)
export const monthDiff = (fromYm: string, toYm: string) => monthIndex(toYm) - monthIndex(fromYm)
export const monthStart = (ym: string) => `${ym}-01`
export function monthEnd(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/** Meses (YYYY-MM) de `from` até `to`, inclusive. */
export function monthsInRange(from: string, to: string) {
  const out: string[] = []
  for (let i = monthIndex(monthOf(from)); i <= monthIndex(monthOf(to)); i++) out.push(fromIndex(i))
  return out
}

/** Mesmo dia N meses antes/depois, limitado ao fim do mês (31/03 - 1 mês = 28 ou 29/02). */
export function shiftDateMonths(date: string, n: number) {
  const ym = addMonths(monthOf(date), n)
  const end = monthEnd(ym)
  const day = `${ym}-${date.slice(8)}`
  return day > end ? end : day
}

export type Period = { from: string; to: string }

export const PRESETS = {
  mes: "Mês atual",
  "mes-anterior": "Mês anterior",
  "3m": "Últimos 3 meses",
  "6m": "Últimos 6 meses",
  "12m": "Últimos 12 meses",
  ano: "Ano atual",
  "ano-anterior": "Ano anterior",
  custom: "Personalizado",
} as const
export type Preset = keyof typeof PRESETS

export function resolvePeriod(preset: string, now: string, from?: string, to?: string): Period {
  const ym = monthOf(now)
  const year = now.slice(0, 4)
  const lastMonths = (n: number) => ({ from: monthStart(addMonths(ym, 1 - n)), to: monthEnd(ym) })
  switch (preset) {
    case "mes-anterior":
      return { from: monthStart(addMonths(ym, -1)), to: monthEnd(addMonths(ym, -1)) }
    case "3m":
      return lastMonths(3)
    case "6m":
      return lastMonths(6)
    case "12m":
      return lastMonths(12)
    case "ano":
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    case "ano-anterior":
      return { from: `${+year - 1}-01-01`, to: `${+year - 1}-12-31` }
    case "custom":
      if (from && to && from <= to) return { from, to }
    // fallthrough: período inválido vira mês atual
    default:
      return { from: monthStart(ym), to: monthEnd(ym) }
  }
}

const isWholeMonths = (p: Period) => p.from.endsWith("-01") && p.to === monthEnd(monthOf(p.to))

/** Período imediatamente anterior de mesma duração (em meses quando o período é de meses inteiros). */
export function previousPeriod(p: Period): Period {
  if (isWholeMonths(p)) {
    const n = monthDiff(monthOf(p.from), monthOf(p.to)) + 1
    return { from: monthStart(addMonths(monthOf(p.from), -n)), to: monthEnd(addMonths(monthOf(p.to), -n)) }
  }
  const len = daysBetween(p.from, p.to) + 1
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) }
}

export function samePeriodLastYear(p: Period): Period {
  if (isWholeMonths(p)) return { from: monthStart(addMonths(monthOf(p.from), -12)), to: monthEnd(addMonths(monthOf(p.to), -12)) }
  return { from: shiftDateMonths(p.from, -12), to: shiftDateMonths(p.to, -12) }
}

export const monthCount = (p: Period) => monthDiff(monthOf(p.from), monthOf(p.to)) + 1
