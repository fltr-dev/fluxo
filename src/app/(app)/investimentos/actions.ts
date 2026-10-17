"use server"

import { and, eq, isNull } from "drizzle-orm"
import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireUser } from "@/auth"
import { accounts, db, investments, investmentTargets, investmentTrades } from "@/db"
import { today } from "@/lib/domain/dates"
import { ASSET_CLASSES, classFromCode, isIncome, isVariable } from "@/lib/domain/investments"
import { fd, parseForm } from "@/lib/form"
import { snapshotBalances } from "@/lib/ledger"
import { refreshManualPosition, refreshManualQuotes, updateMarketSeries } from "@/lib/market"

const assetClass = z.enum(ASSET_CLASSES)
const tradeType = z.enum(["BUY", "SELL", "BONUS", "DIVIDEND", "JCP", "YIELD", "INTEREST"])
const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v)
const optNum = z.preprocess(blankToNull, z.coerce.number().finite().nonnegative().nullable())
const optDate = z.preprocess(blankToNull, fd.date.nullable())
const code = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null), z.string().max(20).regex(/^[A-Z0-9.\-]+$/).nullable())
// Volta para a tela de onde o formulário saiu (só dentro de Investimentos)
const back = z.preprocess((v) => (typeof v === "string" && /^\/investimentos(\/[\w/-]*)?$/.test(v) ? v : "/investimentos"), z.string())

async function done(path: string) {
  await snapshotBalances(today())
  refresh()
  redirect(path)
}

/** Ativo lançado à mão (cripto, corretora sem Open Finance) com a primeira operação. */
export async function createInvestment(form: FormData) {
  await requireUser()
  const v = parseForm(form, {
    back,
    name: fd.text,
    code,
    assetClass: z.preprocess(blankToNull, assetClass.nullable()),
    broker: fd.optText,
    date: fd.date,
    quantity: optNum,
    price: optNum,
    amount: optNum,
    fees: optNum,
    rateLabel: fd.optText,
    dueDate: optDate,
  })
  const cls = v.assetClass ?? classFromCode(v.code) ?? "OUTROS"
  const variable = isVariable(cls)
  const amount = variable ? (v.quantity ?? 0) * (v.price ?? 0) : (v.amount ?? 0)
  if (variable && !(v.quantity && v.price)) throw new Error("Informe quantidade e preço")
  if (!variable && !amount) throw new Error("Informe o valor aplicado")

  const [acc] = await db.insert(accounts).values({ name: v.name, type: "SAVINGS_INVESTMENT", source: "MANUAL" }).returning({ id: accounts.id })
  const [inv] = await db
    .insert(investments)
    .values({ accountId: acc.id, assetClass: cls, code: v.code, name: v.name, broker: v.broker, unitPrice: variable ? v.price : null, rateLabel: variable ? null : v.rateLabel, dueDate: variable ? null : v.dueDate })
    .returning({ id: investments.id })
  await db.insert(investmentTrades).values({ investmentId: inv.id, date: v.date, type: "BUY", quantity: variable ? v.quantity : null, price: variable ? v.price : null, amount, fees: v.fees ?? 0 })
  await refreshManualPosition(inv.id)
  // cotação do dia, se a fonte responder (senão fica o preço da compra)
  if (variable && v.code) await refreshManualQuotes().catch(() => null)
  await done(`/investimentos/ativos/${inv.id}`)
}

/** Compra, venda, bonificação ou provento. Nos ativos da Pluggy só proventos: a posição vem da corretora. */
export async function addTrade(form: FormData) {
  await requireUser()
  const v = parseForm(form, { back, investmentId: fd.id, type: tradeType, date: fd.date, quantity: optNum, price: optNum, amount: optNum, fees: optNum, note: fd.optText })
  const [inv] = await db.select().from(investments).where(eq(investments.id, v.investmentId))
  if (!inv) throw new Error("Ativo não encontrado")
  if (inv.pluggyId && !isIncome(v.type)) throw new Error("A posição deste ativo vem da corretora; aqui dá para lançar só proventos")
  const variable = isVariable(inv.assetClassOverride ?? inv.assetClass)
  const byQty = variable && (v.type === "BUY" || v.type === "SELL")
  const amount = byQty ? (v.quantity ?? 0) * (v.price ?? 0) : (v.amount ?? 0)
  if (byQty && !(v.quantity && v.price)) throw new Error("Informe quantidade e preço")
  if (v.type === "BONUS" && !v.quantity) throw new Error("Informe a quantidade recebida")
  if (v.type !== "BONUS" && !amount) throw new Error("Informe o valor")
  await db.insert(investmentTrades).values({
    investmentId: inv.id,
    date: v.date,
    type: v.type,
    quantity: byQty || v.type === "BONUS" ? v.quantity : isIncome(v.type) ? v.quantity : null,
    price: byQty ? v.price : null,
    amount,
    fees: v.fees ?? 0,
    note: v.note,
  })
  await refreshManualPosition(inv.id)
  await done(v.back)
}

