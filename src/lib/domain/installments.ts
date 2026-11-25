export type InstallmentTx = {
  id: number
  accountId: number
  date: string // AAAA-MM-DD
  amount: number
  description: string
  installmentNumber: number | null
  totalInstallments: number | null
}

// Alguns bancos repetem a parcela no texto ("LOJA 03/10", "LOJA PARCELA 3/10"); fora isso o texto é igual em todas
const normalize = (d: string) =>
  d
    .replace(/\s*(parc(ela)?\.?\s*)?\d{1,2}\s*(\/|de)\s*\d{1,2}\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1

/** Mês em que cairia a parcela 1: igual para todas as parcelas da mesma compra quando o banco data cada uma no seu mês. */
const firstMonth = (t: InstallmentTx) => monthIndex(t.date) - (t.installmentNumber ?? 1) + 1

/**
 * Parcelas da mesma compra de `tx` entre `candidates` (sem a própria `tx`): mesma conta, mesmo texto, mesmo número
 * de parcelas, valor igual (tolerância de centavos do arredondamento) e datas coerentes: cada parcela no seu mês a
 * partir do mesmo mês de origem (o comum) ou, se nenhuma casa assim, todas com a data da compra. Duas compras iguais
 * feitas em meses diferentes ficam separadas pelo mês de origem, mesmo quando a 1ª de uma cai no dia da 2ª da outra.
 */
export function sameInstallmentPurchase<T extends InstallmentTx>(tx: InstallmentTx, candidates: T[]): T[] {
  if (!tx.totalInstallments || tx.totalInstallments < 2 || !tx.installmentNumber) return []
  const desc = normalize(tx.description)
  const same = candidates.filter(
    (c) =>
      c.id !== tx.id &&
      c.accountId === tx.accountId &&
      c.totalInstallments === tx.totalInstallments &&
      c.installmentNumber != null &&
      c.installmentNumber !== tx.installmentNumber &&
      Math.sign(c.amount) === Math.sign(tx.amount) &&
      Math.abs(c.amount - tx.amount) <= 0.05 &&
      normalize(c.description) === desc,
  )
  const monthly = same.filter((c) => firstMonth(c) === firstMonth(tx))
  return monthly.length ? monthly : same.filter((c) => c.date === tx.date)
}
