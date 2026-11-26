"use server"

import { and, eq, inArray, isNull } from "drizzle-orm"
import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/auth"
import { db, transactions } from "@/db"
import { deriveKind } from "@/lib/domain/categorize"
import { fd, parseForm } from "@/lib/form"
import { refreshManualBalances, subcategoryKinds, withInstallments } from "@/lib/ledger"

const noSuggestion = { suggestedSubcategoryId: null, suggestionConfidence: null }

async function getTx(id: number) {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, id))
  if (!tx) throw new Error("Transação não encontrada")
  return tx
}

/** Desfaz o vínculo do par (o outro lado continua transferência, sem par). */
async function unlinkPair(tx: { id: number; transferPairId: number | null }) {
  if (tx.transferPairId) await db.update(transactions).set({ transferPairId: null }).where(eq(transactions.id, tx.transferPairId))
}

// Desfazer: o estado da categoria antes da ação, devolvido ao cliente para o toast "Desfazer"
const snapshotShape = z.object({
  id: z.number().int().positive(),
  subcategoryId: z.number().int().positive().nullable(),
  categorySource: z.enum(["USER", "RULE", "JEV", "PLUGGY_MAP", "NONE"]),
  kind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  transferPairId: z.number().int().positive().nullable(),
  suggestedSubcategoryId: z.number().int().positive().nullable(),
  suggestionConfidence: z.number().nullable(),
  ignored: z.boolean(),
})
export type Snapshot = z.infer<typeof snapshotShape>
export type Undo = { message: string; undo: Snapshot[] }

const snapshot = (t: typeof transactions.$inferSelect): Snapshot => ({
  id: t.id,
  subcategoryId: t.subcategoryId,
  categorySource: t.categorySource,
  kind: t.kind,
  transferPairId: t.transferPairId,
  suggestedSubcategoryId: t.suggestedSubcategoryId,
  suggestionConfidence: t.suggestionConfidence,
  ignored: t.ignored,
})

/** Volta as transações ao estado de antes (inclusive a sugestão da IA e o par de transferência). */
export async function restoreCategories(snaps: Snapshot[]) {
  await requireUser()
  for (const { id, ...s } of z.array(snapshotShape).max(500).parse(snaps)) {
    await db.update(transactions).set({ ...s, updatedAt: new Date() }).where(eq(transactions.id, id))
    if (s.transferPairId) await db.update(transactions).set({ transferPairId: id }).where(eq(transactions.id, s.transferPairId))
  }
  refresh()
}

type Tx = typeof transactions.$inferSelect

async function categorizeOne(tx: Tx, subcategoryId: number | null, kinds: Map<number, "INCOME" | "EXPENSE">) {
  await unlinkPair(tx)
  await db
    .update(transactions)
    .set({
      subcategoryId,
      categorySource: "USER",
      kind: deriveKind(tx.amount, subcategoryId ? kinds.get(subcategoryId) : null),
      transferPairId: null,
      ...noSuggestion,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, tx.id))
  return snapshot(tx)
}

/** Categoriza a transação e as outras parcelas da compra; `done` evita repetir (e sobrescrever o desfazer) no lote. */
async function categorize(id: number, subcategoryId: number | null, kinds: Map<number, "INCOME" | "EXPENSE">, done = new Set<number>()) {
  if (subcategoryId && !kinds.has(subcategoryId)) throw new Error("Subcategoria inválida")
  const undo: Snapshot[] = []
  for (const t of await withInstallments(await getTx(id))) {
    if (done.has(t.id)) continue
    done.add(t.id)
    undo.push(await categorizeOne(t, subcategoryId, kinds))
  }
  return undo
}

const installmentsNote = (n: number) => (n > 1 ? ` em ${n} parcelas` : "")

export async function setCategory(form: FormData): Promise<Undo> {
  await requireUser()
  const { id, subcategoryId } = parseForm(form, { id: fd.id, subcategoryId: fd.optId })
  const undo = await categorize(id, subcategoryId, await subcategoryKinds())
  refresh()
  const message = subcategoryId
    ? `Categoria alterada${installmentsNote(undo.length)}`
    : undo.length > 1
      ? `${undo.length} parcelas voltaram para A categorizar`
      : "Transação voltou para A categorizar"
  return { message, undo }
}

export async function acceptSuggestion(form: FormData): Promise<Undo | undefined> {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  const tx = await getTx(id)
  if (!tx.suggestedSubcategoryId) return
  const undo = await categorize(id, tx.suggestedSubcategoryId, await subcategoryKinds())
  refresh()
  return { message: `Sugestão aceita${installmentsNote(undo.length)}`, undo }
}

