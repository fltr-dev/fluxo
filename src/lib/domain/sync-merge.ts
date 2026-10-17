import { daysBetween, toLocalDate } from "./dates"
import { tradeFromPluggy, type PluggyInvestmentInfo, type PluggyInvestmentTxInfo } from "./investments"

/** Transação da Pluggy (GET /v2/transactions), só os campos usados. */
export type PluggyTx = {
  id: string
  description: string
  amount: number
  type: "DEBIT" | "CREDIT"
  status?: "POSTED" | "PENDING"
  date: string
  category?: string | null
  categoryId?: string | null
  creditCardMetadata?: { installmentNumber?: number; totalInstallments?: number } | null
}

export type Incoming = {
  pluggyId: string
  date: string
  amount: number
  description: string
  status: "POSTED" | "PENDING"
  pluggyCategory: string | null
  pluggyCategoryId: string | null
  installmentNumber: number | null
  totalInstallments: number | null
}

/** Sinal pelo `type` (DEBIT = saída), independente da convenção de sinal do `amount`; data no fuso de SP. */
export const normalizePluggyTx = (t: PluggyTx): Incoming => ({
  pluggyId: t.id,
  date: toLocalDate(t.date),
  amount: (t.type === "DEBIT" ? -1 : 1) * Math.abs(t.amount),
  description: t.description,
  status: t.status === "PENDING" ? "PENDING" : "POSTED",
  pluggyCategory: t.category ?? null,
  pluggyCategoryId: t.categoryId ?? null,
  installmentNumber: t.creditCardMetadata?.installmentNumber ?? null,
  totalInstallments: t.creditCardMetadata?.totalInstallments ?? null,
})

export type Existing = {
  id: number
  pluggyId: string | null
  date: string
  amount: number
  status: "POSTED" | "PENDING"
  subcategoryId: number | null
  categorySource: string
  note: string | null
  ignored: boolean
}

export type Carry = Pick<Existing, "subcategoryId" | "categorySource" | "note" | "ignored">

/**
 * Compara o que existe no banco com o que veio da Pluggy para uma conta.
 * - novas → inserts; conhecidas → update só dos campos do banco (edições do usuário nunca são tocadas);
 * - pendentes que sumiram da janela sincronizada → delete; se viraram uma transação confirmada nova
 *   (mesmo valor, até 5 dias), as edições do usuário são herdadas por ela (`carry`).
 */
export function mergeTransactions(existing: Existing[], incoming: Incoming[], windowStart: string | null) {
  const byPluggyId = new Map(existing.filter((e) => e.pluggyId).map((e) => [e.pluggyId!, e]))
  const incomingIds = new Set(incoming.map((i) => i.pluggyId))

  const updates: { id: number; data: Omit<Incoming, "pluggyId"> }[] = []
  const inserts: (Incoming & { carry?: Carry })[] = []
  for (const { pluggyId, ...data } of incoming) {
    const found = byPluggyId.get(pluggyId)
    if (found) updates.push({ id: found.id, data })
    else inserts.push({ pluggyId, ...data })
  }

  const orphans = existing.filter(
    (e) => e.status === "PENDING" && e.pluggyId && !incomingIds.has(e.pluggyId) && (!windowStart || e.date >= windowStart),
  )
  for (const o of orphans) {
    const userTouched = o.categorySource === "USER" || o.note || o.ignored
    if (!userTouched) continue
    const heir = inserts.find(
      (i) => !i.carry && Math.round(i.amount * 100) === Math.round(o.amount * 100) && Math.abs(daysBetween(o.date, i.date)) <= 5,
    )
    if (heir) heir.carry = { subcategoryId: o.subcategoryId, categorySource: o.categorySource, note: o.note, ignored: o.ignored }
  }

  return { inserts, updates, deletes: orphans.map((o) => o.id) }
}

/** Investimento e movimentação da Pluggy (GET /investments, /investments/:id/transactions), só os campos usados. */
export type PluggyInvestment = PluggyInvestmentInfo & {
  id: string
  balance: number
  purchaseDate?: string | null
  amountOriginal?: number | null
  quantity?: number | null
  value?: number | null
  dueDate?: string | null
  issuer?: string | null
  institution?: { name?: string | null } | null
}
export type PluggyInvestmentTx = PluggyInvestmentTxInfo & { movementType: "CREDIT" | "DEBIT" }

/**
 * Aplicações (+) e resgates (−) de um investimento. Sem movimentações (ex.: CDB do Nubank), usa a compra
 * (`purchaseDate` + `amountOriginal`) como aplicação única — só se ainda houver saldo, senão faltaria o resgate.
 * Datas vêm à meia-noite UTC e são só data: cortar a string, não converter fuso.
 */
export function deriveInvestmentMovements(inv: PluggyInvestment, txs: PluggyInvestmentTx[]) {
  if (txs.length)
    return txs.map((t) => ({ pluggyId: t.id, date: t.date.slice(0, 10), amount: t.movementType === "DEBIT" ? -Math.abs(t.amount) : Math.abs(t.amount) }))
  if (inv.balance > 0 && inv.purchaseDate && inv.amountOriginal)
    return [{ pluggyId: `purchase:${inv.id}`, date: inv.purchaseDate.slice(0, 10), amount: inv.amountOriginal }]
  return []
}

/**
 * Operações do ativo (compras, vendas, proventos) pelas movimentações da Pluggy. Sem movimentações, a compra
 * (`purchaseDate` + `amountOriginal`) vira uma compra única, como em `deriveInvestmentMovements`.
 */
export function deriveInvestmentTrades(inv: PluggyInvestment, txs: PluggyInvestmentTx[]) {
  if (txs.length)
    return txs.flatMap((t) => {
      const trade = tradeFromPluggy(t)
      return trade ? [{ pluggyId: t.id, date: t.date.slice(0, 10), fees: 0, ...trade }] : []
    })
  if (inv.balance > 0 && inv.purchaseDate && inv.amountOriginal) {
    const quantity = inv.quantity || null
    return [{ pluggyId: `purchase:${inv.id}`, date: inv.purchaseDate.slice(0, 10), type: "BUY" as const, quantity, price: quantity ? inv.amountOriginal / quantity : null, amount: inv.amountOriginal, fees: 0 }]
  }
  return []
}
