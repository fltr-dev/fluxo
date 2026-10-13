export type Kind = "INCOME" | "EXPENSE"
export type CategorySource = "USER" | "RULE" | "JEV" | "PLUGGY_MAP" | "NONE"

export type Rule = {
  id: number
  priority: number
  matchType: "CONTAINS" | "STARTS_WITH" | "REGEX"
  pattern: string
  accountId: number | null
  kind: Kind | null
  minAmount: number | null
  maxAmount: number | null
  subcategoryId: number
  active: boolean
}

export type CategorizableTx = {
  description: string
  amount: number
  accountId: number
  pluggyCategory: string | null
  pluggyCategoryId: string | null
}

// Categorias de nível 1 da Pluggy pelo prefixo do categoryId (fallback do mapeamento)
export const PLUGGY_LEVEL1: Record<string, string> = {
  "01": "Income",
  "02": "Loans and Financing",
  "03": "Investments",
  "04": "Same person transfer",
  "05": "Transfers",
  "06": "Third-party transfers",
  "07": "Services",
  "08": "Shopping",
  "09": "Digital services",
  "10": "Groceries",
  "11": "Food and drinks",
  "12": "Travel",
  "13": "Donations",
  "14": "Gambling",
  "15": "Taxes",
  "16": "Bank fees",
  "17": "Housing",
  "18": "Utilities",
  "19": "Healthcare",
  "20": "Transportation",
  "21": "Automotive",
  "22": "Insurance",
  "23": "Leisure",
}

export const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()

export function ruleMatches(rule: Rule, tx: CategorizableTx) {
  if (!rule.active) return false
  if (rule.accountId != null && rule.accountId !== tx.accountId) return false
  if (rule.kind === "INCOME" && tx.amount <= 0) return false
  if (rule.kind === "EXPENSE" && tx.amount >= 0) return false
  const abs = Math.abs(tx.amount)
  if (rule.minAmount != null && abs < rule.minAmount) return false
  if (rule.maxAmount != null && abs > rule.maxAmount) return false
  if (rule.matchType === "REGEX") {
    try {
      return new RegExp(rule.pattern, "i").test(tx.description)
    } catch {
      return false
    }
  }
  const desc = normalize(tx.description)
  const pattern = normalize(rule.pattern)
  return rule.matchType === "STARTS_WITH" ? desc.startsWith(pattern) : desc.includes(pattern)
}

export const matchRule = (rules: Rule[], tx: CategorizableTx) =>
  [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id).find((r) => ruleMatches(r, tx))

export function mapPluggyCategory(map: Map<string, number>, tx: CategorizableTx) {
  if (tx.pluggyCategory && map.has(tx.pluggyCategory)) return map.get(tx.pluggyCategory)
  const parent = tx.pluggyCategoryId ? PLUGGY_LEVEL1[tx.pluggyCategoryId.slice(0, 2)] : undefined
  return parent ? map.get(parent) : undefined
}

export type JevResult = { subcategoryId: number; confidence: number } | null

export type Resolution = {
  subcategoryId: number | null
  categorySource: CategorySource
  suggestedSubcategoryId: number | null
  suggestionConfidence: number | null
}

/** Ordem: regra do usuário → Jev (confiança ≥ accept) → mapeamento Pluggy → "A categorizar". */
export function resolveCategory(input: {
  ruleSubcategoryId?: number
  jev: JevResult
  mappedSubcategoryId?: number
  accept: number
  suggest: number
}): Resolution {
  const { ruleSubcategoryId, jev, mappedSubcategoryId, accept, suggest } = input
  const none = { suggestedSubcategoryId: null, suggestionConfidence: null }
  if (ruleSubcategoryId != null) return { subcategoryId: ruleSubcategoryId, categorySource: "RULE", ...none }
  if (jev && jev.confidence >= accept) return { subcategoryId: jev.subcategoryId, categorySource: "JEV", ...none }
  const suggestion =
    jev && jev.confidence >= suggest
      ? { suggestedSubcategoryId: jev.subcategoryId, suggestionConfidence: jev.confidence }
      : none
  if (mappedSubcategoryId != null) return { subcategoryId: mappedSubcategoryId, categorySource: "PLUGGY_MAP", ...suggestion }
  return { subcategoryId: null, categorySource: "NONE", ...suggestion }
}

/** Tipo da transação: segue o tipo da categoria (estorno numa categoria de despesa reduz a despesa); sem categoria, segue o sinal. */
export const deriveKind = (amount: number, categoryKind: Kind | null | undefined): Kind =>
  categoryKind ?? (amount < 0 ? "EXPENSE" : "INCOME")
