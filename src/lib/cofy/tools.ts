import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { categories, chatActions, db, transactions } from "@/db"
import { classLabel, portfolioSummary } from "../investments"
import { loadDebts, matchPayments, type DebtView } from "../debts"
import { goalProgress } from "../domain/calc"
import { normalize } from "../domain/categorize"
import { addDays, addMonths, daysBetween, monthEnd, monthOf, monthStart, today } from "../domain/dates"
import { debtInput, type DebtInputValue } from "../debts"
import { scheduleLabel } from "../domain/debts"
import { brl, dateBR, dayMonth, monthLabel, signedPct } from "../format"
import { byCategory, categoryTree, goalsWithProgress, limitsWithUsage, listAccounts, listTransactions, netWorth, reserveOverview, totals, type Filters } from "../queries"
import type { ActionView, Card, CardBlock } from "./types"

// Ferramentas do Cofy. As de leitura devolvem dados (para o modelo) e um cartão (para a tela). As de escrita
// ("propor_*") NÃO gravam nada: guardam a proposta em chat_actions e o usuário confirma na tela (ver apply.ts).

export class ToolError extends Error {}

type Ctx = { conversationId: number; toolUseId: string }
type Result = { model: unknown; card?: Card; action?: ActionView }
type Tool<S extends z.ZodType> = { name: string; label: string; description: string; schema: S; run: (input: z.infer<S>, ctx: Ctx) => Promise<Result> }

/** Mantém a entrada tipada pelo schema dentro de `run` e guarda a ferramenta numa lista homogênea. */
const defineTool = <S extends z.ZodType>(t: Tool<S>) => t as unknown as Tool<z.ZodType>

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD")
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use AAAA-MM")
const periodShape = { de: date.optional().describe("Início (AAAA-MM-DD). Padrão: primeiro dia do mês atual."), ate: date.optional().describe("Fim (AAAA-MM-DD). Padrão: hoje.") }

const filters = (from: string, to: string, extra: Partial<Filters> = {}): Filters => ({ preset: "custom", page: 1, from, to, ...extra })
const pctText = (v: number | null) => (v == null ? "—" : signedPct(v))
const delta = (cur: number, prev: number) => (prev ? (cur - prev) / Math.abs(prev) : null)

function period(de?: string, ate?: string) {
  const now = today()
  const from = de ?? monthStart(monthOf(now))
  const to = ate ?? (de ? monthEnd(monthOf(de)) : now)
  if (from > to) throw new ToolError("A data inicial é depois da final")
  return { from, to }
}

/** Período anterior de mesmo tamanho, logo antes de [from, to]. */
function previous(from: string, to: string) {
  const days = daysBetween(from, to) + 1
  return { from: addDays(from, -days), to: addDays(from, -1) }
}

// ---------- Resolução de nomes (o modelo fala em nomes; o banco usa ids) ----------

async function categoryIndex() {
  const tree = await categoryTree()
  const subs = tree.flatMap((p) => p.subs.map((s) => ({ id: s.id, kind: s.kind, label: `${p.name} / ${s.name}`, parent: p.name, name: s.name })))
  return { tree, subs }
}

/** "Mercado", "Alimentação / Mercado" ou "Alimentação" (só para filtros, que aceitam a categoria-pai). */
async function findSub(name: string) {
  const { subs } = await categoryIndex()
  const n = normalize(name)
  const exact = subs.filter((s) => normalize(s.label) === n || normalize(s.name) === n)
  const hit = exact.length ? exact : subs.filter((s) => normalize(s.label).includes(n))
  if (hit.length === 1) return hit[0]
  throw new ToolError(hit.length ? `"${name}" é ambíguo: ${hit.slice(0, 8).map((h) => h.label).join("; ")}` : `Categoria "${name}" não encontrada. Chame listar_categorias para ver os nomes.`)
}

async function findFilterCategory(name: string) {
  const { tree } = await categoryIndex()
  const n = normalize(name)
  const parent = tree.find((p) => normalize(p.name) === n)
  if (parent) return { id: parent.id, label: parent.name }
  const s = await findSub(name)
  return { id: s.id, label: s.label }
}

async function findAccount(name: string, { manualOnly = false } = {}) {
  const all = (await listAccounts()).filter((a) => !a.archived && a.investmentId == null)
  const n = normalize(name)
  const hits = all.filter((a) => normalize(a.name) === n || normalize(a.name).includes(n))
  const exact = hits.filter((a) => normalize(a.name) === n)
  const pick = exact.length === 1 ? exact : hits
  if (pick.length !== 1) throw new ToolError(pick.length ? `"${name}" é ambíguo: ${pick.map((a) => a.name).join("; ")}` : `Conta "${name}" não encontrada. Contas: ${all.map((a) => a.name).join("; ")}`)
  const acc = pick[0]
  if (manualOnly && acc.source !== "MANUAL") {
    const manual = all.filter((a) => a.source === "MANUAL").map((a) => a.name)
    throw new ToolError(`"${acc.name}" vem do banco (Open Finance) e já recebe as transações sozinha; só lanço em contas manuais${manual.length ? `: ${manual.join("; ")}` : " (não há nenhuma)"}.`)
  }
  return acc
}

