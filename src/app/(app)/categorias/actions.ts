"use server"

import { and, eq, inArray, ne, sql } from "drizzle-orm"
import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/auth"
import { categories, categoryRules, db, pluggyCategoryMap, spendingLimits, transactions } from "@/db"
import { addDefaultCategory, seedCategories } from "@/db/default-categories"
import { lucideByName } from "@/components/category-icon"
import { fd, parseForm } from "@/lib/form"

const color = z.string().regex(/^#[0-9a-f]{6}$/i)
// Nome do ícone do Lucide: "" apaga (volta ao padrão), ausente não mexe; precisa existir na biblioteca
const icon = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .string()
    .regex(/^[A-Za-z0-9]{1,64}$/)
    .refine((n) => !!lucideByName(n), "Ícone inválido")
    .nullable()
    .optional(),
)

export async function seedDefaults() {
  await requireUser()
  await db.transaction(async (tx) => {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(categories)
    if (count === 0) await seedCategories(tx)
  })
  refresh()
}

export async function createCategory(form: FormData) {
  await requireUser()
  const v = parseForm(form, { name: fd.text, kind: z.enum(["INCOME", "EXPENSE"]).optional(), color: color.optional(), icon, parentId: fd.optId })
  if (v.parentId) {
    const [p] = await db.select().from(categories).where(eq(categories.id, v.parentId))
    if (!p || p.parentId) throw new Error("Categoria-pai inválida")
    await db.insert(categories).values({ name: v.name, kind: p.kind, color: p.color, parentId: p.id })
  } else {
    await db.insert(categories).values({ name: v.name, kind: v.kind ?? "EXPENSE", color: v.color ?? "#64748b", icon: v.icon ?? null })
  }
  refresh()
}

export async function updateCategory(form: FormData) {
  await requireUser()
  const v = parseForm(form, { id: fd.id, name: fd.text, color: color.optional(), icon })
  await db
    .update(categories)
    .set({ name: v.name, ...(v.color && { color: v.color }), ...(v.icon !== undefined && { icon: v.icon }) })
    .where(eq(categories.id, v.id))
  refresh()
}

/** Ids da categoria e das subcategorias dela. */
async function familyIds(id: number) {
  const subs = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, id))
  return [id, ...subs.map((s) => s.id)]
}

const txCount = async (ids: number[]) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(transactions).where(inArray(transactions.subcategoryId, ids)))[0].n

/** Reativa direto; arquivar só sem transações (com transações o caminho é `retireCategory`, que pede o destino). */
export async function toggleArchived(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  const [cat] = await db.select().from(categories).where(eq(categories.id, id))
  if (!cat) return
  if (!cat.archived && (await txCount(await familyIds(id)))) throw new Error("A categoria tem transações: escolha para onde movê-las")
  await db.update(categories).set({ archived: !cat.archived }).where(eq(categories.id, id))
  refresh()
}

/**
 * Arquiva ou exclui (só se já arquivada) depois de tirar as transações dela: vão para `targetId` ou ficam
 * "A categorizar". Regras e mapeamentos da Pluggy seguem o destino; sem destino, regras param e mapeamentos saem.
 */
export async function retireCategory(form: FormData) {
  await requireUser()
  const { id, action, targetId } = parseForm(form, { id: fd.id, action: z.enum(["archive", "delete"]), targetId: fd.optId })
  const [cat] = await db.select().from(categories).where(eq(categories.id, id))
  if (!cat) return
  if (action === "delete" && !cat.archived) throw new Error("Arquive antes de excluir")
  const ids = await familyIds(id)
  const [target] = targetId ? await db.select().from(categories).where(eq(categories.id, targetId)) : []
  if (targetId && (!target?.parentId || ids.includes(targetId))) throw new Error("Destino inválido")
  await db.transaction(async (tx) => {
    if (target) {
      await tx
        .update(transactions)
        .set({ subcategoryId: target.id, kind: target.kind })
        .where(and(inArray(transactions.subcategoryId, ids), ne(transactions.kind, "TRANSFER")))
      await tx.update(categoryRules).set({ subcategoryId: target.id }).where(inArray(categoryRules.subcategoryId, ids))
      await tx.update(pluggyCategoryMap).set({ subcategoryId: target.id }).where(inArray(pluggyCategoryMap.subcategoryId, ids))
    } else {
      await tx.update(categoryRules).set({ active: false }).where(inArray(categoryRules.subcategoryId, ids))
      await tx.delete(pluggyCategoryMap).where(inArray(pluggyCategoryMap.subcategoryId, ids))
    }
    await tx.update(transactions).set({ subcategoryId: null, categorySource: "NONE" }).where(inArray(transactions.subcategoryId, ids))
    await tx.update(transactions).set({ suggestedSubcategoryId: target?.id ?? null }).where(inArray(transactions.suggestedSubcategoryId, ids))
    if (action === "delete") await tx.delete(categories).where(eq(categories.id, id))
    else await tx.update(categories).set({ archived: true }).where(eq(categories.id, id))
  })
  refresh()
}

export async function addSuggestion(form: FormData) {
  await requireUser()
  const { name } = parseForm(form, { name: fd.text })
  await db.transaction((tx) => addDefaultCategory(tx, name))
  refresh()
}

/** Move tudo da subcategoria de origem para a de destino e apaga a origem. */
export async function mergeSubcategories(form: FormData) {
  await requireUser()
  const { sourceId, targetId } = parseForm(form, { sourceId: fd.id, targetId: fd.id })
  if (sourceId === targetId) return
  const [source, target] = await Promise.all([sourceId, targetId].map(async (id) => (await db.select().from(categories).where(eq(categories.id, id)))[0]))
  if (!source?.parentId || !target?.parentId) throw new Error("Escolha duas subcategorias")
  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({ subcategoryId: targetId, ...(source.kind !== target.kind && { kind: target.kind }) })
      .where(and(eq(transactions.subcategoryId, sourceId), ne(transactions.kind, "TRANSFER")))
    await tx.update(transactions).set({ suggestedSubcategoryId: targetId }).where(eq(transactions.suggestedSubcategoryId, sourceId))
    await tx.update(categoryRules).set({ subcategoryId: targetId }).where(eq(categoryRules.subcategoryId, sourceId))
    await tx.update(pluggyCategoryMap).set({ subcategoryId: targetId }).where(eq(pluggyCategoryMap.subcategoryId, sourceId))
    // Limite é único por categoria: mantém o do destino se já existir
    const [targetLimit] = await tx.select().from(spendingLimits).where(eq(spendingLimits.categoryId, targetId))
    if (!targetLimit) await tx.update(spendingLimits).set({ categoryId: targetId }).where(eq(spendingLimits.categoryId, sourceId))
    await tx.delete(categories).where(eq(categories.id, sourceId))
  })
  refresh()
}

export async function setPluggyMapping(form: FormData) {
  await requireUser()
  const { pluggyCategory, subcategoryId } = parseForm(form, { pluggyCategory: fd.text, subcategoryId: fd.optId })
  if (!subcategoryId) await db.delete(pluggyCategoryMap).where(eq(pluggyCategoryMap.pluggyCategory, pluggyCategory))
  else
    await db
      .insert(pluggyCategoryMap)
      .values({ pluggyCategory, subcategoryId })
      .onConflictDoUpdate({ target: pluggyCategoryMap.pluggyCategory, set: { subcategoryId } })
  refresh()
}
