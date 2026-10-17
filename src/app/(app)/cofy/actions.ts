"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/auth"
import { cancelAction, confirmAction } from "@/lib/cofy/apply"
import { archiveConversation, deleteConversation, renameConversation, uiMessages, getConversation } from "@/lib/cofy/store"
import type { ActionView, UiMessage } from "@/lib/cofy/types"
import { loadDebts } from "@/lib/debts"
import { categoryTree, listAccounts } from "@/lib/queries"

const id = z.number().int().positive()

export async function loadConversation(conversationId: number): Promise<{ title: string; messages: UiMessage[] } | null> {
  await requireUser({ allowDemo: true })
  const conv = await getConversation(id.parse(conversationId))
  return conv ? { title: conv.title, messages: await uiMessages(conv.id) } : null
}

export async function renameConversationAction(conversationId: number, title: string) {
  await requireUser()
  await renameConversation(id.parse(conversationId), z.string().max(200).parse(title))
  refresh()
}

export async function archiveConversationAction(conversationId: number, archived: boolean) {
  await requireUser()
  await archiveConversation(id.parse(conversationId), archived)
  refresh()
}

export async function deleteConversationAction(conversationId: number) {
  await requireUser()
  await deleteConversation(id.parse(conversationId))
  refresh()
}

/** Só aqui a proposta do Cofy vira dado do app: o clique em "Confirmar e salvar". */
export async function confirmCofyAction(actionId: number): Promise<ActionView> {
  await requireUser()
  const view = await confirmAction(id.parse(actionId))
  refresh()
  return view
}

export async function cancelCofyAction(actionId: number): Promise<ActionView> {
  await requireUser()
  return cancelAction(id.parse(actionId))
}

export type MentionOption = { kind: "conta" | "categoria" | "divida"; label: string; hint: string; sigil: "@" | "#" }

/** Contas, categorias e dívidas que podem ser citadas com @ e #. */
export async function loadMentionOptions(): Promise<MentionOption[]> {
  await requireUser({ allowDemo: true })
  const [accounts, tree, { views }] = await Promise.all([listAccounts(), categoryTree(), loadDebts()])
  return [
    ...accounts.filter((a) => !a.archived && a.investmentId == null).map((a): MentionOption => ({ kind: "conta", label: a.name, hint: a.institution ?? "Conta", sigil: "@" })),
    ...views.map((v): MentionOption => ({ kind: "divida", label: v.debt.creditor, hint: "Dívida", sigil: "@" })),
    ...tree.flatMap((p) => [{ kind: "categoria", label: p.name, hint: p.kind === "INCOME" ? "Receita" : "Despesa", sigil: "#" } as MentionOption, ...p.subs.map((s): MentionOption => ({ kind: "categoria", label: s.name, hint: p.name, sigil: "#" }))]),
  ]
}
