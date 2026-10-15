import { sql } from "drizzle-orm"
import type { PgliteDatabase } from "drizzle-orm/pglite"
import { addDays, addMonths, monthEnd, monthOf, today } from "@/lib/domain/dates"
import { SEED_CATEGORIES, SEED_PLUGGY_MAP } from "./seed-data"
import * as s from "./schema"

// Dados fictícios da demonstração: fixos (gerador determinístico), só as datas acompanham o dia de hoje.

type Acc = "checking" | "card" | "caixinha" | "cdb" | "cash"
type Row = {
  acc: Acc
  date: string
  amount: number
  description: string
  sub: string | null
  source: "RULE" | "PLUGGY_MAP" | "USER" | "NONE"
  suggested?: string
  confidence?: number
  transfer?: "single" | "pair"
}

// day fixo = recorrente; sem day = data aleatória. `chance` = probabilidade por mês.
type Tpl = { acc: Acc; sub: string; desc: string[]; min: number; max?: number; day?: number; count?: number; chance?: number; source?: Row["source"] }
const TEMPLATES: Tpl[] = [
  { acc: "checking", sub: "Salário/Salário", desc: ["SALARIO EMPRESA XYZ LTDA"], min: 8500, day: 5 },
  { acc: "checking", sub: "Moradia/Aluguel", desc: ["PIX ALUGUEL IMOBILIARIA"], min: 2200, day: 7, source: "RULE" },
  { acc: "checking", sub: "Moradia/Condomínio", desc: ["BOLETO CONDOMINIO RESIDENCIAL"], min: 650, day: 8, source: "RULE" },
  { acc: "checking", sub: "Moradia/Contas da casa", desc: ["CPFL ENERGIA", "SABESP"], min: 90, max: 230, day: 12, count: 2 },
  { acc: "checking", sub: "Moradia/Internet e telefone", desc: ["VIVO FIBRA"], min: 129.9, day: 15, source: "RULE" },
  { acc: "checking", sub: "Saúde/Plano de saúde", desc: ["UNIMED SEGUROS"], min: 480, day: 10, source: "RULE" },
  { acc: "checking", sub: "Saúde/Academia", desc: ["SMART FIT"], min: 119.9, day: 3, source: "RULE" },
  { acc: "checking", sub: "Alimentação/Mercado", desc: ["SUPERMERCADO EXTRA", "CARREFOUR", "PAO DE ACUCAR"], min: 90, max: 320, count: 2 },
  { acc: "checking", sub: "Transporte/Combustível", desc: ["Posto Shell", "Posto Ipiranga"], min: 170, max: 260, count: 2, source: "RULE" },
  { acc: "checking", sub: "Saúde/Farmácia", desc: ["DROGASIL", "DROGA RAIA"], min: 25, max: 140, chance: 0.8 },
  { acc: "card", sub: "Assinaturas/Streaming", desc: ["Netflix.com"], min: 55.9, day: 14, source: "RULE" },
  { acc: "card", sub: "Assinaturas/Streaming", desc: ["Spotify"], min: 21.9, day: 18 },
  { acc: "card", sub: "Assinaturas/Software", desc: ["Google One"], min: 9.99, day: 20 },
  { acc: "card", sub: "Alimentação/Mercado", desc: ["SUPERMERCADO EXTRA", "ASSAI ATACADISTA", "PAO DE ACUCAR"], min: 60, max: 280, count: 3 },
  { acc: "card", sub: "Alimentação/Restaurantes", desc: ["Outback Steakhouse", "Restaurante Sabor Caseiro", "Madero", "Pizzaria Bella"], min: 45, max: 190, count: 3 },
  { acc: "card", sub: "Alimentação/Delivery", desc: ["iFood *Restaurante"], min: 28, max: 85, count: 2, source: "RULE" },
  { acc: "card", sub: "Transporte/App e táxi", desc: ["Uber *Trip"], min: 12, max: 52, count: 4, source: "RULE" },
  { acc: "card", sub: "Compras/Roupas", desc: ["Zara", "Renner", "C&A"], min: 90, max: 430, chance: 0.6 },
  { acc: "card", sub: "Compras/Eletrônicos", desc: ["Amazon Marketplace", "Kabum"], min: 120, max: 900, chance: 0.2 },
  { acc: "card", sub: "Compras/Casa", desc: ["Leroy Merlin", "Tok&Stok"], min: 80, max: 450, chance: 0.3 },
  { acc: "card", sub: "Lazer/Passeios e eventos", desc: ["Ingresso.com", "Cinemark"], min: 40, max: 160, chance: 0.7 },
  { acc: "card", sub: "Lazer/Viagens", desc: ["Booking.com", "LATAM Airlines"], min: 450, max: 1900, chance: 0.12 },
  { acc: "card", sub: "Educação/Livros", desc: ["Amazon Livros", "Livraria Cultura"], min: 35, max: 120, chance: 0.4 },
  { acc: "card", sub: "Educação/Cursos", desc: ["Udemy"], min: 27.9, max: 89.9, chance: 0.2 },
  { acc: "caixinha", sub: "Rendimentos/Juros e dividendos", desc: ["RENDIMENTOS CAIXINHA"], min: 62, max: 110, day: 28 },
  { acc: "cash", sub: "Alimentação/Mercado", desc: ["Feira livre"], min: 35, max: 90 },
  { acc: "cash", sub: "Transporte/Estacionamento e pedágio", desc: ["Estacionamento"], min: 10, max: 28, count: 2 },
]

