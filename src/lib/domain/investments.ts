// Regras de investimentos sem acesso a banco ou rede: categorias, posição a partir das operações,
// rentabilidade mês a mês (Dietz modificado), índices de comparação e rebalanceamento.

export const ASSET_CLASSES = ["POS_FIXADO", "PRE_FIXADO", "INFLACAO", "ACOES", "FII", "BDR", "ETF", "CRIPTO", "FUNDOS", "OUTROS"] as const
export type AssetClass = (typeof ASSET_CLASSES)[number]

/**
 * Ordem fixa das categorias nos gráficos (a cor segue a categoria, nunca a posição no ranking). As cores
 * (`--inv-*` no globals.css) foram validadas para daltonismo nessa ordem de vizinhança.
 */
export const CLASS_INFO: Record<AssetClass, { label: string; color: string; fixed: boolean; order: number }> = {
  POS_FIXADO: { label: "Pós-fixado", color: "var(--inv-pos)", fixed: true, order: 0 },
  ACOES: { label: "Ações", color: "var(--inv-acoes)", fixed: false, order: 1 },
  FII: { label: "FII", color: "var(--inv-fii)", fixed: false, order: 2 },
  PRE_FIXADO: { label: "Pré-fixado", color: "var(--inv-pre)", fixed: true, order: 3 },
  CRIPTO: { label: "Cripto", color: "var(--inv-cripto)", fixed: false, order: 4 },
  INFLACAO: { label: "Inflação", color: "var(--inv-inflacao)", fixed: true, order: 5 },
  BDR: { label: "BDR", color: "var(--inv-bdr)", fixed: false, order: 6 },
  FUNDOS: { label: "Fundos", color: "var(--inv-fundos)", fixed: false, order: 7 },
  ETF: { label: "ETF", color: "var(--inv-etf)", fixed: false, order: 8 },
  OUTROS: { label: "Outros", color: "var(--inv-outros)", fixed: false, order: 9 },
}
export const CLASS_ORDER = [...ASSET_CLASSES].sort((a, b) => CLASS_INFO[a].order - CLASS_INFO[b].order)

/** Renda variável: tem quantidade e cotação; o resto é renda fixa/fundos (só saldo). */
export const isVariable = (c: AssetClass) => c === "ACOES" || c === "FII" || c === "BDR" || c === "ETF" || c === "CRIPTO"

export const INCOME_TYPES = ["DIVIDEND", "JCP", "YIELD", "INTEREST"] as const
export type IncomeType = (typeof INCOME_TYPES)[number]
export type TradeType = "BUY" | "SELL" | "BONUS" | IncomeType
export const TRADE_LABEL: Record<TradeType, string> = {
  BUY: "Compra",
  SELL: "Venda",
  BONUS: "Bonificação",
  DIVIDEND: "Dividendo",
  JCP: "JCP",
  YIELD: "Rendimento",
  INTEREST: "Juros",
}
export const isIncome = (t: TradeType): t is IncomeType => (INCOME_TYPES as readonly string[]).includes(t)

// ---------- Categoria a partir do código e dos dados da Pluggy ----------

/** Pelo ticker da B3: final 11 = FII (ETFs também terminam em 11, mas são raros sem a Pluggy dizer), 32–35 = BDR, 3–8 = ação. */
export function classFromCode(code: string | null | undefined): AssetClass | null {
  const c = (code ?? "").trim().toUpperCase()
  if (/^[A-Z]{4}11$/.test(c)) return "FII"
  if (/^[A-Z]{4}3[2-5]$/.test(c)) return "BDR"
  if (/^[A-Z]{4}([3-8])F?$/.test(c)) return "ACOES"
  return null
}

/** Investimento da Pluggy (GET /investments), só os campos usados. */
export type PluggyInvestmentInfo = {
  name: string
  code?: string | null
  type?: string | null
  subtype?: string | null
  rateType?: string | null
  rate?: number | null
  fixedAnnualRate?: number | null
}

const has = (s: string | null | undefined, re: RegExp) => !!s && re.test(s)

