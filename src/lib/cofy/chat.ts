import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { eq } from "drizzle-orm"
import { chatMessages, db } from "@/db"
import { normalize } from "../domain/categorize"
import { today } from "../domain/dates"
import { loadDebts } from "../debts"
import { categoryTree, listAccounts } from "../queries"
import { attachmentBlocks, checkUpload, UploadError } from "./files"
import { contextBlock, COFY_MODEL, SYSTEM_PROMPT } from "./prompt"
import { attachmentData, createConversation, getConversation, historyRows, saveAttachments, saveMessage, touchConversation } from "./store"
import { runTool, TOOL_LABELS, toolDefinitions } from "./tools"
import type { Card, StreamEvent } from "./types"

// Orquestra uma rodada do chat: grava a mensagem, conversa com o modelo (streaming), roda as ferramentas e
// grava tudo. O histórico é só acrescentado (nunca editado), como pedem os blocos de raciocínio do modelo.

type Msg = Anthropic.Beta.Messages.BetaMessageParam
type UserBlock = Anthropic.Beta.Messages.BetaContentBlockParam

const MAX_TURNS = 8
const MAX_TEXT = 8000
const BETAS = ["thinking-binding-controls-2026-08-01"]

export type ChatInput = {
  conversationId?: number
  text: string
  page?: string
  user: string
  files: { name: string; size: number; bytes: Buffer }[]
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"]

/** `@[Nubank Mastercard]`, `#[Alimentação]` e `@[Dr. Paulo]` viram linhas de contexto com os ids. */
export async function resolveMentions(text: string) {
  const tokens = [...text.matchAll(/([@#])\[([^\]]{1,80})\]/g)]
  if (!tokens.length) return []
  const [accounts, tree, { views }] = await Promise.all([listAccounts(), categoryTree(), loadDebts()])
  const lines: string[] = []
  for (const [, sigil, raw] of tokens) {
    const n = normalize(raw)
    if (sigil === "#") {
      const parent = tree.find((p) => normalize(p.name) === n)
      const sub = tree.flatMap((p) => p.subs.map((s) => ({ s, p }))).find(({ s, p }) => normalize(s.name) === n || normalize(`${p.name} / ${s.name}`) === n)
      if (parent) lines.push(`#[${raw}] = categoria "${parent.name}" (id ${parent.id}, inclui as subcategorias)`)
      else if (sub) lines.push(`#[${raw}] = subcategoria "${sub.p.name} / ${sub.s.name}" (id ${sub.s.id})`)
      continue
    }
    const acc = accounts.find((a) => normalize(a.name) === n)
    const debt = views.find((v) => normalize(v.debt.creditor) === n)
    if (acc) lines.push(`@[${raw}] = conta "${acc.name}" (id ${acc.id}${acc.source === "MANUAL" ? ", manual" : ""})`)
    else if (debt) lines.push(`@[${raw}] = dívida com "${debt.debt.creditor}" (id ${debt.debt.id})`)
  }
  return [...new Set(lines)]
}

/** Mensagens da conversa no formato da API, expandindo os anexos guardados (mesmos bytes → mesmo prefixo). */
async function apiMessages(conversationId: number): Promise<Msg[]> {
  const rows = await historyRows(conversationId)
  const ids = rows.flatMap((r) => (r.content as { type: string; id?: number }[]).filter((b) => b.type === "cofy_attachment").map((b) => b.id!))
  const files = await attachmentData(ids)
  const out: Msg[] = []
  for (const r of rows) {
    const blocks = r.content as { type: string; id?: number }[]
    const content: UserBlock[] = []
    for (const b of blocks) {
      if (b.type !== "cofy_attachment") {
        content.push(b as UserBlock)
        continue
      }
      const f = files.get(b.id!)
      content.push(...((f ? await attachmentBlocks(f) : [{ type: "text" as const, text: "[Arquivo anexado não está mais disponível]" }]) as UserBlock[]))
    }
    out.push({ role: r.role, content })
  }
  return out
}

const titleFrom = (text: string) => {
  const t = text.replace(/[@#]\[([^\]]+)\]/g, "$1").replace(/\s+/g, " ").trim()
  return t ? (t.length > 52 ? `${t.slice(0, 50)}…` : t) : "Nova conversa"
}

let client: Anthropic | undefined
const anthropic = () => (client ??= new Anthropic({ maxRetries: 2 }))

/** Roda uma rodada completa e emite eventos para a tela. Nunca lança: erros viram um evento `error`. */
export async function runChat(input: ChatInput, emit: (e: StreamEvent) => void): Promise<void> {
  try {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new UploadError("O Cofy ainda não está configurado no servidor: falta a variável ANTHROPIC_API_KEY.")
    const text = input.text.trim().slice(0, MAX_TEXT)
    if (!text && !input.files.length) throw new UploadError("Escreva uma mensagem ou anexe um arquivo.")
    const prepared = input.files.map((f) => ({ name: f.name.slice(0, 120), mediaType: checkUpload(f.name, f.size), size: f.size, data: f.bytes.toString("base64") }))

    let conv = input.conversationId ? await getConversation(input.conversationId) : undefined
    if (input.conversationId && !conv) throw new UploadError("Conversa não encontrada.")
    conv ??= await createConversation(titleFrom(text || prepared[0]?.name || ""))
    emit({ t: "conv", id: conv.id, title: conv.title })

    // mensagem do usuário: contexto + anexos + texto; o contexto fica gravado com a mensagem (histórico estável)
    const now = today()
    const ctx = contextBlock({ today: now, weekday: WEEKDAYS[new Date(`${now}T12:00:00Z`).getUTCDay()], page: input.page, user: input.user, mentions: await resolveMentions(text) })
    const messageId = await saveMessage(conv.id, "user", [])
    const saved = await saveAttachments(messageId, prepared)
    await db.update(chatMessages).set({ content: [{ type: "text", text: ctx }, ...saved.map((s) => ({ type: "cofy_attachment", id: s.id })), ...(text ? [{ type: "text", text }] : [{ type: "text", text: "(sem texto: analise o(s) arquivo(s) anexado(s))" }])] }).where(eq(chatMessages.id, messageId))

    const messages = await apiMessages(conv.id)
    let finished = false
    for (let turn = 0; turn < MAX_TURNS && !finished; turn++) {
      const stream = anthropic().beta.messages.stream({
        model: COFY_MODEL,
        max_tokens: 8000,
        betas: BETAS,
        // histórico só cresce; se um deploy mudar o prompt/ferramentas, o servidor descarta o raciocínio antigo em vez de falhar
        thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages,
      })
      stream.on("text", (d) => emit({ t: "text", d }))
      const message = await stream.finalMessage()
      const tools = message.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use")

      if (message.stop_reason === "refusal") {
        await saveMessage(conv.id, "assistant", message.content)
        emit({ t: "error", message: "Não posso ajudar com isso. Posso ajudar com suas finanças ou com o uso do fluxo." })
        return
      }
      if (message.stop_reason === "max_tokens") {
        await saveMessage(conv.id, "assistant", message.content.filter((b) => b.type !== "tool_use"))
        emit({ t: "error", message: "A resposta ficou longa demais e foi cortada. Peça em partes menores." })
        return
      }
      if (!tools.length || message.stop_reason !== "tool_use") {
        await saveMessage(conv.id, "assistant", message.content)
        finished = true
        break
      }

      // ferramentas do turno: em paralelo, e todos os resultados voltam numa única mensagem do usuário
      const cards: Record<string, Card> = {}
      for (const t of tools) emit({ t: "tool", id: t.id, name: t.name, label: TOOL_LABELS[t.name] ?? t.name })
      const results = await Promise.all(
        tools.map(async (t) => {
          const r = await runTool(t.name, t.input, { conversationId: conv.id, toolUseId: t.id })
          if (!r.ok) return { type: "tool_result" as const, tool_use_id: t.id, is_error: true, content: r.error }
          if (r.result.card) {
            cards[t.id] = r.result.card
            emit({ t: "card", id: t.id, card: r.result.card })
          }
          if (r.result.action) emit({ t: "action", id: t.id, action: r.result.action })
          return { type: "tool_result" as const, tool_use_id: t.id, content: JSON.stringify(r.result.model) }
        }),
      )
      await saveMessage(conv.id, "assistant", message.content, cards)
      await saveMessage(conv.id, "user", results)
      messages.push({ role: "assistant", content: message.content as UserBlock[] }, { role: "user", content: results })
    }
    if (!finished) emit({ t: "error", message: "Precisei de passos demais para responder. Tente uma pergunta mais direta." })
    await touchConversation(conv.id)
    emit({ t: "done" })
  } catch (e) {
    if (e instanceof UploadError) return emit({ t: "error", message: e.message })
    if (e instanceof Anthropic.RateLimitError) return emit({ t: "error", message: "Muitas perguntas seguidas. Espere um instante e tente de novo." })
    if (e instanceof Anthropic.AuthenticationError) return emit({ t: "error", message: "A chave da Anthropic do servidor foi recusada (ANTHROPIC_API_KEY)." })
    if (e instanceof Anthropic.APIError) {
      console.error("cofy api:", e.status, e.message)
      return emit({ t: "error", message: e.status && e.status >= 500 ? "O serviço de IA está instável agora. Tente de novo em instantes." : "Não consegui processar o pedido." })
    }
    console.error("cofy:", e instanceof Error ? e.message : e)
    emit({ t: "error", message: "Algo deu errado. Tente de novo." })
  }
}

