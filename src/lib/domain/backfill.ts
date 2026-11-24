import { addDays } from "./dates"

// Reconstrução do saldo de fim de mês antes do 1º saldo real (scripts/backfill.ts). Tudo volta no tempo a partir
// desse saldo real, então a série estimada encaixa nele sem degrau.

export type Flow = { date: string; amount: number } // aplicação (+) / resgate (−), em reais
export type UnitFlow = { date: string; quantity: number } // compra (+) / venda (−), em unidades
type Real = { date: string; value: number }

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."))

/** Taxa pelo rótulo: "115% CDI" e "16,76% a.a."; sem taxa reconhecível (Selic, IPCA, FIDC, nada) vale 100% do CDI. */
export function parseRate(label: string | null): { kind: "CDI"; pct: number } | { kind: "PRE"; annual: number } {
  const cdi = label?.match(/([\d.,]+)%\s*CDI/i)
  if (cdi) return { kind: "CDI", pct: num(cdi[1]) / 100 }
  const pre = label?.match(/^([\d.,]+)%\s*a\.a\./i)
  if (pre) return { kind: "PRE", annual: num(pre[1]) / 100 }
  return { kind: "CDI", pct: 1 }
}

/** Fator de cada dia útil (as datas da série do CDI, em % ao dia): pós = 1 + CDI × %; pré = (1 + taxa)^(1/252). */
export function dailyFactors(cdi: { date: string; value: number }[], rate: ReturnType<typeof parseRate>) {
  const pre = rate.kind === "PRE" ? (1 + rate.annual) ** (1 / 252) : 0
  return new Map(cdi.map((d) => [d.date, rate.kind === "PRE" ? pre : 1 + (d.value / 100) * rate.pct]))
}

/**
 * Renda fixa: V(d−1) = (V(d) − fluxo(d)) / fator(d), de `real.date` até a data mais antiga de `ends` (fins de mês).
 * Resgate é fluxo negativo, então um ativo hoje zerado volta a ter saldo antes do resgate.
 */
export function accrualBack(real: Real, flows: Flow[], factor: Map<string, number>, ends: string[]) {
  const flow = new Map<string, number>()
  for (const f of flows) flow.set(f.date, (flow.get(f.date) ?? 0) + f.amount)
  const want = new Set(ends)
  const first = ends.reduce((a, b) => (a < b ? a : b), real.date)
  const out = new Map<string, number>()
  let v = real.value
  for (let d = real.date; d > first; d = addDays(d, -1)) {
    v = (v - (flow.get(d) ?? 0)) / (factor.get(d) ?? 1)
    const prev = addDays(d, -1)
    if (want.has(prev)) out.set(prev, v)
  }
  return clean(
    ends.map((e) => out.get(e) ?? null),
    Math.max(real.value, ...flows.map((f) => Math.abs(f.amount))),
  )
}

/**
 * Renda variável e fundos: unidades no 1º saldo real = saldo ÷ preço, menos as compras (mais as vendas) depois de
 * cada fim de mês, vezes o preço do dia. Sem preço na data do saldo real não há como ancorar: tudo null.
 */
export function unitsBack(real: Real, flows: UnitFlow[], price: (date: string) => number | null, ends: string[]) {
  const p0 = price(real.date)
  if (!p0) return ends.map(() => null)
  const units = real.value / p0
  const values = ends.map((e) => {
    const p = price(e)
    if (p == null) return null
    const u = units - flows.filter((f) => f.date > e && f.date <= real.date).reduce((s, f) => s + f.quantity, 0)
    return u * p
  })
  return clean(values, Math.max(real.value, ...values.map((v) => Math.abs(v ?? 0))))
}

/**
 * Resíduo da estimativa vira zero, e os zeros antes da 1ª posição viram null (o ativo ainda não existia; null não é
 * gravado). Zeros depois dela ficam: resgatou tudo e voltou a aplicar. `values` em ordem cronológica.
 * ponytail: limiar fixo de 2% da maior posição/fluxo; afinar se um ativo pequeno sumir de meses em que existia.
 */
function clean(values: (number | null)[], scale: number) {
  const floor = Math.max(1, scale * 0.02)
  let started = false
  return values.map((v) => {
    if (v == null) return null
    const x = v < floor ? 0 : Math.round(v * 100) / 100
    if (x > 0) started = true
    return started ? x : null
  })
}

/** Último valor com data ≤ `date` numa série ordenada por data (cotação do dia útil anterior em fins de semana). */
export function lastAtOrBefore(series: { date: string; value: number }[], date: string) {
  let lo = 0
  let hi = series.length - 1
  let found: number | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (series[mid].date <= date) {
      found = series[mid].value
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}