function findDebt(views: DebtView[], ref: { credor?: string; divida_id?: number }) {
  if (ref.divida_id) {
    const v = views.find((x) => x.debt.id === ref.divida_id)
    if (v) return v
  }
  if (ref.credor) {
    const n = normalize(ref.credor)
    const hits = views.filter((v) => normalize(v.debt.creditor).includes(n))
    if (hits.length === 1) return hits[0]
    if (hits.length > 1) throw new ToolError(`Mais de uma dívida com "${ref.credor}": ${hits.map((h) => `${h.debt.creditor} (id ${h.debt.id})`).join("; ")}`)
  }
  throw new ToolError(`Dívida não encontrada. Chame listar_dividas. Existentes: ${views.map((v) => `${v.debt.creditor} (id ${v.debt.id})`).join("; ") || "nenhuma"}`)
}

// ---------- Cartões ----------

async function categoryBars(from: string, to: string, kind: "EXPENSE" | "INCOME", compare: boolean, drillParentId?: number) {
  const cur = await byCategory(filters(from, to, { kind, categoryId: drillParentId }), drillParentId)
  const prevP = previous(from, to)
  const prev = compare ? new Map((await byCategory(filters(prevP.from, prevP.to, { kind, categoryId: drillParentId }), drillParentId)).map((r) => [r.id, r.total])) : new Map<number | null, number>()
  const max = Math.max(1, ...cur.map((r) => r.total), ...prev.values())
  return {
    rows: cur.map((r) => ({ id: r.id, name: r.name ?? "Sem categoria", color: r.color, total: r.total, prev: prev.get(r.id) ?? 0, delta: compare ? delta(r.total, prev.get(r.id) ?? 0) : null })),
    max,
    total: cur.reduce((t, r) => t + r.total, 0),
    prevTotal: [...prev.values()].reduce((t, v) => t + v, 0),
  }
}

function barsBlock(rows: Awaited<ReturnType<typeof categoryBars>>, kind: "EXPENSE" | "INCOME", limit = 8): CardBlock {
  const bad = kind === "EXPENSE"
  return {
    type: "bars",
    legend: rows.rows.some((r) => r.delta != null) ? "Barra: período atual · traço: período anterior" : undefined,
    rows: rows.rows.slice(0, limit).map((r) => ({
      label: r.name,
      value: r.total,
      max: rows.max,
      text: brl(r.total),
      color: r.color ?? undefined,
      marker: r.delta != null ? r.prev : undefined,
      delta: r.delta != null ? pctText(r.delta) : undefined,
      tone: r.delta == null ? undefined : r.delta > 0 === bad ? "bad" : "good",
    })),
  }
}

// ---------- Ferramentas de leitura ----------

const resumoPeriodo = defineTool({
  name: "resumo_periodo",
  label: "Resumo do mês",
  description: "Receitas, despesas e resultado de um mês, comparados ao mês anterior, com as maiores categorias de despesa. Sem transferências entre contas nem transações ignoradas.",
  schema: z.object({ mes: month.optional().describe("Mês (AAAA-MM). Padrão: o mês atual (até hoje).") }),
  async run({ mes }) {
    const ym = mes ?? monthOf(today())
    const now = today()
    const from = monthStart(ym)
    const to = monthOf(now) === ym ? now : monthEnd(ym)
    const pFrom = monthStart(addMonths(ym, -1))
    const pTo = monthOf(now) === ym ? `${addMonths(ym, -1)}-${String(Math.min(Number(now.slice(8)), Number(monthEnd(addMonths(ym, -1)).slice(8)))).padStart(2, "0")}` : monthEnd(addMonths(ym, -1))
    const [cur, prev, cats] = await Promise.all([totals(filters(from, to)), totals(filters(pFrom, pTo)), categoryBars(from, to, "EXPENSE", true)])
    // compara com o mesmo trecho do mês anterior: refaz as categorias no período anterior equivalente
    const prevCats = new Map((await byCategory(filters(pFrom, pTo, { kind: "EXPENSE" }))).map((r) => [r.id, r.total]))
    const rows = cats.rows.map((r) => ({ ...r, prev: prevCats.get(r.id) ?? 0, delta: delta(r.total, prevCats.get(r.id) ?? 0) }))
    const result = cur.income - cur.expense
    const prevResult = prev.income - prev.expense
    const card: Card = {
      title: `Resumo de ${monthLabel(ym)}${monthOf(now) === ym ? " (até hoje)" : ""}`,
      icon: "chart",
      href: `/relatorios?periodo=custom&de=${from}&ate=${to}`,
      hrefLabel: "Abrir em Relatórios",
      blocks: [
        { type: "kpis", items: [{ label: "Receitas", value: brl(cur.income), tone: "good" }, { label: "Despesas", value: brl(cur.expense), tone: "bad" }, { label: "Resultado", value: brl(result), tone: result >= 0 ? "good" : "bad" }] },
        barsBlock({ ...cats, rows }, "EXPENSE", 6),
      ],
    }
    return {
      model: {
        periodo: { de: from, ate: to },
        receitas: cur.income, despesas: cur.expense, resultado: result,
        mesAnteriorMesmoTrecho: { de: pFrom, ate: pTo, receitas: prev.income, despesas: prev.expense, resultado: prevResult },
        variacaoDespesas: delta(cur.expense, prev.expense),
        maioresCategoriasDespesa: rows.slice(0, 8).map((r) => ({ categoria: r.name, total: r.total, anterior: r.prev, variacao: r.delta })),
      },
      card,
    }
  },
})

