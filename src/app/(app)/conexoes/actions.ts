"use server"

import { eq } from "drizzle-orm"
import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/auth"
import { accounts, db, institutions } from "@/db"
import { today } from "@/lib/domain/dates"
import { fd, parseForm } from "@/lib/form"
import { refreshManualBalances, snapshotBalances } from "@/lib/ledger"
import { runSync } from "@/lib/sync"

export async function addInstitution(form: FormData) {
  await requireUser()
  const { pluggyItemId } = parseForm(form, { pluggyItemId: z.uuid() })
  await db.insert(institutions).values({ pluggyItemId }).onConflictDoNothing()
  refresh()
}

/** Remove a conexão; contas e histórico ficam, arquivados. */
export async function removeInstitution(form: FormData) {
  await requireUser()
  const { id } = parseForm(form, { id: fd.id })
  await db.update(accounts).set({ archived: true }).where(eq(accounts.institutionId, id))
  await db.delete(institutions).where(eq(institutions.id, id))
  refresh()
}

export async function syncNow() {
  await requireUser()
  await runSync("MANUAL")
  refresh()
}

const accountTypes = z.enum(["CHECKING", "CREDIT_CARD", "SAVINGS_INVESTMENT", "CASH"])

export async function updateAccount(form: FormData) {
  await requireUser()
  const v = parseForm(form, {
    id: fd.id,
    name: fd.text,
    type: accountTypes,
    isEmergencyReserve: fd.check,
    archived: fd.check,
    openingBalance: fd.optMoney,
  })
  const { id, openingBalance, ...data } = v
  const [acc] = await db.select().from(accounts).where(eq(accounts.id, id))
  if (!acc) throw new Error("Conta não encontrada")
  // Saldo inicial só existe para contas manuais; nas conectadas o saldo vem da Pluggy
  await db
    .update(accounts)
    .set({ ...data, ...(acc.source === "MANUAL" && openingBalance != null && { openingBalance }) })
    .where(eq(accounts.id, id))
  await refreshManualBalances()
  refresh()
}

export async function createManualAccount(form: FormData) {
  await requireUser()
  const v = parseForm(form, { name: fd.text, type: accountTypes, openingBalance: fd.optMoney })
  await db.insert(accounts).values({ name: v.name, type: v.type, source: "MANUAL", openingBalance: v.openingBalance ?? 0 })
  await refreshManualBalances()
  await snapshotBalances(today())
  refresh()
}
