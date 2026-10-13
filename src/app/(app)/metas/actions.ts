"use server"

import { eq } from "drizzle-orm"
import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/auth"
import { db, goalAccounts, goalContributions, goals } from "@/db"
import { fd, parseForm } from "@/lib/form"

export async function saveGoal(form: FormData) {
  await requireUser()
  const v = parseForm(form, {
    id: fd.optId,
    name: fd.text,
    targetAmount: z.coerce.number().positive(),
    deadline: fd.date,
    initialAmount: z.preprocess((x) => x || 0, z.coerce.number().min(0)),
    tracking: z.enum(["ACCOUNT", "CONTRIBUTIONS"]),
  })
  const accountIds = form.getAll("accountIds").map((x) => fd.id.parse(x))
  if (v.tracking === "ACCOUNT" && accountIds.length === 0) throw new Error("Escolha ao menos uma conta para acompanhar")
  const { id, ...data } = v
  await db.transaction(async (tx) => {
    const goalId = id
      ? (await tx.update(goals).set(data).where(eq(goals.id, id)).returning({ id: goals.id }))[0].id
      : (await tx.insert(goals).values(data).returning({ id: goals.id }))[0].id
    await tx.delete(goalAccounts).where(eq(goalAccounts.goalId, goalId))
    if (v.tracking === "ACCOUNT") await tx.insert(goalAccounts).values(accountIds.map((accountId) => ({ goalId, accountId })))
  })
  refresh()
}

export async function archiveGoal(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  await db.update(goals).set({ archived: true }).where(eq(goals.id, id))
  refresh()
}

export async function addContribution(form: FormData) {
  await requireUser()
  const v = parseForm(form, { goalId: fd.id, date: fd.date, amount: fd.money, note: fd.optText })
  if (v.amount === 0) throw new Error("Valor do aporte não pode ser zero")
  await db.insert(goalContributions).values(v)
  refresh()
}

export async function deleteContribution(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  await db.delete(goalContributions).where(eq(goalContributions.id, id))
  refresh()
}