/** Só lançamentos manuais; os da Pluggy voltariam na próxima sincronização. */
export async function deleteTrade(form: FormData) {
  await requireUser()
  const v = parseForm(form, { back, id: fd.id })
  const [t] = await db.delete(investmentTrades).where(and(eq(investmentTrades.id, v.id), isNull(investmentTrades.pluggyId))).returning({ investmentId: investmentTrades.investmentId })
  if (t) await refreshManualPosition(t.investmentId)
  await done(v.back)
}

/**
 * Categoria (vale sobre a detectada), nome, ticker e corretora. Nos manuais também a cotação (renda variável)
 * ou o saldo atual (renda fixa), enquanto não há fonte automática.
 */
export async function updateInvestment(form: FormData) {
  await requireUser()
  const v = parseForm(form, {
    back,
    id: fd.id,
    name: fd.text,
    code,
    assetClass: z.preprocess(blankToNull, assetClass.nullable()),
    broker: fd.optText,
    rateLabel: fd.optText,
    dueDate: optDate,
    unitPrice: optNum,
    currentValue: optNum,
  })
  const [inv] = await db.select().from(investments).where(eq(investments.id, v.id))
  if (!inv) throw new Error("Ativo não encontrado")
  const override = v.assetClass && v.assetClass !== inv.assetClass ? v.assetClass : null
  const cls = override ?? inv.assetClass
  await db.update(accounts).set({ name: v.name }).where(eq(accounts.id, inv.accountId))
  await db
    .update(investments)
    .set({
      assetClassOverride: override,
      // dados que a Pluggy manda não são editáveis nos ativos dela
      ...(!inv.pluggyId && {
        code: v.code,
        broker: v.broker,
        rateLabel: v.rateLabel,
        dueDate: v.dueDate,
        ...(isVariable(cls) && v.unitPrice != null && { unitPrice: v.unitPrice, priceUpdatedAt: new Date() }),
      }),
    })
    .where(eq(investments.id, inv.id))
  if (!inv.pluggyId) {
    if (!isVariable(cls) && v.currentValue != null) {
      await db.update(accounts).set({ balance: v.currentValue }).where(eq(accounts.id, inv.accountId))
      await db.update(investments).set({ priceUpdatedAt: new Date() }).where(eq(investments.id, inv.id))
    }
    await refreshManualPosition(inv.id)
  }
  await done(v.back)
}

/** Exclui um ativo manual com operações e histórico. Os da Pluggy saem arquivando a conta em Contas. */
export async function deleteInvestment(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  const [inv] = await db.select().from(investments).where(and(eq(investments.id, id), isNull(investments.pluggyId)))
  if (!inv) throw new Error("Só ativos lançados à mão podem ser excluídos")
  await db.delete(accounts).where(eq(accounts.id, inv.accountId))
  refresh()
  redirect("/investimentos/ativos")
}

/** Alocação-alvo: % por categoria, somando 100 (tudo vazio remove o alvo). */
export async function saveTargets(form: FormData) {
  await requireUser()
  const { back: to } = parseForm(form, { back })
  const rows = ASSET_CLASSES.flatMap((c) => {
    const raw = form.get(`t_${c}`)
    const n = raw === null || raw === "" ? 0 : Number(String(raw).replace(",", "."))
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Percentual inválido")
    return n > 0 ? [{ assetClass: c, percent: n }] : []
  })
  const sum = rows.reduce((s, r) => s + r.percent, 0)
  if (rows.length && Math.abs(sum - 100) > 0.01) throw new Error(`A soma precisa dar 100% (está em ${sum.toLocaleString("pt-BR")}%)`)
  await db.delete(investmentTargets)
  if (rows.length) await db.insert(investmentTargets).values(rows)
  refresh()
  redirect(to)
}

/** Busca agora os índices e as cotações dos ativos manuais (a sincronização diária também faz isso). */
export async function refreshMarket(form: FormData) {
  await requireUser()
  const { back: to } = parseForm(form, { back })
  await updateMarketSeries().catch(() => [])
  await refreshManualQuotes().catch(() => null)
  await done(to)
}
