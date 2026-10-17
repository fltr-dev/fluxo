import "server-only"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { categoryRules, chatActions, db, spendingLimits, transactions } from "@/db"
import { createDebt, payInstallment, type DebtInputValue } from "../debts"
import { deriveKind } from "../domain/categorize"
import { refreshManualBalances, subcategoryKinds } from "../ledger"
import type { ActionView } from "./types"

// Executa (ou cancela) o que o Cofy propôs. Só roda quando o usuário clica em Confirmar; usa as mesmas
// regras do app (categoria define o tipo da transação, saldos manuais recalculados, validação das dívidas).

type Stored = { op: unknown; view: Omit<ActionView, "id" | "kind" | "status" | "result"> }

const txOp = z.object({ accountId: z.number().int(), rows: z.array(z.object({ date: z.string(), description: z.string(), amount: z.number(), subcategoryId: z.number().int().nullable() })).min(1) })
const catOp = z.object({ rows: z.array(z.object({ id: z.number().int(), subcategoryId: z.number().int() })).min(1) })
const payOp = z.object({ debtId: z.number().int(), installmentId: z.number().int().nullable(), amount: z.number().positive(), date: z.string(), transactionId: z.number().int().nullable() })
const ruleOp = z.object({ matchType: z.enum(["CONTAINS", "STARTS_WITH", "REGEX"]), pattern: z.string(), kind: z.enum(["INCOME", "EXPENSE"]).nullable(), subcategoryId: z.number().int() })
const limitOp = z.object({ categoryId: z.number().int(), monthlyAmount: z.number().positive() })

async function run(kind: string, op: unknown): Promise<string> {
  switch (kind) {
    case "transactions": {
      const v = txOp.parse(op)
      const kinds = await subcategoryKinds()
      await db.insert(transactions).values(
        v.rows.map((r) => ({
          accountId: v.accountId,
          date: r.date,
          description: r.description,
          amount: r.amount,
          subcategoryId: r.subcategoryId,
          categorySource: r.subcategoryId ? ("USER" as const) : ("NONE" as const),
          kind: deriveKind(r.amount, r.subcategoryId ? kinds.get(r.subcategoryId) : null),
        })),
      )
      await refreshManualBalances()
      return `${v.rows.length} ${v.rows.length === 1 ? "transação salva" : "transações salvas"}`
    }
    case "categorize": {
      const v = catOp.parse(op)
      const kinds = await subcategoryKinds()
      for (const r of v.rows) {
        const [tx] = await db.select().from(transactions).where(eq(transactions.id, r.id))
        if (!tx) continue
        await db
          .update(transactions)
          .set({ subcategoryId: r.subcategoryId, categorySource: "USER", kind: deriveKind(tx.amount, kinds.get(r.subcategoryId)), transferPairId: null, suggestedSubcategoryId: null, suggestionConfidence: null, updatedAt: new Date() })
          .where(eq(transactions.id, r.id))
      }
      return `${v.rows.length} ${v.rows.length === 1 ? "transação categorizada" : "transações categorizadas"}`
    }
    case "debt": {
      await createDebt(op as DebtInputValue)
      return "Dívida salva"
    }
    case "payment": {
      const v = payOp.parse(op)
      await payInstallment({ debtId: v.debtId, installmentId: v.installmentId, amount: v.amount, date: v.date, transactionId: v.transactionId })
      return "Pagamento registrado"
    }
    case "rule": {
      await db.insert(categoryRules).values({ priority: 100, ...ruleOp.parse(op) })
      return "Regra criada"
    }
    case "limit": {
      const v = limitOp.parse(op)
      await db.insert(spendingLimits).values(v).onConflictDoUpdate({ target: spendingLimits.categoryId, set: { monthlyAmount: v.monthlyAmount } })
      return "Limite salvo"
    }
    default:
      throw new Error(`Ação desconhecida: ${kind}`)
  }
}

export const toActionView = (row: typeof chatActions.$inferSelect): ActionView => ({ id: row.id, kind: row.kind, status: row.status, result: row.result, ...(row.payload as Stored).view })

/** Confirma uma ação pendente. Idempotente: confirmar de novo uma ação já feita devolve o estado atual. */
export async function confirmAction(id: number): Promise<ActionView> {
  const [row] = await db.select().from(chatActions).where(eq(chatActions.id, id))
  if (!row) throw new Error("Ação não encontrada")
  if (row.status !== "PENDING") return toActionView(row)
  // reserva a ação antes de executar: dois cliques seguidos não gravam duas vezes
  const [claimed] = await db.update(chatActions).set({ status: "DONE", result: "Salvando…" }).where(and(eq(chatActions.id, id), eq(chatActions.status, "PENDING"))).returning()
  if (!claimed) return toActionView((await db.select().from(chatActions).where(eq(chatActions.id, id)))[0])
  try {
    const result = await run(row.kind, (row.payload as Stored).op)
    const [done] = await db.update(chatActions).set({ result }).where(eq(chatActions.id, id)).returning()
    return toActionView(done)
  } catch (e) {
    await db.update(chatActions).set({ status: "PENDING", result: null }).where(eq(chatActions.id, id))
    throw e instanceof Error ? e : new Error("Não foi possível salvar")
  }
}

export async function cancelAction(id: number): Promise<ActionView> {
  const [row] = await db.update(chatActions).set({ status: "CANCELLED", result: "Cancelado · nada foi salvo" }).where(and(eq(chatActions.id, id), eq(chatActions.status, "PENDING"))).returning()
  if (row) return toActionView(row)
  const [cur] = await db.select().from(chatActions).where(eq(chatActions.id, id))
  if (!cur) throw new Error("Ação não encontrada")
  return toActionView(cur)
}
