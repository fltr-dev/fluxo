import { daysBetween, toLocalDate } from "./dates"

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