/** Categoria do fluxo: tipo/subtipo da Pluggy primeiro, depois o indexador e, por último, o nome. */
export function classifyPluggy(inv: PluggyInvestmentInfo): AssetClass {
  const type = (inv.type ?? "").toUpperCase()
  const sub = (inv.subtype ?? "").toUpperCase()
  if (type === "EQUITY" || type === "ETF") {
    if (sub === "REAL_ESTATE_FUND") return "FII"
    if (sub === "BDR") return "BDR"
    if (sub === "ETF" || type === "ETF") return "ETF"
    return classFromCode(inv.code) ?? "ACOES"
  }
  if (type === "MUTUAL_FUND") return sub === "REAL_ESTATE_FUND" ? "FII" : "FUNDOS"
  if (type === "SECURITY" || type === "COE") return "OUTROS"
  if (type === "FIXED_INCOME" || !type) {
    const idx = `${inv.rateType ?? ""} ${inv.name}`.toUpperCase()
    if (has(idx, /IPCA|IGP|INPC|INFLA/)) return "INFLACAO"
    if (has(idx, /CDI|SELIC|\bDI\b|P[ÓO]S/)) return "POS_FIXADO"
    if (has(idx, /PR[ÉE]|PREFIX/) || (inv.fixedAnnualRate && !inv.rateType)) return "PRE_FIXADO"
    if (!type) return classFromCode(inv.code) ?? "OUTROS"
    return "POS_FIXADO"
  }
  return "OUTROS"
}

const n2 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })

/** "110% CDI", "IPCA + 6,5%", "13,2% a.a." ou null quando a Pluggy não informa a taxa. */
export function rateLabelOf(inv: PluggyInvestmentInfo): string | null {
  const idx = (inv.rateType ?? "").toUpperCase()
  if (!idx && inv.fixedAnnualRate) return `${n2(inv.fixedAnnualRate)}% a.a.`
  if (!idx) return null
  if (idx.includes("PRE")) return inv.fixedAnnualRate || inv.rate ? `${n2((inv.fixedAnnualRate || inv.rate)!)}% a.a.` : "Prefixado"
  const name = idx.includes("CDI") || idx === "DI" ? "CDI" : idx.includes("SELIC") ? "Selic" : idx.includes("IPCA") ? "IPCA" : idx
  if (name === "CDI" && inv.rate) return `${n2(inv.rate)}% CDI`
  if (inv.fixedAnnualRate) return `${name} + ${n2(inv.fixedAnnualRate)}%`
  return name
}

// ---------- Operações ----------

/** Movimentação de investimento da Pluggy (GET /investments/:id/transactions), só os campos usados. */
export type PluggyInvestmentTxInfo = {
  id: string
  type?: string | null
  movementType?: "CREDIT" | "DEBIT" | null
  description?: string | null
  quantity?: number | null
  value?: number | null
  amount: number
  date: string
}

/** Operação da Pluggy → operação do fluxo. Impostos e transferências internas não entram (null). */
export function tradeFromPluggy(t: PluggyInvestmentTxInfo): { type: TradeType; quantity: number | null; price: number | null; amount: number } | null {
  const type = (t.type ?? "").toUpperCase()
  const desc = (t.description ?? "").toUpperCase()
  if (type === "TAX" || type === "TRANSFER") return null
  const income = incomeTypeOf(desc)
  let kind: TradeType
  if (type === "BUY") kind = "BUY"
  else if (type === "SELL") kind = "SELL"
  else if (income && t.movementType !== "DEBIT") kind = income
  else kind = t.movementType === "DEBIT" ? "SELL" : "BUY"
  return { type: kind, quantity: t.quantity ?? null, price: t.value ?? null, amount: Math.abs(t.amount) }
}

/** Tipo de provento pela descrição ("DIVIDENDOS ITSA4", "JUROS S/CAPITAL BBAS3", "RENDIMENTO MXRF11"). */
export function incomeTypeOf(description: string): IncomeType | null {
  const d = description.toUpperCase()
  if (/\bJCP\b|JUROS S\/? ?CAP|JUROS SOBRE CAPITAL/.test(d)) return "JCP"
  if (/DIVIDEND/.test(d)) return "DIVIDEND"
  if (/RENDIMENTO/.test(d)) return "YIELD"
  return null
}

/**
 * Proventos que caíram na conta da corretora: transação de entrada cuja descrição diz o tipo e cita o ticker
 * de um ativo da carteira. A Pluggy não manda proventos junto com o investimento; eles chegam como crédito em conta.
 */