const gastosPorCategoria = defineTool({
  name: "gastos_por_categoria",
  label: "Gastos por categoria",
  description: "Total por categoria num período (despesas por padrão). Com `categoria` de nível 1, detalha por subcategoria. `comparar` traz o período anterior de mesmo tamanho.",
  schema: z.object({
    ...periodShape,
    tipo: z.enum(["despesa", "receita"]).optional(),
    categoria: z.string().optional().describe("Categoria de nível 1 para detalhar em subcategorias (ex.: Alimentação)."),
    comparar: z.boolean().optional().describe("Compara com o período anterior de mesmo tamanho."),
  }),
  async run(input) {
    const { from, to } = period(input.de, input.ate)
    const kind = input.tipo === "receita" ? "INCOME" : "EXPENSE"
    const drill = input.categoria ? await findFilterCategory(input.categoria) : undefined
    const { tree } = await categoryIndex()
    const parentDrill = drill && tree.some((p) => p.id === drill.id) ? drill : undefined
    const data = await categoryBars(from, to, kind, !!input.comparar, parentDrill?.id)
    const prevP = previous(from, to)
    const card: Card = {
      title: `${kind === "EXPENSE" ? "Despesas" : "Receitas"}${drill ? ` · ${drill.label}` : " por categoria"} · ${dayMonth(from)} a ${dayMonth(to)}`,
      icon: "chart",
      href: `/relatorios?periodo=custom&de=${from}&ate=${to}`,
      hrefLabel: "Abrir em Relatórios",
      blocks: [
        { type: "kpis", items: input.comparar ? [{ label: "Período", value: brl(data.total) }, { label: "Anterior", value: brl(data.prevTotal) }, { label: "Variação", value: pctText(delta(data.total, data.prevTotal)), tone: delta(data.total, data.prevTotal) == null ? undefined : (delta(data.total, data.prevTotal)! > 0) === (kind === "EXPENSE") ? "bad" : "good" }] : [{ label: "Total", value: brl(data.total) }] },
        barsBlock(data, kind, 10),
      ],
    }
    return {
      model: { periodo: { de: from, ate: to }, anterior: input.comparar ? prevP : undefined, total: data.total, totalAnterior: input.comparar ? data.prevTotal : undefined, variacao: input.comparar ? delta(data.total, data.prevTotal) : undefined, categorias: data.rows.map((r) => ({ categoria: r.name, total: r.total, anterior: input.comparar ? r.prev : undefined, variacao: r.delta })) },
      card,
    }
  },
})

const listarTransacoes = defineTool({
  name: "listar_transacoes",
  label: "Transações",
  description: "Lista transações com filtros (período, texto na descrição, categoria, conta, tipo, só as sem categoria). Devolve id, data, descrição, valor (negativo = saída) e categoria. Máximo 50.",
  schema: z.object({
    ...periodShape,
    texto: z.string().optional(),
    categoria: z.string().optional(),
    conta: z.string().optional(),
    tipo: z.enum(["despesa", "receita"]).optional(),
    sem_categoria: z.boolean().optional(),
    limite: z.number().int().min(1).max(50).optional(),
  }),
  async run(input) {
    const now = today()
    const from = input.de ?? addDays(now, -30)
    const to = input.ate ?? now
    const cat = input.categoria ? await findFilterCategory(input.categoria) : undefined
    const acc = input.conta ? await findAccount(input.conta) : undefined
    const f = filters(from, to, { q: input.texto, categoryId: cat?.id, accountId: acc?.id, kind: input.tipo === "receita" ? "INCOME" : input.tipo === "despesa" ? "EXPENSE" : undefined, view: input.sem_categoria ? "uncategorized" : undefined })
    const { rows, count } = await listTransactions(f)
    const limit = input.limite ?? 20
    const list = rows.slice(0, limit).map(({ tx, accountName, subName, parentName }) => ({ id: tx.id, data: tx.date, descricao: tx.description, valor: tx.amount, conta: accountName, categoria: subName ? `${parentName} / ${subName}` : null, tipo: tx.kind }))
    const card: Card = {
      title: `Transações · ${dayMonth(from)} a ${dayMonth(to)}`,
      icon: "list",
      href: `/transacoes?periodo=custom&de=${from}&ate=${to}${acc ? `&conta=${acc.id}` : ""}${input.texto ? `&q=${encodeURIComponent(input.texto)}` : ""}`,
      hrefLabel: "Abrir em Transações",
      blocks: [
        { type: "table", columns: ["Data", "Descrição", "Categoria", "Valor"], align: ["l", "l", "l", "r"], rows: list.map((t) => [dateBR(t.data).slice(0, 5), t.descricao, t.categoria?.split(" / ").at(-1) ?? "—", brl(t.valor)]), csvName: "transacoes" },
        ...(count > list.length ? [{ type: "note" as const, text: `Mostrando ${list.length} de ${count} transações.` }] : []),
      ],
    }
    return { model: { total: count, mostrando: list.length, transacoes: list }, card }
  },
})

const TYPE_LABEL: Record<string, string> = { CHECKING: "Conta corrente", CREDIT_CARD: "Cartão de crédito", SAVINGS_INVESTMENT: "Poupança/Investimento", CASH: "Dinheiro" }

