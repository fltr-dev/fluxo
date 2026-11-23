"use server"

import { and, eq, ne } from "drizzle-orm"
import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireUser } from "@/auth"
import { categoryRules, db, transactions } from "@/db"
import { deriveKind, matchRule, ruleMatches, type Rule } from "@/lib/domain/categorize"
import { fd, parseForm } from "@/lib/form"
import { subcategoryKinds } from "@/lib/ledger"

const MATCH_TYPES = ["CONTAINS", "STARTS_WITH", "EQUALS", "REGEX"] as const

export async function saveRule(form: FormData) {
  await requireUser()
  const { apply, ...v } = parseForm(form, {
    id: fd.optId,
    priority: z.coerce.number().int().min(0).max(10000),
    matchType: z.enum(MATCH_TYPES),
    pattern: fd.text,
    accountId: fd.optId,
    kind: z.preprocess((x) => x || null, z.enum(["INCOME", "EXPENSE"]).nullable()),
    minAmount: fd.optMoney,
    maxAmount: fd.optMoney,
    subcategoryId: fd.id,
    apply: z.preprocess((x) => x === "on", z.boolean()),
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
  redirect(apply ? `/regras?aplicadas=${await reapplyRules()}` : "/regras")
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

/** Transações que as regras podem tocar: tudo menos transferências (as categorizadas à mão ficam de fora depois). */
const candidates = () => db.select().from(transactions).where(ne(transactions.kind, "TRANSFER"))

/** Reaplica as regras ativas nas transações existentes que o usuário não categorizou à mão. Devolve quantas mudaram. */
async function reapplyRules() {
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
  return changes.length
}

export async function applyRulesToExisting() {
  await requireUser()
  redirect(`/regras?aplicadas=${await reapplyRules()}`)
}

export type RuleDraft = Pick<Rule, "matchType" | "pattern" | "accountId" | "kind" | "minAmount" | "maxAmount" | "priority"> & { id?: number; subcategoryId: number | null }
export type PreviewRow = { id: number; description: string; date: string; amount: number; status: "change" | "user" | "same" }

/**
 * Prévia ao vivo do formulário de regra: transações que a regra casaria e o que aconteceria com cada uma ao aplicar.
 * "change" = seria recategorizada (a regra vence as outras pela prioridade e muda a categoria); "user" = categorizada
 * à mão (mantida); "same" = já está assim ou outra regra de prioridade maior vence.
 */
export async function previewRule(draft: RuleDraft) {
  await requireUser({ allowDemo: true }) // só lê
  if (!draft.pattern.trim()) return { total: 0, change: 0, user: 0, sample: [] as PreviewRow[] }
  const [rules, txs] = await Promise.all([db.select().from(categoryRules).where(eq(categoryRules.active, true)), candidates()])
  // ponytail: filtra em memória todas as transações a cada prévia; ok para o volume de uso pessoal
  // regra nova ganha o maior id: no empate de prioridade perde para as existentes, como depois de salva
  const me: Rule = { ...draft, id: draft.id ?? Number.MAX_SAFE_INTEGER, subcategoryId: draft.subcategoryId ?? -1, active: true }
  const all = [...rules.filter((r) => r.id !== draft.id), me]
  const rows: PreviewRow[] = txs
    .filter((t) => ruleMatches(me, t))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) => ({
      id: t.id,
      description: t.description,
      date: t.date,
      amount: t.amount,
      status: t.categorySource === "USER" ? "user" : matchRule(all, t) === me && t.subcategoryId !== draft.subcategoryId ? "change" : "same",
    }))
  return {
    total: rows.length,
    change: rows.filter((r) => r.status === "change").length,
    user: rows.filter((r) => r.status === "user").length,
    sample: rows.slice(0, 8),
  }
}