export async function rejectSuggestion(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  await db.update(transactions).set(noSuggestion).where(eq(transactions.id, id))
  refresh()
}

export async function setNote(form: FormData) {
  await requireUser()
  const { id, note } = parseForm(form, { id: fd.id, note: fd.optText })
  await db.update(transactions).set({ note, updatedAt: new Date() }).where(eq(transactions.id, id))
  refresh()
}

export async function toggleIgnored(form: FormData): Promise<Undo> {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  const tx = await getTx(id)
  await db.update(transactions).set({ ignored: !tx.ignored, updatedAt: new Date() }).where(eq(transactions.id, id))
  refresh()
  return { message: tx.ignored ? "Transação volta a contar nos relatórios" : "Transação ignorada nos relatórios", undo: [snapshot(tx)] }
}

export async function markTransfer(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  await db
    .update(transactions)
    .set({ kind: "TRANSFER", subcategoryId: null, categorySource: "USER", ...noSuggestion, updatedAt: new Date() })
    .where(eq(transactions.id, id))
  refresh()
}

/** Desfaz a transferência dos dois lados do par; a decisão do usuário impede nova detecção automática. */
export async function unmarkTransfer(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  const tx = await getTx(id)
  const ids = [tx, ...(tx.transferPairId ? [await getTx(tx.transferPairId)] : [])]
  for (const t of ids) {
    await db
      .update(transactions)
      .set({ kind: deriveKind(t.amount, null), transferPairId: null, categorySource: "USER", updatedAt: new Date() })
      .where(eq(transactions.id, t.id))
  }
  refresh()
}

const manualShape = {
  accountId: fd.id,
  date: fd.date,
  description: fd.text,
  amount: z.coerce.number().positive(),
  direction: z.enum(["despesa", "receita"]),
  subcategoryId: fd.optId,
  note: fd.optText,
}

async function manualValues(form: FormData) {
  const v = parseForm(form, manualShape)
  const kinds = await subcategoryKinds()
  if (v.subcategoryId && !kinds.has(v.subcategoryId)) throw new Error("Subcategoria inválida")
  const amount = v.direction === "despesa" ? -v.amount : v.amount
  return {
    accountId: v.accountId,
    date: v.date,
    description: v.description,
    amount,
    subcategoryId: v.subcategoryId,
    categorySource: v.subcategoryId ? ("USER" as const) : ("NONE" as const),
    kind: deriveKind(amount, v.subcategoryId ? kinds.get(v.subcategoryId) : null),
    note: v.note,
  }
}

export async function createManual(form: FormData) {
  await requireUser()
  await db.insert(transactions).values(await manualValues(form))
  await refreshManualBalances()
  refresh()
}

// Só transações manuais (sem pluggyId) podem ter valor/data alterados ou ser excluídas
export async function updateManual(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  await db
    .update(transactions)
    .set({ ...(await manualValues(form)), updatedAt: new Date() })
    .where(and(eq(transactions.id, id), isNull(transactions.pluggyId)))
  await refreshManualBalances()
  refresh()
}

export async function deleteManual(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  await db.delete(transactions).where(and(eq(transactions.id, id), isNull(transactions.pluggyId)))
  await refreshManualBalances()
  refresh()
}

/** Ações em lote da lista: categorizar (mesma regra do individual) ou ignorar nos relatórios. */
export async function bulkUpdate(form: FormData): Promise<Undo | undefined> {
  await requireUser()
  const ids = z.array(fd.id).min(1).max(500).parse(form.getAll("ids"))
  const op = z.enum(["categorizar", "ignorar"]).parse(form.get("op"))
  if (op === "ignorar") {
    const before = await db.select().from(transactions).where(inArray(transactions.id, ids))
    await db.update(transactions).set({ ignored: true, updatedAt: new Date() }).where(inArray(transactions.id, ids))
    refresh()
    return { message: `${ids.length} ${ids.length === 1 ? "transação ignorada" : "transações ignoradas"}`, undo: before.map(snapshot) }
  }
  const { subcategoryId } = parseForm(form, { subcategoryId: fd.optId })
  const kinds = await subcategoryKinds()
  const undo: Snapshot[] = []
  const done = new Set<number>()
  for (const id of ids) undo.push(...(await categorize(id, subcategoryId, kinds, done)))
  refresh()
  return { message: `${undo.length} ${undo.length === 1 ? "transação categorizada" : "transações categorizadas"}`, undo }
}