const saldosContas = defineTool({
  name: "saldos_contas",
  label: "Saldos das contas",
  description: "Saldo de cada conta ativa (cartão de crédito aparece negativo: é a fatura em aberto) e o patrimônio total. Indica quais contas são manuais.",
  schema: z.object({}),
  async run() {
    const list = (await listAccounts()).filter((a) => !a.archived)
    const total = list.reduce((t, a) => t + a.balance, 0)
    const card: Card = {
      title: "Saldos das contas",
      icon: "wallet",
      href: "/contas",
      hrefLabel: "Abrir em Contas",
      blocks: [
        { type: "kpis", items: [{ label: "Patrimônio", value: brl(total), tone: total >= 0 ? "good" : "bad" }, { label: "Contas", value: String(list.length) }] },
        { type: "table", columns: ["Conta", "Tipo", "Saldo"], align: ["l", "l", "r"], rows: list.map((a) => [a.name, a.investmentId ? "Investimento" : (TYPE_LABEL[a.type] ?? a.type), brl(a.balance)]), csvName: "contas" },
      ],
    }
    return { model: { patrimonio: total, contas: list.map((a) => ({ id: a.id, nome: a.name, tipo: TYPE_LABEL[a.type] ?? a.type, saldo: a.balance, manual: a.source === "MANUAL", investimento: a.investmentId != null })) }, card }
  },
})

function debtCard(views: DebtView[]): Card {
  const open = views.filter((v) => v.ev.status !== "paid")
  const remaining = open.reduce((t, v) => t + v.ev.remaining, 0)
  const overdue = open.reduce((t, v) => t + v.ev.overdue.reduce((s, r) => s + r.amount, 0), 0)
  return {
    title: "Dívidas",
    icon: "debt",
    href: "/dividas",
    hrefLabel: "Abrir em Dívidas",
    blocks: [
      { type: "kpis", items: [{ label: "Em aberto", value: brl(remaining) }, { label: "Em atraso", value: brl(overdue), tone: overdue > 0 ? "bad" : undefined }, { label: "Dívidas", value: String(open.length) }] },
      { type: "table", columns: ["Credor", "Restante", "Próxima", "Regra"], align: ["l", "r", "l", "l"], rows: open.map((v) => [v.debt.creditor, brl(v.ev.remaining), v.ev.next?.due ? `${dayMonth(v.ev.next.due)} · ${brl(v.ev.next.amount)}` : "sem data", scheduleLabel(v.schedule)]), csvName: "dividas" },
    ],
  }
}

const listarDividas = defineTool({
  name: "listar_dividas",
  label: "Dívidas",
  description: "Dívidas em aberto (pessoas e empresas, fora do cartão): total, quanto falta, próximas parcelas, atrasos e a regra de vencimento. Traz os ids para registrar pagamentos.",
  schema: z.object({}),
  async run() {
    const { views } = await loadDebts()
    return {
      model: {
        dividas: views.map((v) => ({
          id: v.debt.id, credor: v.debt.creditor, relacao: v.debt.relation, descricao: v.debt.description, total: v.ev.total, pago: v.ev.paid, restante: v.ev.remaining, situacao: v.ev.status, regra: scheduleLabel(v.schedule),
          itens: v.items.map((i) => ({ descricao: i.description, quantidade: i.quantity, valorUnitario: i.unitAmount })),
          parcelas: v.ev.rows.map((r) => ({ numero: r.number, valor: r.amount, vencimento: r.due, vencimentoPrevisto: r.estimated, pagaEm: r.paidOn })),
        })),
      },
      card: debtCard(views),
    }
  },
})

const limitesEMetas = defineTool({
  name: "limites_e_metas",
  label: "Limites e metas",
  description: "Limites de gasto por categoria (uso no mês atual), metas de poupança (progresso e quanto guardar por mês) e a reserva de emergência.",
  schema: z.object({}),
  async run() {
    const now = today()
    const [limits, goals, reserve] = await Promise.all([limitsWithUsage({ from: monthStart(monthOf(now)), to: monthEnd(monthOf(now)) }), goalsWithProgress(), reserveOverview()])
    const gp = goals.map((g) => ({ g, p: goalProgress({ target: g.targetAmount, current: g.current, createdAt: g.createdAt.toISOString().slice(0, 10), deadline: g.deadline, today: now }) }))
    const blocks: CardBlock[] = []
    if (limits.length) blocks.push({ type: "bars", rows: limits.map((l) => ({ label: l.label, value: l.spent, max: Math.max(l.limit, l.spent), text: `${brl(l.spent)} de ${brl(l.limit)}`, marker: l.limit, tone: l.spent >= l.limit ? "bad" : undefined })), legend: "Traço: limite do mês" })
    if (gp.length) blocks.push({ type: "table", columns: ["Meta", "Progresso", "Falta", "Por mês"], align: ["l", "r", "r", "r"], rows: gp.map(({ g, p }) => [g.name, `${Math.round(p.pct * 100)}%`, brl(p.remaining), brl(p.monthlyNeeded)]), csvName: "metas" })
    if (!blocks.length) blocks.push({ type: "note", text: "Você ainda não definiu limites nem metas." })
    return {
      model: {
        limitesMesAtual: limits.map((l) => ({ categoria: l.label, limite: l.limit, gasto: l.spent, estourado: l.spent >= l.limit })),
        metas: gp.map(({ g, p }) => ({ nome: g.name, alvo: g.targetAmount, atual: g.current, prazo: g.deadline, falta: p.remaining, guardarPorMes: p.monthlyNeeded, situacao: p.state })),
        reserva: { saldo: reserve.balance, despesaMediaMensal: reserve.avgMonthlyExpense },
      },
      card: { title: "Limites e metas", icon: "target", href: "/limites", hrefLabel: "Abrir em Limites", blocks },
    }
  },
})

