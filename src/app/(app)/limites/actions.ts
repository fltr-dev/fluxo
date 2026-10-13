"use server"

import { eq } from "drizzle-orm"
import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/auth"
import { categories, db, spendingLimits } from "@/db"
import { fd, parseForm } from "@/lib/form"

export async function saveLimit(form: FormData) {
  await requireUser()
  const { categoryId, monthlyAmount } = parseForm(form, { categoryId: fd.id, monthlyAmount: z.coerce.number().positive() })
  const [c] = await db.select().from(categories).where(eq(categories.id, categoryId))
  if (c?.kind !== "EXPENSE") throw new Error("Limites valem só para categorias de despesa")
  await db
    .insert(spendingLimits)
    .values({ categoryId, monthlyAmount })
    .onConflictDoUpdate({ target: spendingLimits.categoryId, set: { monthlyAmount } })
  refresh()
}

export async function deleteLimit(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  await db.delete(spendingLimits).where(eq(spendingLimits.id, id))
  refresh()
}
