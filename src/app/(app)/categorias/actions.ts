"use server"

import { and, eq, ne, sql } from "drizzle-orm"
import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/auth"
import { categories, categoryRules, db, pluggyCategoryMap, spendingLimits, transactions } from "@/db"
import { SEED_CATEGORIES, SEED_PLUGGY_MAP } from "@/db/seed-data"
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
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(categories)
  if (count > 0) return
  const ids = new Map<string, number>()
  for (const c of SEED_CATEGORIES) {
    const [p] = await db.insert(categories).values({ name: c.name, kind: c.kind, color: c.color, icon: c.icon }).returning({ id: categories.id })
    const subs = await db
      .insert(categories)
      .values(c.subs.map((name) => ({ name, kind: c.kind, color: c.color, parentId: p.id })))
      .returning({ id: categories.id, name: categories.name })
    for (const s of subs) ids.set(`${c.name}/${s.name}`, s.id)
  }
  await db
    .insert(pluggyCategoryMap)
    .values(Object.entries(SEED_PLUGGY_MAP).map(([pluggyCategory, path]) => ({ pluggyCategory, subcategoryId: ids.get(path)! })))
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

export async function toggleArchived(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  await db.update(categories).set({ archived: sql`not ${categories.archived}` }).where(eq(categories.id, id))
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