const resumoInvestimentos = defineTool({
  name: "resumo_investimentos",
  label: "Investimentos",
  description: "Carteira de investimentos: total, valor aplicado, resultado e alocação por categoria (atual × alvo).",
  schema: z.object({}),
  async run() {
    const p = await portfolioSummary()
    const card: Card = {
      title: "Carteira de investimentos",
      icon: "trend",
      href: "/investimentos",
      hrefLabel: "Abrir em Investimentos",
      blocks: [
        { type: "kpis", items: [{ label: "Patrimônio", value: brl(p.total) }, { label: "Aplicado", value: brl(p.invested) }, { label: "Resultado", value: `${brl(p.profit)}${p.profitPct != null ? ` (${signedPct(p.profitPct)})` : ""}`, tone: p.profit >= 0 ? "good" : "bad" }] },
        { type: "bars", rows: p.allocation.map((a) => ({ label: classLabel(a.assetClass), value: a.value, max: Math.max(1, ...p.allocation.map((x) => x.value)), text: `${Math.round(a.pct * 100)}%`, marker: a.target != null ? a.target * p.total : undefined })), legend: p.hasTargets ? "Traço: alvo" : undefined },
      ],
    }
    return {
      model: { total: p.total, aplicado: p.invested, resultado: p.profit, rentabilidade: p.profitPct, alocacao: p.allocation.map((a) => ({ categoria: classLabel(a.assetClass), valor: a.value, percentual: a.pct, alvo: a.target })), ativos: p.holdings.slice(0, 25).map((h) => ({ nome: h.name, codigo: h.code, categoria: classLabel(h.assetClass), valor: h.value, aplicado: h.invested, resultadoPct: h.profitPct })) },
      card,
    }
  },
})

const listarCategorias = defineTool({
  name: "listar_categorias",
  label: "Categorias",
  description: "Lista as categorias e subcategorias existentes (use estes nomes ao propor lançamentos, regras ou limites).",
  schema: z.object({}),
  async run() {
    const { subs } = await categoryIndex()
    return { model: { despesa: subs.filter((s) => s.kind === "EXPENSE").map((s) => s.label), receita: subs.filter((s) => s.kind === "INCOME").map((s) => s.label) } }
  },
})

const gerarRelatorio = defineTool({
  name: "gerar_relatorio",
  label: "Relatório",
  description: "Monta um relatório pronto para ler e baixar (CSV): `mensal` (resumo, categorias e maiores despesas), `categorias` (período livre), `dividas` ou `patrimonio` (últimos 12 meses).",
  schema: z.object({ tipo: z.enum(["mensal", "categorias", "dividas", "patrimonio"]), mes: month.optional(), ...periodShape }),
  async run(input) {
    if (input.tipo === "dividas") {
      const { views } = await loadDebts()
      return { model: { relatorio: "dividas", dividas: views.map((v) => ({ credor: v.debt.creditor, restante: v.ev.remaining, situacao: v.ev.status })) }, card: { ...debtCard(views), title: "Relatório de dívidas", icon: "report" } }
    }
    if (input.tipo === "patrimonio") {
      const now = monthOf(today())
      const months = Array.from({ length: 12 }, (_, i) => addMonths(now, i - 11))
      const series = await netWorth(months)
      const first = series[0]?.value ?? 0
      const last = series.at(-1)?.value ?? 0
      return {
        model: { relatorio: "patrimonio", serie: series },
        card: {
          title: "Relatório de patrimônio · 12 meses",
          icon: "report",
          href: "/",
          hrefLabel: "Abrir no Dashboard",
          blocks: [
            { type: "kpis", items: [{ label: "Hoje", value: brl(last) }, { label: "Há 12 meses", value: brl(first) }, { label: "Variação", value: brl(last - first), tone: last >= first ? "good" : "bad" }] },
            { type: "table", columns: ["Mês", "Patrimônio"], align: ["l", "r"], rows: series.map((s) => [monthLabel(s.month), brl(s.value)]), csvName: "patrimonio" },
          ],
        },
      }
    }
    const ym = input.mes ?? monthOf(today())
    const { from, to } = input.tipo === "mensal" ? { from: monthStart(ym), to: monthOf(today()) === ym ? today() : monthEnd(ym) } : period(input.de, input.ate)
    const [cur, cats, big] = await Promise.all([totals(filters(from, to)), categoryBars(from, to, "EXPENSE", false), listTransactions(filters(from, to, { kind: "EXPENSE" }))])
    const top = [...big.rows].sort((a, b) => a.tx.amount - b.tx.amount).slice(0, 10)
    const blocks: CardBlock[] = [
      { type: "kpis", items: [{ label: "Receitas", value: brl(cur.income), tone: "good" }, { label: "Despesas", value: brl(cur.expense), tone: "bad" }, { label: "Resultado", value: brl(cur.income - cur.expense), tone: cur.income >= cur.expense ? "good" : "bad" }] },
      { type: "table", columns: ["Categoria", "Total", "%"], align: ["l", "r", "r"], rows: cats.rows.map((r) => [r.name, brl(r.total), cats.total ? `${Math.round((r.total / cats.total) * 100)}%` : "—"]), csvName: "categorias" },
    ]
    if (input.tipo === "mensal") blocks.push({ type: "table", columns: ["Data", "Maiores despesas", "Valor"], align: ["l", "l", "r"], rows: top.map((t) => [dateBR(t.tx.date).slice(0, 5), t.tx.description, brl(t.tx.amount)]), csvName: "maiores-despesas" })
    return {
      model: { relatorio: input.tipo, periodo: { de: from, ate: to }, receitas: cur.income, despesas: cur.expense, categorias: cats.rows.map((r) => ({ categoria: r.name, total: r.total })), maioresDespesas: top.map((t) => ({ data: t.tx.date, descricao: t.tx.description, valor: t.tx.amount })) },
      card: { title: `Relatório ${input.tipo === "mensal" ? `de ${monthLabel(ym)}` : `· ${dayMonth(from)} a ${dayMonth(to)}`}`, icon: "report", href: `/relatorios?periodo=custom&de=${from}&ate=${to}`, hrefLabel: "Abrir em Relatórios", blocks },
    }
  },
})

