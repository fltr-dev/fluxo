import { describe, expect, it } from "vitest"
import { applyEvent, dropPendingTools, readEvents } from "./stream"
import type { Card, StreamEvent, UiPart } from "./types"

const body = (chunks: string[]) => new ReadableStream<Uint8Array>({ start(c) { chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x))); c.close() } })
const collect = async (b: ReadableStream<Uint8Array>) => { const out: StreamEvent[] = []; for await (const e of readEvents(b)) out.push(e); return out }

describe("stream do Cofy", () => {
  it("lê eventos partidos entre pedaços, acentos no meio e o último sem quebra de linha", async () => {
    const lines = [{ t: "conv", id: 3, title: "Olá" }, { t: "text", d: "Você gastou R$ 10 com ção" }, { t: "done" }].map((e) => JSON.stringify(e))
    const all = `${lines[0]}\n${lines[1]}\n${lines[2]}`
    const bytes = new TextEncoder().encode(all)
    const mid = all.indexOf("ção") + 1 // corta dentro de um caractere de 2 bytes
    const cut = new TextEncoder().encode(all.slice(0, mid)).length - 1
    const events = await collect(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut)); c.close() } }))
    expect(events).toEqual([{ t: "conv", id: 3, title: "Olá" }, { t: "text", d: "Você gastou R$ 10 com ção" }, { t: "done" }])
  })
  it("ignora linhas em branco", async () => {
    expect(await collect(body(['{"t":"done"}\n\n\n']))).toEqual([{ t: "done" }])
  })
})

describe("partes da resposta", () => {
  const card: Card = { title: "x", icon: "chart", blocks: [] }
  it("texto acumula; ferramenta vira cartão ou ação no mesmo lugar", () => {
    let p: UiPart[] = []
    for (const e of [{ t: "text", d: "Vou " }, { t: "text", d: "ver." }, { t: "tool", id: "a", label: "Resumo" }, { t: "tool", id: "b", label: "Dívidas" }, { t: "card", id: "a", card }, { t: "text", d: "Pronto" }] as StreamEvent[]) p = applyEvent(p, e)
    expect(p.map((x) => x.type)).toEqual(["text", "card", "tool", "text"])
    expect((p[0] as { text: string }).text).toBe("Vou ver.")
    expect(dropPendingTools(p).map((x) => x.type)).toEqual(["text", "card", "text"])
  })
  it("eventos que não mexem na resposta a deixam como está", () => {
    const p: UiPart[] = [{ type: "text", text: "a" }]
    expect(applyEvent(p, { t: "done" })).toBe(p)
    expect(applyEvent(p, { t: "error", message: "x" })).toBe(p)
  })
})
