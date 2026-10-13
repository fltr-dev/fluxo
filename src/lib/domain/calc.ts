import { addMonths, monthDiff, monthOf } from "./dates"

export const round2 = (n: number) => Math.round(n * 100) / 100

export function limitStatus(spent: number, limit: number) {
  const pct = limit > 0 ? spent / limit : 0
  return { pct, state: pct >= 1 ? "over" : pct >= 0.8 ? "warn" : "ok" } as const
}

/**
 * Meses restantes contam o mês atual (out/26 → dez/26 = 3 aportes). "No ritmo" compara o progresso
 * com a reta linear entre a criação da meta e o prazo.
 */
export function goalProgress(g: { target: number; current: number; createdAt: string; deadline: string; today: string }) {
  const remaining = Math.max(0, round2(g.target - g.current))
  const pct = g.target > 0 ? Math.min(1, g.current / g.target) : 0
  const monthsLeft = Math.max(0, monthDiff(monthOf(g.today), monthOf(g.deadline)) + 1)
  const monthlyNeeded = remaining === 0 ? 0 : round2(remaining / Math.max(1, monthsLeft))
  const total = Date.parse(g.deadline) - Date.parse(g.createdAt)
  const elapsed = Math.min(1, Math.max(0, (Date.parse(g.today) - Date.parse(g.createdAt)) / (total || 1)))
  const state =
    remaining === 0 ? "done" : g.today > g.deadline ? "late" : pct + 1e-9 >= elapsed ? "on_track" : "late"
  return { remaining, pct, monthsLeft, monthlyNeeded, state } as const
}

/**
 * Média mensal de despesa dos últimos `n` meses fechados antes de `currentMonth`.
 * Só conta meses com dado, para um histórico curto não puxar a média para baixo.
 */
export function averageMonthlyExpense(expenseByMonth: Map<string, number>, currentMonth: string, n = 12) {
  let sum = 0
  let count = 0
  for (let i = 1; i <= n; i++) {
    const v = expenseByMonth.get(addMonths(currentMonth, -i))
    if (v != null) {
      sum += v
      count++
    }
  }
  return count ? round2(sum / count) : 0
}

export function reserveStatus(r: {
  balance: number
  avgMonthlyExpense: number
  mode: "MONTHS" | "FIXED"
  targetMonths: number
  targetAmount: number | null
}) {
  const target = r.mode === "FIXED" ? (r.targetAmount ?? 0) : round2(r.avgMonthlyExpense * r.targetMonths)
  return {
    target,
    pct: target > 0 ? Math.min(1, r.balance / target) : 0,
    coverageMonths: r.avgMonthlyExpense > 0 ? r.balance / r.avgMonthlyExpense : null,
  }
}

/** Patrimônio por mês: último snapshot de cada conta até o fim do mês (carrega o valor anterior se faltar). */
export function netWorthSeries(snapshots: { accountId: number; date: string; balance: number }[], months: string[]) {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const last = new Map<number, number>()
  let i = 0
  return months.map((m) => {
    while (i < sorted.length && monthOf(sorted[i].date) <= m) {
      last.set(sorted[i].accountId, sorted[i].balance)
      i++
    }
    return { month: m, value: round2([...last.values()].reduce((a, b) => a + b, 0)) }
  })
}