// ---------- Ferramentas de escrita (só propõem) ----------

async function propose(ctx: Ctx, kind: string, op: unknown, view: Omit<ActionView, "id" | "kind" | "status" | "result">): Promise<Result> {
  const [row] = await db.insert(chatActions).values({ conversationId: ctx.conversationId, toolUseId: ctx.toolUseId, kind, payload: { op, view } }).returning({ id: chatActions.id })
  const action: ActionView = { id: row.id, kind, status: "PENDING", result: null, ...view }
  return { model: { status: "aguardando_confirmacao_do_usuario", observacao: "Nada foi salvo. O usuário vê um cartão com Confirmar/Cancelar. Peça para ele confirmar e NÃO diga que já salvou." }, action }
}

const propTransacoes = defineTool({
  name: "propor_transacoes",
  label: "Lançamentos",
  description: "Propõe criar transações numa conta MANUAL (ex.: a partir de um extrato anexado). Valor negativo = saída, positivo = entrada. Não grava: o usuário confirma na tela. Ignora lançamentos idênticos já existentes.",
  schema: z.object({
    conta: z.string().describe("Nome da conta manual."),
    transacoes: z.array(z.object({ data: date, descricao: z.string().min(1).max(200), valor: z.number().refine((v) => v !== 0, "valor zero"), categoria: z.string().optional().describe("Subcategoria (nome de listar_categorias).") })).min(1).max(100),
  }),
  async run(input, ctx) {
    const acc = await findAccount(input.conta, { manualOnly: true })
    const existing = await db.select({ date: transactions.date, amount: transactions.amount, description: transactions.description }).from(transactions).where(eq(transactions.accountId, acc.id))
    const seen = new Set(existing.map((e) => `${e.date}|${e.amount}|${normalize(e.description)}`))
    const rows: { date: string; description: string; amount: number; subcategoryId: number | null; label: string | null }[] = []
    let dup = 0
    const problems: string[] = []
    for (const t of input.transacoes) {
      if (seen.has(`${t.data}|${t.valor}|${normalize(t.descricao)}`)) {
        dup++
        continue
      }
      let sub: Awaited<ReturnType<typeof findSub>> | undefined
      if (t.categoria) {
        try {
          sub = await findSub(t.categoria)
        } catch (e) {
          problems.push(`${t.descricao}: ${(e as Error).message}`)
          continue
        }
        if ((sub.kind === "EXPENSE") !== (t.valor < 0)) {
          problems.push(`${t.descricao}: a categoria "${sub.label}" é de ${sub.kind === "EXPENSE" ? "despesa" : "receita"}, mas o valor é ${t.valor < 0 ? "uma saída" : "uma entrada"}`)
          continue
        }
      }
      rows.push({ date: t.data, description: t.descricao, amount: t.valor, subcategoryId: sub?.id ?? null, label: sub?.label ?? null })
    }
    if (problems.length) throw new ToolError(`Corrija e proponha de novo:\n${problems.slice(0, 10).join("\n")}`)
    if (!rows.length) throw new ToolError(`Todos os ${dup} lançamentos já existem nessa conta; nada a propor.`)
    const total = rows.reduce((t, r) => t + r.amount, 0)
    return propose(ctx, "transactions", { accountId: acc.id, rows }, {
      title: `${rows.length} ${rows.length === 1 ? "transação" : "transações"} em ${acc.name}`,
      subtitle: dup ? `${dup} já existiam e foram ignoradas` : undefined,
      amount: brl(total),
      rows: [...rows.slice(0, 8).map((r) => ({ label: `${dateBR(r.date).slice(0, 5)} · ${r.description}${r.label ? ` · ${r.label.split(" / ").at(-1)}` : ""}`, value: brl(r.amount) })), ...(rows.length > 8 ? [{ label: `…e mais ${rows.length - 8}`, value: "" }] : [])],
      href: "/transacoes",
      hrefLabel: "Ver em Transações",
    })
  },
})

