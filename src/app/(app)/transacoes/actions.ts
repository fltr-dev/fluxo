"use server"

import { and, eq, inArray, isNull } from "drizzle-orm"
import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/auth"
import { db, transactions } from "@/db"
import { deriveKind } from "@/lib/domain/categorize"
import { fd, parseForm } from "@/lib/form"
import { refreshManualBalances, subcategoryKinds } from "@/lib/ledger"

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

export async function setCategory(form: FormData) {
  await requireUser()
  const { id, subcategoryId } = parseForm(form, { id: fd.id, subcategoryId: fd.optId })
  const tx = await getTx(id)
  const kinds = await subcategoryKinds()
  if (subcategoryId && !kinds.has(subcategoryId)) throw new Error("Subcategoria inválida")
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
    .where(eq(transactions.id, id))
  refresh()
}

export async function acceptSuggestion(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  const tx = await getTx(id)
  if (!tx.suggestedSubcategoryId) return
  const kinds = await subcategoryKinds()
  await db
    .update(transactions)
    .set({
      subcategoryId: tx.suggestedSubcategoryId,
      categorySource: "USER",
      kind: deriveKind(tx.amount, kinds.get(tx.suggestedSubcategoryId)),
      ...noSuggestion,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, id))
  refresh()
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

export async function toggleIgnored(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  const tx = await getTx(id)
  await db.update(transactions).set({ ignored: !tx.ignored, updatedAt: new Date() }).where(eq(transactions.id, id))
  refresh()
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
export async function bulkUpdate(form: FormData) {
  await requireUser()
  const ids = z.array(fd.id).min(1).max(500).parse(form.getAll("ids"))
  const op = z.enum(["categorizar", "ignorar"]).parse(form.get("op"))
  if (op === "ignorar") {
    await db.update(transactions).set({ ignored: true, updatedAt: new Date() }).where(inArray(transactions.id, ids))
  } else {
    for (const id of ids) {
      const one = new FormData()
      one.set("id", String(id))
      one.set("subcategoryId", String(form.get("subcategoryId") ?? ""))
      await setCategory(one)
    }
  }
  refresh()
}
