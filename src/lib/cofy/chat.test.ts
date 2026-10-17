import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as schema from "@/db/schema"
import { addDays, today } from "../domain/dates"
import type { StreamEvent } from "./types"

// O fluxo inteiro do chat com a API da Anthropic simulada: ferramentas de leitura viram cartões, as de escrita só
// propõem (nada é gravado antes de confirmar), anexos entram no histórico e o histórico só cresce.
const pg = new PGlite()
const testDb = drizzle(pg, { schema, casing: "snake_case" })
vi.mock("server-only", () => ({}))
vi.mock("@/db", () => ({ ...schema, db: testDb }))

type Script = { stop_reason: string; content: unknown[] }
let script: Script[] = []
const requests: { messages: { role: string; content: unknown[] }[]; tools: { name: string }[]; system: string; model: string }[] = []

vi.mock("@anthropic-ai/sdk", async (orig) => {
  const real = (await orig<typeof import("@anthropic-ai/sdk")>()).default
  class Fake {
    beta = {
      messages: {
        stream: (params: (typeof requests)[number]) => {
          requests.push(structuredClone(params))
          const next = script.shift()
          if (!next) throw new Error("sem resposta simulada")
          const listeners: ((d: string) => void)[] = []
          return {
            on: (_: string, fn: (d: string) => void) => listeners.push(fn),
            finalMessage: async () => {
              for (const b of next.content as { type: string; text?: string }[]) if (b.type === "text") listeners.forEach((l) => l(b.text!))
              return next
            },
          }
        },
      },
    }
  }
  return { default: Object.assign(Fake, { APIError: real.APIError, RateLimitError: real.RateLimitError, AuthenticationError: real.AuthenticationError }) }
})

const chat = await import("./chat")
const store = await import("./store")
const apply = await import("./apply")
const debtsLib = await import("../debts")
const now = today()

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = "test"
  await migrate(testDb, { migrationsFolder: "./drizzle" })
  const [acc] = await testDb.insert(schema.accounts).values({ name: "Carteira", type: "CASH", source: "MANUAL" }).returning({ id: schema.accounts.id })
  const [bank] = await testDb.insert(schema.accounts).values({ name: "Itaú", type: "CHECKING", source: "PLUGGY", pluggyId: "x" }).returning({ id: schema.accounts.id })
  const [p] = await testDb.insert(schema.categories).values({ name: "Alimentação", kind: "EXPENSE", color: "#f59e0b" }).returning({ id: schema.categories.id })
  const [sub] = await testDb.insert(schema.categories).values({ name: "Mercado", kind: "EXPENSE", parentId: p.id }).returning({ id: schema.categories.id })
  await testDb.insert(schema.transactions).values([
    { accountId: bank.id, date: now, amount: -120, description: "SUPERMERCADO EXTRA", kind: "EXPENSE", subcategoryId: sub.id },
    { accountId: acc.id, date: addDays(now, -1), amount: -30, description: "Feira", kind: "EXPENSE", subcategoryId: sub.id },
  ])
})
beforeEach(() => {
  script = []
  requests.length = 0
})

const run = async (input: Partial<Parameters<typeof chat.runChat>[0]> & { text: string }) => {
  const events: StreamEvent[] = []
  await chat.runChat({ user: "Fernando", files: [], ...input }, (e) => events.push(e))
  return events
}
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input })