const propCategorizacao = defineTool({
  name: "propor_categorizacao",
  label: "Categorização",
  description: "Propõe (re)categorizar transações existentes pelo id. Não grava: o usuário confirma na tela.",
  schema: z.object({ transacoes: z.array(z.object({ id: z.number().int().positive(), categoria: z.string() })).min(1).max(100) }),
  async run(input, ctx) {
    const found = await db.select({ id: transactions.id, description: transactions.description, amount: transactions.amount, date: transactions.date }).from(transactions).where(inArray(transactions.id, input.transacoes.map((t) => t.id)))
    const byId = new Map(found.map((t) => [t.id, t]))
    const rows: { id: number; subcategoryId: number; label: string; description: string }[] = []
    for (const t of input.transacoes) {
      const tx = byId.get(t.id)
      if (!tx) throw new ToolError(`Transação ${t.id} não existe`)
      const sub = await findSub(t.categoria)
      rows.push({ id: t.id, subcategoryId: sub.id, label: sub.label, description: tx.description })
    }
    return propose(ctx, "categorize", { rows: rows.map((r) => ({ id: r.id, subcategoryId: r.subcategoryId })) }, {
      title: `Categorizar ${rows.length} ${rows.length === 1 ? "transação" : "transações"}`,
      rows: [...rows.slice(0, 8).map((r) => ({ label: r.description, value: r.label.split(" / ").at(-1)! })), ...(rows.length > 8 ? [{ label: `…e mais ${rows.length - 8}`, value: "" }] : [])],
      href: "/transacoes",
      hrefLabel: "Ver em Transações",
    })
  },
})

const propDivida = defineTool({
  name: "propor_divida",
  label: "Nova dívida",
  description: "Propõe cadastrar uma dívida (pessoa ou empresa, fora do cartão). Cada item vai separado (ex.: 4 consultas de 90 e 2 de 110). Não grava: o usuário confirma na tela.",
  schema: z.object({
    credor: z.string().min(1).max(120),
    relacao: z.string().max(60).optional().describe("Amigo, Família, Profissional, Empresa…"),
    descricao: z.string().max(500).optional(),
    itens: z.array(z.object({ descricao: z.string().min(1), quantidade: z.number().int().min(1), valor_unitario: z.number().positive() })).min(1).max(60),
    forma: z.enum(["unica", "parcelada", "livre"]).describe("unica = uma parcela; parcelada = várias parcelas iguais; livre = sem parcelas, paga quando der."),
    parcelas: z.number().int().min(1).max(120).optional(),
    vencimento: z.object({ tipo: z.enum(["dia_fixo", "apos_salario", "data", "sem_data"]), dia: z.number().int().min(1).max(31).optional(), dias_apos_salario: z.number().int().min(0).max(30).optional(), data: date.optional() }).optional(),
    lembrete_dias_antes: z.number().int().min(0).max(30).nullable().optional(),
  }),
  async run(i, ctx) {
    const v = i.vencimento
    const kind = i.forma === "livre" || !v ? "NONE" : ({ dia_fixo: "FIXED_DAY", apos_salario: "AFTER_SALARY", data: "DATE", sem_data: "NONE" } as const)[v.tipo]
    const value: DebtInputValue = {
      creditor: i.credor,
      relation: i.relacao,
      description: i.descricao,
      items: i.itens.map((x) => ({ description: x.descricao, quantity: x.quantidade, unitAmount: x.valor_unitario })),
      mode: i.forma === "livre" ? "FLEX" : i.forma === "unica" ? "LUMP" : "INSTALLMENTS",
      installments: i.parcelas ?? 1,
      schedule: { kind, day: v?.dia, offsetDays: v?.dias_apos_salario ?? 1, date: v?.data },
      remindDaysBefore: i.lembrete_dias_antes === undefined ? (kind === "NONE" ? null : 1) : i.lembrete_dias_antes,
    }
    const parsed = debtInput.safeParse(value)
    if (!parsed.success) throw new ToolError(`Dados da dívida inválidos: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`)
    const total = i.itens.reduce((t, x) => t + Math.round(x.valor_unitario * 100) * x.quantidade, 0) / 100
    const n = parsed.data.mode === "LUMP" ? 1 : parsed.data.installments
    const sched = { kind, day: v?.dia ?? null, offsetDays: v?.dias_apos_salario ?? 1, date: v?.data ?? null, startMonth: null }
    return propose(ctx, "debt", value, {
      title: i.credor,
      subtitle: [i.relacao, i.descricao].filter(Boolean).join(" · ") || undefined,
      amount: brl(total),
      rows: i.itens.map((x) => ({ label: `${x.quantidade > 1 ? `${x.quantidade} × ` : ""}${x.descricao}`, value: brl(x.quantidade * x.valor_unitario) })),
      tags: [parsed.data.mode === "FLEX" ? "Pagamento livre" : `${n} × ${brl(total / n)}`, scheduleLabel(sched), ...(parsed.data.remindDaysBefore != null ? [parsed.data.remindDaysBefore === 0 ? "Lembrete no dia" : `Lembrete ${parsed.data.remindDaysBefore} dia(s) antes`] : [])],
      href: "/dividas",
      hrefLabel: "Ver em Dívidas",
    })
  },
})