// Pendências recentes: [dias atrás, conta, descrição, valor, sugestão do Jev?, confiança?]
const PENDING: [number, Acc, string, number, string?, number?][] = [
  [1, "checking", "PIX ENVIADO JOAO S", -85],
  [2, "card", "COMPRA CARTAO 4421", -64.9],
  [4, "card", "MP *LOJA ABC", -139.9],
  [5, "checking", "PIX RECEBIDO MARIA L", 120],
  [3, "card", "MERCADINHO DO ZE", -47.3, "Alimentação/Mercado", 0.74],
  [6, "card", "PADARIA ESTRELA", -22.5, "Alimentação/Restaurantes", 0.68],
  [8, "checking", "AUTO POSTO BR", -198.4, "Transporte/Combustível", 0.81],
]

const OPENING: Record<Acc, number> = { checking: 3500, card: 0, caixinha: 12000, cdb: 0, cash: 3000 }
const pad = (n: number) => String(n).padStart(2, "0")
const round2 = (n: number) => Math.round(n * 100) / 100

export async function seedDemo(db: PgliteDatabase<typeof import("./schema")>) {
  let seed = 20240607
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const between = (a: number, b: number) => round2(a + rnd() * (b - a))
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]

  const now = today()
  const thisMonth = monthOf(now)
  const months = Array.from({ length: 13 }, (_, i) => addMonths(thisMonth, i - 12))

  const rows: Row[] = []
  // Fatura aberta de cada mês (soma dos gastos no cartão), positiva
  const cardSpend = new Map<string, number>()
  const addCard = (date: string, amount: number) => cardSpend.set(monthOf(date), round2((cardSpend.get(monthOf(date)) ?? 0) - amount))

  for (const m of months) {
    for (const t of TEMPLATES) {
      for (let i = 0; i < (t.count ?? 1); i++) {
        if (rnd() > (t.chance ?? 1)) continue
        const date = `${m}-${pad(t.day ?? 1 + Math.floor(rnd() * 28))}`
        if (date > now) continue
        const value = between(t.min, t.max ?? t.min)
        const amount = t.sub.startsWith("Salário") || t.sub.startsWith("Rendimentos") ? value : -value
        rows.push({ acc: t.acc, date, amount, description: pick(t.desc), sub: t.sub, source: t.source ?? "PLUGGY_MAP" })
        if (t.acc === "card") addCard(date, amount)
      }
    }
    // Reserva: aplicação mensal (par) e pagamento da fatura do mês anterior (transferência sem par)
    if (`${m}-06` <= now) rows.push({ acc: "checking", date: `${m}-06`, amount: -1000, description: "TED RESERVA CAIXINHA", sub: null, source: "NONE", transfer: "pair" })
    const prev = cardSpend.get(addMonths(m, -1))
    if (prev && `${m}-10` <= now) rows.push({ acc: "checking", date: `${m}-10`, amount: -prev, description: "PAGAMENTO FATURA CARTAO", sub: null, source: "NONE", transfer: "single" })
  }
  for (const [ago, acc, description, amount, suggested, confidence] of PENDING) {
    const date = addDays(now, -ago)
    rows.push({ acc, date, amount, description, sub: null, source: "NONE", suggested, confidence })
    if (acc === "card") addCard(date, amount)
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))

  // CDB: sem transações; cresce com aportes e rendimento ao longo dos snapshots
  const balanceAt = (acc: Acc, until: string) => {
    if (acc === "card") return -(cardSpend.get(monthOf(until)) ?? 0) // fatura aberta, como dívida
    if (acc === "cdb") return 20000 + months.indexOf(monthOf(until)) * 620
    return round2(OPENING[acc] + rows.filter((r) => r.acc === acc && r.date <= until).reduce((sum, r) => sum + r.amount, 0))
  }
  // fim de cada mês fechado (exceto o mais antigo, sem histórico anterior) e hoje
  const snapshotDates = [...months.slice(1, -1).map(monthEnd), now]

  // categorias (mesmo conjunto inicial do app) e mapeamento da Pluggy
  const catId = new Map<string, number>()
  const parentId = new Map<string, number>()
  for (const c of SEED_CATEGORIES) {
    const [p] = await db.insert(s.categories).values({ name: c.name, kind: c.kind, color: c.color, icon: c.icon }).returning({ id: s.categories.id })
    parentId.set(c.name, p.id)
    const subs = await db
      .insert(s.categories)
      .values(c.subs.map((name) => ({ name, kind: c.kind, color: c.color, parentId: p.id })))
      .returning({ id: s.categories.id, name: s.categories.name })
    for (const x of subs) catId.set(`${c.name}/${x.name}`, x.id)
  }
  await db.insert(s.pluggyCategoryMap).values(Object.entries(SEED_PLUGGY_MAP).map(([pluggyCategory, path]) => ({ pluggyCategory, subcategoryId: catId.get(path)! })))

  const inst = await db
    .insert(s.institutions)
    .values([
      { pluggyItemId: "00000000-0000-4000-8000-000000000001", name: "Itaú", status: "UPDATED", lastSyncedAt: new Date() },
      { pluggyItemId: "00000000-0000-4000-8000-000000000002", name: "Nubank", status: "UPDATED", lastSyncedAt: new Date() },
    ])
    .returning({ id: s.institutions.id, name: s.institutions.name })
  const instId = (name: string) => inst.find((i) => i.name === name)!.id

  const ACCOUNTS: Record<Acc, typeof s.accounts.$inferInsert> = {
    checking: { name: "Conta Corrente (1234)", type: "CHECKING", source: "PLUGGY", institutionId: instId("Itaú"), pluggyId: "demo-checking" },
    card: { name: "Nubank Mastercard (5678)", type: "CREDIT_CARD", source: "PLUGGY", institutionId: instId("Nubank"), pluggyId: "demo-card" },
    caixinha: { name: "Caixinha Reserva", type: "SAVINGS_INVESTMENT", source: "PLUGGY", institutionId: instId("Nubank"), pluggyId: "demo-caixinha", isEmergencyReserve: true },
    cdb: { name: "CDB 110% CDI", type: "SAVINGS_INVESTMENT", source: "PLUGGY", institutionId: instId("Itaú"), pluggyId: "inv:demo-cdb" },
    cash: { name: "Carteira", type: "CASH", source: "MANUAL", openingBalance: OPENING.cash },
  }
  const accId = {} as Record<Acc, number>
  for (const key of Object.keys(ACCOUNTS) as Acc[]) {
    const [a] = await db
      .insert(s.accounts)
      .values({ ...ACCOUNTS[key], balance: balanceAt(key, now), transactionsSyncedAt: new Date() })
      .returning({ id: s.accounts.id })
    accId[key] = a.id
  }

  const toValues = (r: Row, extra: Partial<typeof s.transactions.$inferInsert> = {}) => ({
    accountId: accId[r.acc],
    date: r.date,
    amount: r.amount,
    description: r.description,
    kind: (r.transfer ? "TRANSFER" : r.amount < 0 ? "EXPENSE" : "INCOME") as "INCOME" | "EXPENSE" | "TRANSFER",
    subcategoryId: r.sub ? catId.get(r.sub)! : null,
    categorySource: r.source,
    suggestedSubcategoryId: r.suggested ? catId.get(r.suggested)! : null,
    suggestionConfidence: r.confidence ?? null,
    ...extra,
  })

  const plain = rows.filter((r) => r.transfer !== "pair")
  for (let i = 0; i < plain.length; i += 200) await db.insert(s.transactions).values(plain.slice(i, i + 200).map((r) => toValues(r)))
  for (const r of rows.filter((r) => r.transfer === "pair")) {
    const [out] = await db.insert(s.transactions).values(toValues(r)).returning({ id: s.transactions.id })
    const [inn] = await db
      .insert(s.transactions)
      .values(toValues({ ...r, acc: "caixinha", amount: -r.amount, description: "TED RECEBIDO RESERVA" }, { transferPairId: out.id }))
      .returning({ id: s.transactions.id })
    await db.update(s.transactions).set({ transferPairId: inn.id }).where(sql`${s.transactions.id} = ${out.id}`)
  }

  // histórico do patrimônio
  await db.insert(s.balanceSnapshots).values(
    (Object.keys(ACCOUNTS) as Acc[]).flatMap((acc) => snapshotDates.map((date) => ({ accountId: accId[acc], date, balance: balanceAt(acc, date) }))),
  )

  // limites, regras, metas, reserva e última sincronização
  await db.insert(s.spendingLimits).values([
    { categoryId: parentId.get("Alimentação")!, monthlyAmount: 1500 },
    { categoryId: parentId.get("Transporte")!, monthlyAmount: 600 },
    { categoryId: parentId.get("Lazer")!, monthlyAmount: 500 },
    { categoryId: parentId.get("Compras")!, monthlyAmount: 700 },
  ])
  await db.insert(s.categoryRules).values([
    { priority: 10, pattern: "UBER", subcategoryId: catId.get("Transporte/App e táxi")! },
    { priority: 10, pattern: "IFOOD", subcategoryId: catId.get("Alimentação/Delivery")! },
    { priority: 10, pattern: "NETFLIX", subcategoryId: catId.get("Assinaturas/Streaming")! },
    { priority: 20, matchType: "STARTS_WITH", pattern: "POSTO", subcategoryId: catId.get("Transporte/Combustível")! },
  ])
  const [trip, flat] = await db
    .insert(s.goals)
    .values([
      { name: "Viagem para a Europa", targetAmount: 18000, deadline: `${addMonths(thisMonth, 10)}-15`, initialAmount: 2000, tracking: "CONTRIBUTIONS" },
      { name: "Entrada do apartamento", targetAmount: 60000, deadline: `${addMonths(thisMonth, 30)}-10`, tracking: "ACCOUNT" },
    ])
    .returning({ id: s.goals.id })
  await db.insert(s.goalAccounts).values({ goalId: flat.id, accountId: accId.cdb })
  await db.insert(s.goalContributions).values(
    Array.from({ length: 6 }, (_, i) => ({ goalId: trip.id, date: `${addMonths(thisMonth, i - 6)}-20`, amount: 800, note: "Aporte mensal" })),
  )
  await db.insert(s.reserveSettings).values({ id: 1, targetMode: "MONTHS", targetMonths: 6 })
  const synced = new Date(Date.now() - 2 * 3600_000)
  await db.insert(s.syncRuns).values({ trigger: "CRON", startedAt: synced, finishedAt: new Date(synced.getTime() + 40_000), status: "OK" })
}
