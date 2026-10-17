import type { StreamEvent, UiPart } from "./types"

// Leitura do stream NDJSON de /api/cofy e a regra de como cada evento muda as partes da resposta na tela.

/** Uma linha JSON por evento; aguenta eventos partidos entre pedaços e o último sem quebra de linha. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (value) buf += dec.decode(value, { stream: !done })
    let nl: number
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) yield JSON.parse(line) as StreamEvent
    }
    if (done) break
  }
  if (buf.trim()) yield JSON.parse(buf.trim()) as StreamEvent
}

/** Aplica um evento à resposta que está chegando: texto acumula, "consultando…" vira cartão ou ação. */
export function applyEvent(parts: UiPart[], e: StreamEvent): UiPart[] {
  switch (e.t) {
    case "text": {
      const last = parts.at(-1)
      return last?.type === "text" ? [...parts.slice(0, -1), { type: "text", text: last.text + e.d }] : [...parts, { type: "text", text: e.d }]
    }
    case "tool":
      return [...parts, { type: "tool", id: e.id, label: e.label }]
    case "card":
      return parts.map((p) => (p.type === "tool" && p.id === e.id ? { type: "card", card: e.card } : p))
    case "action":
      return parts.map((p) => (p.type === "tool" && p.id === e.id ? { type: "action", action: e.action } : p))
    default:
      return parts
  }
}

/** Ferramentas que terminaram sem cartão nem ação (erro de consulta) não ficam "consultando…" para sempre. */
export const dropPendingTools = (parts: UiPart[]) => parts.filter((p) => p.type !== "tool")
