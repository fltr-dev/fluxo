"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireUser } from "@/auth"
import { archiveDebt, createDebt, debtInput, deleteDebt, payInstallment, undoPayment, updateDebt } from "@/lib/debts"
import { fd, parseForm } from "@/lib/form"

/** Salva a dívida (o formulário manda tudo num JSON em `payload`: itens são dinâmicos). */
export async function saveDebt(form: FormData) {
  await requireUser()
  const data = debtInput.parse(JSON.parse(String(form.get("payload") ?? "{}")))
  const id = data.id ? (await updateDebt({ ...data, id: data.id }), data.id) : await createDebt(data)
  refresh()
  redirect(`/dividas?ver=${id}`)
}

export async function payDebt(form: FormData) {
  await requireUser()
  const v = parseForm(form, { debtId: fd.id, installmentId: fd.optId, amount: z.coerce.number().positive(), date: fd.date, transactionId: fd.optId })
  await payInstallment(v)
  refresh()
  redirect(`/dividas?ver=${v.debtId}`)
}

export async function undoDebtPayment(form: FormData) {
  await requireUser()
  const v = parseForm(form, { debtId: fd.id, installmentId: fd.id })
  await undoPayment(v.installmentId)
  refresh()
  redirect(`/dividas?ver=${v.debtId}`)
}

export async function archiveDebtAction(form: FormData) {
  await requireUser()
  await archiveDebt(parseForm(form, { id: fd.id }).id)
  refresh()
  redirect("/dividas")
}

export async function deleteDebtAction(form: FormData) {
  await requireUser()
  await deleteDebt(parseForm(form, { id: fd.id }).id)
  refresh()
  redirect("/dividas")
}