export function detectIncomeFromTransactions(txs: { id: number; date: string; amount: number; description: string }[], codes: Map<string, number>) {
  const out: { pluggyId: string; investmentId: number; date: string; type: IncomeType; amount: number }[] = []
  for (const t of txs) {
    if (t.amount <= 0) continue
    const type = incomeTypeOf(t.description)
    if (!type) continue
    const tickers = t.description.toUpperCase().match(/\b[A-Z]{4}\d{1,2}\b/g) ?? []
    const investmentId = tickers.map((c) => codes.get(c)).find((id) => id != null)
    if (investmentId) out.push({ pluggyId: `tx:${t.id}`, investmentId, date: t.date, type, amount: t.amount })
  }
  return out
}

export type Trade = { date: string; type: TradeType; quantity: number | null; price: number | null; amount: number; fees: number }

/**
 * Posição pelas operações, em ordem de data: compra soma quantidade e custo (com taxas); venda tira a quantidade
 * pelo preço médio e o que passar disso é lucro realizado; bonificação soma quantidade com o custo informado.
 */
export function positionFromTrades(trades: Trade[]) {
  let quantity = 0
  let invested = 0
  let realized = 0
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sorted) {
    const q = t.quantity ?? 0
    if (t.type === "BUY") {
      quantity += q
      invested += t.amount + t.fees
    } else if (t.type === "BONUS") {
      quantity += q
      invested += t.amount
    } else if (t.type === "SELL") {
      const avg = quantity > 0 ? invested / quantity : 0
      // renda fixa manual: venda sem quantidade = resgate em reais, abate o custo proporcional ao saldo
      const cost = q > 0 ? Math.min(invested, avg * q) : Math.min(invested, t.amount)
      quantity = Math.max(0, quantity - q)
      invested -= cost
      realized += t.amount - t.fees - cost
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100
  return { quantity, invested: round(invested), avgPrice: quantity > 0 ? invested / quantity : null, realized: round(realized) }
}

// ---------- Rentabilidade ----------

/**
 * Rentabilidade de cada mês pelo Dietz modificado (aportes no meio do mês): (fim − início − aportes + proventos) / (início + aportes/2).
 * `values[i]` é o saldo no fim do mês i; o mês 0 só serve de ponto de partida. null onde não há base (carteira vazia).
 */
export function monthlyReturns(values: (number | null)[], flows: number[], income: number[]) {
  return values.map((v, i) => {
    if (i === 0) return null
    const start = values[i - 1]
    if (v == null || start == null) return null
    const base = start + flows[i] / 2
    if (base <= 0) return null
    return (v - start - flows[i] + income[i]) / base
  })
}

/** Acumula retornos mensais: [0, r1, (1+r1)(1+r2)−1, …]; mês sem dado repete o acumulado anterior. */
export function accumulate(returns: (number | null)[]) {
  let acc = 1
  return returns.map((r, i) => {
    if (i > 0 && r != null) acc *= 1 + r
    return acc - 1
  })
}

/** CDI do mês a partir das taxas diárias (% ao dia): produto de (1 + taxa). */
export function cdiByMonth(daily: { date: string; value: number }[]) {
  const out = new Map<string, number>()
  for (const d of daily) {
    const m = d.date.slice(0, 7)
    out.set(m, (1 + (out.get(m) ?? 0)) * (1 + d.value / 100) - 1)
  }
  return out
}

/** Variação mensal de um índice em pontos (IBOV): fechamento do mês / fechamento do mês anterior − 1. */
export function indexReturnsByMonth(closes: { date: string; value: number }[]) {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date))
  const out = new Map<string, number>()
  for (let i = 1; i < sorted.length; i++) out.set(sorted[i].date.slice(0, 7), sorted[i].value / sorted[i - 1].value - 1)
  return out
}

// ---------- Alocação ----------

/** Peso atual × alvo por categoria e quanto aportar em cada uma para chegar ao alvo sem vender. */
export function rebalance(values: Map<AssetClass, number>, targets: Map<AssetClass, number>) {
  const total = [...values.values()].reduce((a, b) => a + b, 0)
  const classes = CLASS_ORDER.filter((c) => (values.get(c) ?? 0) > 0 || (targets.get(c) ?? 0) > 0)
  return classes.map((c) => {
    const value = values.get(c) ?? 0
    const pct = total ? value / total : 0
    const target = targets.has(c) ? targets.get(c)! / 100 : null
    return { assetClass: c, value, pct, target, diff: target == null ? null : pct - target, need: target == null ? null : Math.max(0, target * total - value) }
  })
}
