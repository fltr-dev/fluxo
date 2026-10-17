"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { cancelCofyAction, confirmCofyAction, loadConversation } from "@/app/(app)/cofy/actions"
import { applyEvent, dropPendingTools, readEvents } from "@/lib/cofy/stream"
import type { ActionView, StreamEvent, UiMessage, UiPart } from "@/lib/cofy/types"

// Estado das conversas do Cofy, acima das telas: o stream de uma conversa continua rodando se você abre outra
// (ou fecha o painel flutuante), e a lista mostra qual está respondendo.

export type Conv = { key: string; id: number | null; title: string; messages: UiMessage[]; streaming: boolean; error: string | null; loaded: boolean }
export type SendInput = { text: string; files: File[]; page?: string }

type Api = {
  /** Conversa pela chave ("12" ou "new-1"); segue o apelido quando uma conversa nova ganha id. */
  conv: (key: string) => Conv | undefined
  newKey: () => string
  open: (id: number) => void
  send: (key: string, input: SendInput, onConv?: (id: number) => void) => Promise<void>
  act: (actionId: number, kind: "confirm" | "cancel") => Promise<string | null>
  busyIds: number[]
}

const Ctx = createContext<Api | null>(null)
export const useCofy = () => {
  const api = useContext(Ctx)
  if (!api) throw new Error("CofyProvider ausente")
  return api
}

const empty = (key: string, id: number | null, loaded: boolean): Conv => ({ key, id, title: "Nova conversa", messages: [], streaming: false, error: null, loaded })

export function CofyProvider({ children, demo = false }: { children: React.ReactNode; demo?: boolean }) {
  const [convs, setConvs] = useState<Record<string, Conv>>({})
  const alias = useRef(new Map<string, string>())
  const counter = useRef(0)
  const loading = useRef(new Set<number>())

  const resolve = useCallback((key: string) => alias.current.get(key) ?? key, [])
  const patch = useCallback((key: string, fn: (c: Conv) => Conv) => setConvs((s) => {
    const k = resolve(key)
    const cur = s[k]
    return cur ? { ...s, [k]: fn(cur) } : s
  }), [resolve])

  const open = useCallback((id: number) => {
    const key = String(id)
    setConvs((s) => (s[key] ? s : { ...s, [key]: empty(key, id, false) }))
    if (loading.current.has(id)) return
    loading.current.add(id)
    void loadConversation(id)
      .then((r) => {
        if (!r) return patch(key, (c) => ({ ...c, loaded: true, error: "Conversa não encontrada" }))
        // se uma resposta está chegando agora, o stream manda; só a primeira carga preenche
        patch(key, (c) => (c.streaming ? { ...c, loaded: true, title: r.title } : { ...c, loaded: true, title: r.title, messages: r.messages }))
      })
      .catch(() => patch(key, (c) => ({ ...c, loaded: true, error: "Não consegui carregar a conversa" })))
      .finally(() => loading.current.delete(id))
  }, [patch])

  const send = useCallback(async (key: string, input: SendInput, onConv?: (id: number) => void) => {
    const k0 = resolve(key)
    const stamp = Date.now()
    const user: UiMessage = {
      id: `u-${stamp}`,
      role: "user",
      parts: input.text.trim() ? [{ type: "text", text: input.text.trim() }] : [],
      attachments: input.files.map((f, i) => ({ id: -(i + 1), name: f.name, size: f.size, mediaType: f.type })),
    }
    setConvs((s) => {
      const cur = s[k0] ?? empty(k0, /^\d+$/.test(k0) ? Number(k0) : null, true)
      return { ...s, [k0]: { ...cur, streaming: true, error: null, messages: [...cur.messages, user, { id: `a-${stamp}`, role: "assistant", parts: [] }] } }
    })
    const assistant = (fn: (parts: UiPart[]) => UiPart[]) => patch(key, (c) => ({ ...c, messages: c.messages.map((m, i) => (i === c.messages.length - 1 && m.role === "assistant" ? { ...m, parts: fn(m.parts) } : m)) }))

    let id = /^\d+$/.test(k0) ? Number(k0) : null
    const fd = new FormData()
    fd.set("text", input.text)
    if (id) fd.set("conversationId", String(id))
    if (input.page) fd.set("page", input.page)
    for (const f of input.files) fd.append("files", f)

    const fail = (message: string) => patch(key, (c) => ({ ...c, streaming: false, error: message, messages: c.messages.map((m, i) => (i === c.messages.length - 1 && m.role === "assistant" ? { ...m, parts: dropPendingTools(m.parts) } : m)) }))
    const handle = (e: StreamEvent) => {
      switch (e.t) {
        case "conv": {
          id = e.id
          const next = String(e.id)
          if (k0 !== next) {
            alias.current.set(k0, next)
            setConvs((s) => {
              const { [k0]: cur, ...rest } = s
              return cur ? { ...rest, [next]: { ...cur, key: next, id: e.id, title: e.title } } : s
            })
          } else patch(key, (c) => ({ ...c, title: e.title }))
          onConv?.(e.id)
          break
        }
        case "text":
        case "tool":
        case "card":
        case "action":
          return assistant((p) => applyEvent(p, e))
        case "title": return patch(key, (c) => ({ ...c, title: e.title }))
        case "error": return fail(e.message)
        case "done": return
      }
    }

    try {
      const res = await fetch("/api/cofy", { method: "POST", body: fd })
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        return fail(j?.error ?? "Não consegui falar com o servidor.")
      }
      for await (const e of readEvents(res.body)) handle(e)
    } catch {
      return fail("A conexão caiu. A resposta pode ter sido salva: reabra a conversa em instantes.")
    }
    // versão final do servidor: ids reais e cartões de ação com o estado do banco
    if (id) {
      const fresh = await loadConversation(id).catch(() => null)
      patch(key, (c) => ({ ...c, streaming: false, ...(fresh && !c.error ? { title: fresh.title, messages: fresh.messages } : {}) }))
    } else patch(key, (c) => ({ ...c, streaming: false }))
  }, [patch, resolve])

  const act = useCallback(async (actionId: number, kind: "confirm" | "cancel") => {
    if (demo) return "Na demonstração nada é salvo: entre com a sua conta para confirmar."
    try {
      const view: ActionView = await (kind === "confirm" ? confirmCofyAction(actionId) : cancelCofyAction(actionId))
      setConvs((s) => Object.fromEntries(Object.entries(s).map(([k, c]) => [k, { ...c, messages: c.messages.map((m) => ({ ...m, parts: m.parts.map((p) => (p.type === "action" && p.action.id === actionId ? { ...p, action: view } : p)) })) }])))
      return null
    } catch (e) {
      return e instanceof Error && e.message ? "Não foi possível salvar. Confira os dados e tente de novo." : "Não foi possível salvar."
    }
  }, [demo])

  const api = useMemo<Api>(
    () => ({
      conv: (key) => convs[resolve(key)],
      newKey: () => `new-${++counter.current}`,
      open,
      send,
      act,
      busyIds: Object.values(convs).filter((c) => c.streaming && c.id != null).map((c) => c.id!),
    }),
    [convs, resolve, open, send, act],
  )
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