const propPagamento = defineTool({
  name: "propor_pagamento_divida",
  label: "Pagamento de dívida",
  description: "Propõe registrar o pagamento de uma parcela (ou um pagamento livre) de uma dívida existente. Não grava: o usuário confirma na tela.",
  schema: z.object({ credor: z.string().optional(), divida_id: z.number().int().positive().optional(), valor: z.number().positive().optional().describe("Padrão: valor da parcela."), data: date.optional().describe("Padrão: hoje."), parcela: z.number().int().positive().optional().describe("Número da parcela. Padrão: a próxima em aberto.") }),
  async run(i, ctx) {
    const { views } = await loadDebts()
    const v = findDebt(views, i)
    if (v.ev.remaining <= 0) throw new ToolError(`${v.debt.creditor} já está quitada.`)
    const open = v.ev.rows.filter((r) => !r.paidOn)
    const row = i.parcela ? open.find((r) => r.number === i.parcela) : (v.ev.next ?? open[0])
    if (i.parcela && !row) throw new ToolError(`A parcela ${i.parcela} não está em aberto.`)
    if (!row && !i.valor) throw new ToolError(`${v.debt.creditor} é de pagamento livre: informe o valor pago.`)
    const amount = i.valor ?? row!.amount
    const when = i.data ?? today()
    const match = row ? (await matchPayments({ amount, due: row.due }, v.debt.creditor, 1))[0] : undefined
    return propose(ctx, "payment", { debtId: v.debt.id, installmentId: row?.id ?? null, amount, date: when, transactionId: match?.id ?? null }, {
      title: `Pagamento · ${v.debt.creditor}`,
      subtitle: row ? `Parcela ${row.number}${v.ev.rows.length > 1 ? ` de ${v.ev.rows.length}` : ""}` : "Pagamento livre",
      amount: brl(amount),
      rows: [{ label: "Data", value: dateBR(when) }, { label: "Restante depois", value: brl(Math.max(0, v.ev.remaining - amount)) }, ...(match ? [{ label: "Vincula à transação", value: `${match.description} · ${dateBR(match.date)}` }] : [])],
      href: "/dividas",
      hrefLabel: "Ver em Dívidas",
    })
  },
})

const propRegra = defineTool({
  name: "propor_regra",
  label: "Regra de categoria",
  description: "Propõe criar uma regra que categoriza automaticamente as transações cuja descrição bate com o padrão. Não grava: o usuário confirma na tela.",
  schema: z.object({ padrao: z.string().min(1).max(200), categoria: z.string(), correspondencia: z.enum(["contem", "comeca_com", "regex"]).optional(), tipo: z.enum(["despesa", "receita"]).optional() }),
  async run(i, ctx) {
    const sub = await findSub(i.categoria)
    if (i.correspondencia === "regex") {
      try {
        new RegExp(i.padrao)
      } catch {
        throw new ToolError("Expressão regular inválida")
      }
    }
    const matchType = ({ contem: "CONTAINS", comeca_com: "STARTS_WITH", regex: "REGEX" } as const)[i.correspondencia ?? "contem"]
    return propose(ctx, "rule", { matchType, pattern: i.padrao, kind: i.tipo ? (i.tipo === "despesa" ? "EXPENSE" : "INCOME") : null, subcategoryId: sub.id }, {
      title: "Nova regra de categoria",
      rows: [{ label: matchType === "CONTAINS" ? "Descrição contém" : matchType === "STARTS_WITH" ? "Descrição começa com" : "Descrição bate com (regex)", value: i.padrao }, { label: "Categoria", value: sub.label }],
      href: "/regras",
      hrefLabel: "Ver em Regras",
    })
  },
})

const propLimite = defineTool({
  name: "propor_limite",
  label: "Limite de gasto",
  description: "Propõe definir (ou alterar) o limite mensal de uma categoria de despesa. Não grava: o usuário confirma na tela.",
  schema: z.object({ categoria: z.string(), valor_mensal: z.number().positive() }),
  async run(i, ctx) {
    const c = await findFilterCategory(i.categoria)
    const [row] = await db.select().from(categories).where(and(eq(categories.id, c.id)))
    if (row?.kind !== "EXPENSE") throw new ToolError("Limites valem só para categorias de despesa")
    return propose(ctx, "limit", { categoryId: c.id, monthlyAmount: i.valor_mensal }, { title: `Limite · ${c.label}`, amount: brl(i.valor_mensal), rows: [{ label: "Por mês", value: brl(i.valor_mensal) }], href: "/limites", hrefLabel: "Ver em Limites" })
  },
})

// ---------- Registro ----------

const ALL = [resumoPeriodo, gastosPorCategoria, listarTransacoes, saldosContas, listarDividas, limitesEMetas, resumoInvestimentos, listarCategorias, gerarRelatorio, propTransacoes, propCategorizacao, propDivida, propPagamento, propRegra, propLimite]

export const TOOL_LABELS = Object.fromEntries(ALL.map((t) => [t.name, t.label]))

/** Definições para a API (JSON Schema vindo do mesmo zod que valida a entrada). */
export const toolDefinitions = ALL.map((t) => {
  const schema = { ...(z.toJSONSchema(t.schema) as Record<string, unknown>) }
  delete schema.$schema
  return { name: t.name, description: t.description, input_schema: schema as { type: "object"; properties?: Record<string, unknown>; required?: string[] }, eager_input_streaming: true }
})

/** Valida a entrada e roda a ferramenta. Erros esperados voltam como texto para o modelo corrigir. */
export async function runTool(name: string, input: unknown, ctx: Ctx): Promise<{ ok: true; result: Result } | { ok: false; error: string }> {
  const tool = ALL.find((t) => t.name === name)
  if (!tool) return { ok: false, error: `Ferramenta desconhecida: ${name}` }
  const parsed = tool.schema.safeParse(input ?? {})
  if (!parsed.success) return { ok: false, error: `Entrada inválida: ${parsed.error.issues.map((i) => `${i.path.join(".") || "entrada"}: ${i.message}`).join("; ")}` }
  try {
    return { ok: true, result: await tool.run(parsed.data, ctx) }
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, error: e.message }
    console.error(`cofy tool ${name}:`, e instanceof Error ? e.message : e)
    return { ok: false, error: "Não consegui consultar os dados agora." }
  }
}

