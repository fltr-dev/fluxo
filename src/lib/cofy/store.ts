import "server-only"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { chatActions, chatAttachments, chatConversations, chatMessages, db } from "@/db"
import { toActionView } from "./apply"
import type { Card, ConversationRow, UiMessage, UiPart } from "./types"

// Conversas, mensagens e anexos do Cofy no banco. As mensagens guardam os blocos da API como vieram;
// o que a tela mostra (cartões, ações) é montado aqui a partir deles.

const iso = (d: Date) => d.toISOString()

export async function listConversations(archived = false): Promise<ConversationRow[]> {
  const rows = await db.select().from(chatConversations).where(eq(chatConversations.archived, archived)).orderBy(desc(chatConversations.updatedAt), desc(chatConversations.id)).limit(200)
  return rows.map((r) => ({ id: r.id, title: r.title, archived: r.archived, updatedAt: iso(r.updatedAt) }))
}

export async function getConversation(id: number) {
  const [row] = await db.select().from(chatConversations).where(eq(chatConversations.id, id))
  return row
}

export async function createConversation(title: string) {
  const [row] = await db.insert(chatConversations).values({ title: title.slice(0, 80) || "Nova conversa" }).returning()
  return row
}

export const renameConversation = (id: number, title: string) => db.update(chatConversations).set({ title: title.trim().slice(0, 80) || "Sem título" }).where(eq(chatConversations.id, id))
export const archiveConversation = (id: number, archived: boolean) => db.update(chatConversations).set({ archived }).where(eq(chatConversations.id, id))
export const deleteConversation = (id: number) => db.delete(chatConversations).where(eq(chatConversations.id, id))
export const touchConversation = (id: number) => db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, id))

type Block = { type: string; [k: string]: unknown }

export async function saveMessage(conversationId: number, role: "user" | "assistant", content: unknown[], cards?: Record<string, Card>) {
  const [row] = await db.insert(chatMessages).values({ conversationId, role, content, cards: cards && Object.keys(cards).length ? cards : null }).returning({ id: chatMessages.id })
  await touchConversation(conversationId)
  return row.id
}

export async function saveAttachments(messageId: number, files: { name: string; mediaType: string; size: number; data: string }[]) {
  if (!files.length) return []
  return db.insert(chatAttachments).values(files.map((f) => ({ messageId, ...f }))).returning({ id: chatAttachments.id, name: chatAttachments.name })
}

export async function historyRows(conversationId: number) {
  return db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(asc(chatMessages.id))
}

export async function attachmentData(ids: number[]) {
  if (!ids.length) return new Map<number, { name: string; mediaType: string; data: string }>()
  const rows = await db.select().from(chatAttachments).where(inArray(chatAttachments.id, ids))
  return new Map(rows.map((r) => [r.id, { name: r.name, mediaType: r.mediaType, data: r.data }]))
}

const CONTEXT = /^<contexto>[\s\S]*<\/contexto>$/

/** Mensagens como a tela as mostra: cartões e ações no lugar certo; resultados de ferramenta e contexto ficam de fora. */
export async function uiMessages(conversationId: number): Promise<UiMessage[]> {
  const [rows, actions, atts] = await Promise.all([
    historyRows(conversationId),
    db.select().from(chatActions).where(eq(chatActions.conversationId, conversationId)),
    db.select({ id: chatAttachments.id, messageId: chatAttachments.messageId, name: chatAttachments.name, mediaType: chatAttachments.mediaType, size: chatAttachments.size }).from(chatAttachments).where(inArray(chatAttachments.messageId, db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.conversationId, conversationId)))),
  ])
  const byTool = new Map(actions.map((a) => [a.toolUseId, a]))
  const out: UiMessage[] = []
  for (const r of rows) {
    const blocks = r.content as Block[]
    if (r.role === "user") {
      if (blocks.every((b) => b.type === "tool_result")) continue
      const text = blocks.filter((b) => b.type === "text" && !CONTEXT.test(String(b.text).trim())).map((b) => String(b.text)).join("\n").trim()
      out.push({ id: r.id, role: "user", parts: text ? [{ type: "text", text }] : [], attachments: atts.filter((a) => a.messageId === r.id).map(({ id, name, size, mediaType }) => ({ id, name, size, mediaType })), createdAt: iso(r.createdAt) })
      continue
    }
    const cards = (r.cards ?? {}) as Record<string, Card>
    const parts: UiPart[] = []
    for (const b of blocks) {
      if (b.type === "text" && String(b.text).trim()) parts.push({ type: "text", text: String(b.text) })
      else if (b.type === "tool_use") {
        const id = String(b.id)
        if (cards[id]) parts.push({ type: "card", card: cards[id] })
        const act = byTool.get(id)
        if (act) parts.push({ type: "action", action: toActionView(act) })
      }
    }
    const last = out.at(-1)
    // turnos do mesmo raciocínio (texto → ferramenta → texto) viram uma só bolha
    if (last?.role === "assistant") last.parts.push(...parts)
    else out.push({ id: r.id, role: "assistant", parts, createdAt: iso(r.createdAt) })
  }
  return out
}

export async function ownsAction(actionId: number) {
  const [row] = await db.select({ id: chatActions.id }).from(chatActions).where(and(eq(chatActions.id, actionId)))
  return !!row
}
