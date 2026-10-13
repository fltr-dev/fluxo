import { daysBetween } from "./dates"

export type TransferCandidate = {
  id: number
  accountId: number
  date: string
  amount: number
  kind: "INCOME" | "EXPENSE" | "TRANSFER"
  categorySource: string
  ignored: boolean
  transferPairId: number | null
  pluggyCategory: string | null
  pluggyCategoryId: string | null
}

/**
 * Categorias Pluggy que indicam dinheiro mudando de lugar entre contas do próprio usuário:
 * transferência para mesma titularidade (04), pagamento de fatura e movimentação de investimentos (03),
 * exceto rendimentos, que são receita.
 */
export function isTransferCategory(pluggyCategoryId: string | null, pluggyCategory: string | null) {
  if (pluggyCategory === "Credit card payment") return true
  if (!pluggyCategoryId) return false
  if (pluggyCategoryId.startsWith("04")) return true
  return pluggyCategoryId.startsWith("03") && pluggyCategory !== "Proceeds interests and dividends"
}

const cents = (n: number) => Math.round(n * 100)

/**
 * Pares: mesmo valor absoluto, sinais opostos, contas diferentes, até `windowDays` dias de distância
 * (escolhe o par mais próximo em data). Singles: categoria Pluggy de transferência sem par encontrado.
 * Ignora o que o usuário já decidiu (categorySource USER), transações ignoradas e já pareadas.
 */
export function detectTransfers(txs: TransferCandidate[], windowDays = 3) {
  const candidates = txs.filter((t) => t.transferPairId == null && t.categorySource !== "USER" && !t.ignored)
  const outflows = candidates.filter((t) => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  const inflows = candidates.filter((t) => t.amount > 0)
  const used = new Set<number>()
  const pairs: [number, number][] = []

  for (const out of outflows) {
    let best: TransferCandidate | undefined
    let bestGap = Infinity
    for (const inc of inflows) {
      if (used.has(inc.id) || inc.accountId === out.accountId || cents(inc.amount) !== -cents(out.amount)) continue
      const gap = Math.abs(daysBetween(out.date, inc.date))
      if (gap <= windowDays && gap < bestGap) {
        best = inc
        bestGap = gap
      }
    }
    if (best) {
      used.add(best.id)
      used.add(out.id)
      pairs.push([out.id, best.id])
    }
  }

  const singles = candidates
    .filter((t) => !used.has(t.id) && t.kind !== "TRANSFER" && isTransferCategory(t.pluggyCategoryId, t.pluggyCategory))
    .map((t) => t.id)

  return { pairs, singles }
}
