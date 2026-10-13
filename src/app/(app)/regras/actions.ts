"use server"

import { and, eq, ne } from "drizzle-orm"
import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireUser } from "@/auth"
import { categoryRules, db, transactions } from "@/db"
import { deriveKind, matchRule } from "@/lib/domain/categorize"
import { fd, parseForm } from "@/lib/form"
import { subcategoryKinds } from "@/lib/ledger"

export async function saveRule(form: FormData) {
  await requireUser()
  const v = parseForm(form, {
    id: fd.optId,
    priority: z.coerce.number().int().min(0).max(10000),
    matchType: z.enum(["CONTAINS", "STARTS_WITH", "REGEX"]),
    pattern: fd.text,
    accountId: fd.optId,
    kind: z.preprocess((x) => x || null, z.enum(["INCOME", "EXPENSE"]).nullable()),
    minAmount: fd.optMoney,
    maxAmount: fd.optMoney,
    subcategoryId: fd.id,
  })
  if (v.matchType === "REGEX") {
    try {
      new RegExp(v.pattern)
    } catch {
      throw new Error("Expressão regular inválida")
    }
  }
  const { id, ...data } = v
  if (id) await db.update(categoryRules).set(data).where(eq(categoryRules.id, id))
  else await db.insert(categoryRules).values(data)
  redirect("/regras")
}

export async function deleteRule(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  await db.delete(categoryRules).where(eq(categoryRules.id, id))
  refresh()
}

export async function toggleRule(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  const [r] = await db.select().from(categoryRules).where(eq(categoryRules.id, id))
  if (r) await db.update(categoryRules).set({ active: !r.active }).where(eq(categoryRules.id, id))
  refresh()
}

/** Reaplica as regras ativas nas transações existentes que o usuário não categorizou à mão. */
export async function applyRulesToExisting() {
  await requireUser()
  const [rules, kinds, txs] = await Promise.all([
    db.select().from(categoryRules).where(eq(categoryRules.active, true)),
    subcategoryKinds(),
    db.select().from(transactions).where(and(ne(transactions.categorySource, "USER"), ne(transactions.kind, "TRANSFER"))),
  ])
  const changes = txs.flatMap((t) => {
    const rule = matchRule(rules, t)
    return rule && rule.subcategoryId !== t.subcategoryId ? [{ id: t.id, amount: t.amount, subcategoryId: rule.subcategoryId }] : []
  })
  // ponytail: um UPDATE por transação alterada; ok para o volume de uso pessoal
  await Promise.all(
    changes.map((c) =>
      db
        .update(transactions)
        .set({ subcategoryId: c.subcategoryId, categorySource: "RULE", kind: deriveKind(c.amount, kinds.get(c.subcategoryId)), updatedAt: new Date() })
        .where(eq(transactions.id, c.id)),
    ),
  )
  redirect(`/regras?aplicadas=${changes.length}`)
}