describe("chat do Cofy", () => {
  it("responde com ferramenta de leitura: cartão na tela, números do banco, histórico gravado", async () => {
    script = [
      { stop_reason: "tool_use", content: [{ type: "text", text: "Vou consultar." }, toolUse("t1", "gastos_por_categoria", { de: addDays(now, -5), ate: now })] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Você gastou **R$ 150,00** com Alimentação." }] },
    ]
    const ev = await run({ text: "Quanto gastei com #[Alimentação]?", page: "Dashboard (/)" })
    expect(ev.map((e) => e.t)).toEqual(["conv", "text", "tool", "card", "text", "done"])
    const card = ev.find((e) => e.t === "card")
    expect(card && card.t === "card" && card.card.blocks[0]).toMatchObject({ type: "kpis", items: [{ label: "Total", value: expect.stringContaining("150,00") }] })

    const req = requests[0]
    expect(req.model).toBe("claude-haiku-5-5")
    expect(req.tools.map((t) => t.name)).toContain("propor_divida")
    const first = req.messages[0].content as { type: string; text?: string }[]
    expect(first[0].text).toContain("<contexto>")
    expect(first[0].text).toContain("Tela atual do usuário: Dashboard (/)")
    expect(first[0].text).toContain('#[Alimentação] = categoria "Alimentação"')
    // o resultado da ferramenta volta ao modelo junto, numa única mensagem do usuário
    const second = requests[1].messages
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"])
    expect((second[2].content[0] as { type: string; tool_use_id: string }).tool_use_id).toBe("t1")

    const convId = ev.find((e) => e.t === "conv")!
    const ui = await store.uiMessages((convId as { id: number }).id)
    expect(ui.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(ui[0].parts).toEqual([{ type: "text", text: "Quanto gastei com #[Alimentação]?" }]) // sem o bloco de contexto
    expect(ui[1].parts.map((p) => p.type)).toEqual(["text", "card", "text"])
  })

  it("escrita só propõe: nada é gravado até confirmar; confirmar cria a dívida uma única vez", async () => {
    script = [
      {
        stop_reason: "tool_use",
        content: [
          toolUse("t2", "propor_divida", {
            credor: "Dr. Paulo Mendes",
            relacao: "Profissional",
            itens: [{ descricao: "Consulta", quantidade: 4, valor_unitario: 90 }, { descricao: "Consulta especial", quantidade: 2, valor_unitario: 110 }],
            forma: "parcelada",
            parcelas: 2,
            vencimento: { tipo: "apos_salario", dias_apos_salario: 1 },
          }),
        ],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Confere o cartão e confirme para eu salvar." }] },
    ]
    const ev = await run({ text: "Cadastra a dívida do psicólogo" })
    const action = ev.find((e) => e.t === "action")
    expect(action && action.t === "action" && action.action).toMatchObject({ kind: "debt", status: "PENDING", title: "Dr. Paulo Mendes", rows: expect.arrayContaining([{ label: "4 × Consulta", value: expect.stringContaining("360,00") }]) })
    expect((await debtsLib.loadDebts()).views.some((v) => v.debt.creditor === "Dr. Paulo Mendes")).toBe(false)

    const id = (action as { action: { id: number } }).action.id
    const done = await apply.confirmAction(id)
    expect(done).toMatchObject({ status: "DONE", result: "Dívida salva" })
    await apply.confirmAction(id) // segundo clique não duplica
    const { views } = await debtsLib.loadDebts()
    const paulo = views.filter((v) => v.debt.creditor === "Dr. Paulo Mendes")
    expect(paulo).toHaveLength(1)
    expect(paulo[0].ev).toMatchObject({ total: 580, remaining: 580 })
    expect(paulo[0].ev.rows.map((r) => r.amount)).toEqual([290, 290])
  })

  it("cancelar não grava; ferramenta com erro devolve o motivo ao modelo", async () => {
    script = [
      { stop_reason: "tool_use", content: [toolUse("t3", "propor_transacoes", { conta: "Itaú", transacoes: [{ data: now, descricao: "x", valor: -10 }] })] },
      { stop_reason: "tool_use", content: [toolUse("t4", "propor_transacoes", { conta: "Carteira", transacoes: [{ data: now, descricao: "Padaria", valor: -18.5, categoria: "Mercado" }] })] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Proposta pronta." }] },
    ]
    const ev = await run({ text: "Lança a padaria" })
    // 1º turno: conta do banco é recusada, e o erro volta como tool_result is_error
    const retry = requests[1].messages.at(-1)!.content[0] as { is_error?: boolean; content: string }
    expect(retry.is_error).toBe(true)
    expect(retry.content).toContain("só lanço em contas manuais")
    const act = ev.find((e) => e.t === "action")
    const id = (act as { action: { id: number } }).action.id
    expect((await apply.cancelAction(id)).status).toBe("CANCELLED")
    expect((await apply.confirmAction(id)).status).toBe("CANCELLED")
    expect(await testDb.select().from(schema.transactions).where(eq(schema.transactions.description, "Padaria"))).toHaveLength(0)
  })

  it("confirmar transações cria na conta manual com a categoria e atualiza o saldo", async () => {
    script = [
      { stop_reason: "tool_use", content: [toolUse("t5", "propor_transacoes", { conta: "Carteira", transacoes: [{ data: now, descricao: "Padaria", valor: -18.5, categoria: "Alimentação / Mercado" }, { data: now, descricao: "Feira", valor: -30 }] })] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] },
    ]
    const ev = await run({ text: "Lança" })
    const id = (ev.find((e) => e.t === "action") as { action: { id: number } }).action.id
    await apply.confirmAction(id)
    const rows = await testDb.select().from(schema.transactions).where(eq(schema.transactions.description, "Padaria"))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: -18.5, kind: "EXPENSE", categorySource: "USER" })
    expect(rows[0].subcategoryId).not.toBeNull()
  })

  it("anexos: texto de CSV entra no pedido e o histórico continua igual no turno seguinte", async () => {
    script = [{ stop_reason: "end_turn", content: [{ type: "text", text: "Li o extrato." }] }]
    const csv = Buffer.from("data;descricao;valor\n2026-10-01;PADARIA;-12,50\n")
    const ev1 = await run({ text: "Importa isso", files: [{ name: "extrato.csv", size: csv.length, bytes: csv }] })
    const convId = (ev1.find((e) => e.t === "conv") as { id: number }).id
    const blocks = requests[0].messages[0].content as { type: string; text?: string }[]
    expect(blocks.map((b) => b.type)).toEqual(["text", "text", "text", "text"])
    expect(blocks[1].text).toBe("[Arquivo anexado: extrato.csv]")
    expect(blocks[2].text).toContain("PADARIA;-12,50")

    script = [{ stop_reason: "end_turn", content: [{ type: "text", text: "Mais alguma coisa?" }] }]
    await run({ text: "Obrigado", conversationId: convId })
    const before = JSON.stringify(requests[0].messages)
    const after = JSON.stringify(requests[1].messages.slice(0, 2))
    expect(after.startsWith(before.slice(0, -1))).toBe(true) // o que já foi enviado não muda (histórico só cresce)
    expect(requests[1].messages).toHaveLength(3)
    const ui = await store.uiMessages(convId)
    expect(ui[0].attachments?.[0]).toMatchObject({ name: "extrato.csv" })
  })

  it("valida anexos e configuração sem chamar a API", async () => {
    const big = await run({ text: "oi", files: [{ name: "malware.exe", size: 10, bytes: Buffer.from("x") }] })
    expect(big.at(-1)).toMatchObject({ t: "error", message: expect.stringContaining("tipo não aceito") })
    delete process.env.ANTHROPIC_API_KEY
    expect((await run({ text: "oi" })).at(-1)).toMatchObject({ t: "error", message: expect.stringContaining("ANTHROPIC_API_KEY") })
    process.env.ANTHROPIC_API_KEY = "test"
    expect(requests).toHaveLength(0)
  })

  it("conversas: renomear, arquivar e excluir", async () => {
    const conv = await store.createConversation("Teste")
    await store.renameConversation(conv.id, "  Novo nome  ")
    expect((await store.getConversation(conv.id))?.title).toBe("Novo nome")
    await store.archiveConversation(conv.id, true)
    expect((await store.listConversations(true)).map((c) => c.id)).toContain(conv.id)
    expect((await store.listConversations(false)).map((c) => c.id)).not.toContain(conv.id)
    await store.deleteConversation(conv.id)
    expect(await store.getConversation(conv.id)).toBeUndefined()
  })
})
