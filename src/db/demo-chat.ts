import type { PgliteDatabase } from "drizzle-orm/pglite"
import type { Card } from "@/lib/cofy/types"
import * as s from "./schema"

type Db = PgliteDatabase<typeof import("./schema")>

const ago = (ms: number) => new Date(Date.now() - ms)
const H = 3600_000
const D = 24 * H
const ctx = (today: string) => ({ type: "text", text: `<contexto>\nHoje é ${today}.\nUsuário: Demonstração.\n</contexto>` })

/** Conversas de exemplo do Cofy na demonstração (o chat de verdade é desativado: não gasta a API). */
export async function seedDemoChat(db: Db, { now }: { now: string }) {
  const [alim, psi, cdb, rel] = await db
    .insert(s.chatConversations)
    .values([
      { title: "Gastos com alimentação", createdAt: ago(40 * 60_000), updatedAt: ago(30 * 60_000) },
      { title: "Dívida do psicólogo", createdAt: ago(2 * H), updatedAt: ago(1 * H) },
      { title: "Quanto rende meu CDB?", createdAt: ago(2 * D), updatedAt: ago(2 * D) },
      { title: "Relatório do mês passado", createdAt: ago(40 * D), updatedAt: ago(40 * D), archived: true },
    ])
    .returning({ id: s.chatConversations.id })

  const compare: Card = {
    title: "Alimentação · out × set",
    icon: "chart",
    href: "/relatorios",
    hrefLabel: "Abrir em Relatórios",
    blocks: [
      { type: "kpis", items: [{ label: "Período", value: "R$ 1.284,30" }, { label: "Anterior", value: "R$ 1.512,80" }, { label: "Variação", value: "−15,1%", tone: "good" }] },
      {
        type: "bars",
        legend: "Barra: período atual · traço: período anterior",
        rows: [
          { label: "Mercado", value: 742.1, max: 800, text: "R$ 742,10", marker: 695, delta: "+6,8%", tone: "bad", color: "#f59e0b" },
          { label: "Restaurantes", value: 361.7, max: 800, text: "R$ 361,70", marker: 398, delta: "−9,2%", tone: "good", color: "#f59e0b" },
          { label: "Delivery", value: 180.5, max: 800, text: "R$ 180,50", marker: 404.8, delta: "−55,4%", tone: "good", color: "#f59e0b" },
        ],
      },
    ],
  }
  const m1 = await db.insert(s.chatMessages).values([
    { conversationId: alim.id, role: "user", content: [ctx(now), { type: "text", text: "Quanto gastei com #[Alimentação] em outubro comparado a setembro?" }], createdAt: ago(40 * 60_000) },
    { conversationId: alim.id, role: "assistant", content: [{ type: "text", text: "Vou comparar os dois meses." }, { type: "tool_use", id: "toolu_demo_1", name: "gastos_por_categoria", input: { categoria: "Alimentação", comparar: true } }], cards: { toolu_demo_1: compare }, createdAt: ago(39 * 60_000) },
    { conversationId: alim.id, role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_demo_1", content: "{}" }], createdAt: ago(39 * 60_000) },
    { conversationId: alim.id, role: "assistant", content: [{ type: "text", text: "Em outubro (até hoje) você gastou **R$ 1.284,30** com Alimentação, **15,1% a menos** que em setembro. A maior queda foi em **Delivery**; o Mercado subiu um pouco." }], createdAt: ago(38 * 60_000) },
  ]).returning({ id: s.chatMessages.id })
  void m1

  const [psiUser] = await db
    .insert(s.chatMessages)
    .values({ conversationId: psi.id, role: "user", content: [ctx(now), { type: "text", text: "Cadastra essa dívida pra mim. Vou pagar em 2x, depois do salário." }], createdAt: ago(2 * H) })
    .returning({ id: s.chatMessages.id })
  await db.insert(s.chatAttachments).values({ messageId: psiUser.id, name: "recibo-psicologo-out.pdf", mediaType: "application/pdf", size: 86_016, data: "" })
  await db.insert(s.chatMessages).values([
    { conversationId: psi.id, role: "assistant", content: [{ type: "text", text: "Li o recibo: são **4 consultas de R$ 90** e **2 de R$ 110**, do Dr. Paulo Mendes. Confere antes de eu salvar:" }, { type: "tool_use", id: "toolu_demo_2", name: "propor_divida", input: {} }], createdAt: ago(119 * 60_000) },
    { conversationId: psi.id, role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_demo_2", content: "{}" }], createdAt: ago(119 * 60_000) },
    { conversationId: psi.id, role: "assistant", content: [{ type: "text", text: "Está aguardando a sua confirmação aí em cima. Depois de salvar eu aviso um dia depois que o salário cair." }], createdAt: ago(118 * 60_000) },
  ])
  await db.insert(s.chatActions).values({
    conversationId: psi.id,
    toolUseId: "toolu_demo_2",
    kind: "debt",
    payload: {
      op: {},
      view: {
        title: "Dr. Paulo Mendes",
        subtitle: "Profissional · sessões de psicologia",
        amount: "R$ 580,00",
        rows: [{ label: "4 × Consulta", value: "R$ 360,00" }, { label: "2 × Consulta (horário especial)", value: "R$ 220,00" }],
        tags: ["2 × R$ 290,00", "1 dia após o salário", "Lembrete 1 dia(s) antes"],
        href: "/dividas",
        hrefLabel: "Ver em Dívidas",
      },
    },
  })

  await db.insert(s.chatMessages).values([
    { conversationId: cdb.id, role: "user", content: [ctx(now), { type: "text", text: "Quanto rende meu CDB de 110% do CDI?" }], createdAt: ago(2 * D) },
    { conversationId: cdb.id, role: "assistant", content: [{ type: "text", text: "Com o CDI em torno de **14,6% ao ano**, um CDB de **110% do CDI** rende aproximadamente **16% ao ano** bruto, antes do imposto de renda. Para R$ 5.000 aplicados, são cerca de **R$ 800 em 12 meses** (R$ 640 depois do IR de 20%, no prazo de 2 anos)." }], createdAt: ago(2 * D) },
  ])
  await db.insert(s.chatMessages).values([
    { conversationId: rel.id, role: "user", content: [ctx(now), { type: "text", text: "Gere o relatório de setembro." }], createdAt: ago(40 * D) },
    { conversationId: rel.id, role: "assistant", content: [{ type: "text", text: "Setembro fechou com **R$ 2.980,00** de resultado positivo." }], createdAt: ago(40 * D) },
  ])
}
