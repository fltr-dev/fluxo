import { accountLook } from "./banks"

export const ACCOUNT_TYPES = { CHECKING: "Conta corrente", CREDIT_CARD: "Cartão de crédito", SAVINGS_INVESTMENT: "Poupança/investimento", CASH: "Dinheiro" } as const
export type AccountType = keyof typeof ACCOUNT_TYPES

/** Grupos da listagem de /contas, nesta ordem. */
export const ACCOUNT_GROUPS: [AccountType, string][] = [
  ["CHECKING", "Contas correntes"],
  ["CREDIT_CARD", "Cartões de crédito"],
  ["SAVINGS_INVESTMENT", "Poupança e investimentos"],
  ["CASH", "Dinheiro"],
]

export const ACCOUNT_ORDERS = { saldo: "Saldo", nome: "Nome", banco: "Banco" } as const
export type AccountOrder = keyof typeof ACCOUNT_ORDERS
export const accountOrder = (v: unknown): AccountOrder => (v === "nome" || v === "banco" ? v : "saldo")

type Groupable = { name: string; type: AccountType; balance: number; archived: boolean; investmentId: number | null; bank?: string | null; color?: string | null; institution?: string | null }
/** Linha sintética: as contas dos ativos de Investimentos, somadas numa só (o detalhe fica em /investimentos). */
export type PortfolioRow = { portfolio: true; name: string; count: number; balance: number }

/** Linha de baixo da conta na listagem (e critério da ordem "banco"): banco detectado > instituição > "Manual". */
export const accountSubline = (a: Pick<Groupable, "name" | "bank" | "color" | "institution">) => accountLook(a).bankName ?? a.institution ?? "Manual"

const sum = (list: { balance: number }[]) => list.reduce((t, a) => t + a.balance, 0)

/**
 * Agrupa as contas por tipo para a listagem: arquivadas à parte (sem os ativos de investimento), grupos vazios
 * somem, subtotal por grupo (cartão negativo, como nos KPIs) e ordenação por saldo (|saldo| desc), nome ou banco.
 */
export function groupAccounts<A extends Groupable>(accs: A[], order: AccountOrder = "saldo") {
  const bankOf = (r: A | PortfolioRow) => ("portfolio" in r ? r.name : accountSubline(r))
  const byName = (a: A | PortfolioRow, b: A | PortfolioRow) => a.name.localeCompare(b.name, "pt-BR")
  const by = {
    saldo: (a: A | PortfolioRow, b: A | PortfolioRow) => Math.abs(b.balance) - Math.abs(a.balance) || byName(a, b),
    nome: byName,
    banco: (a: A | PortfolioRow, b: A | PortfolioRow) => bankOf(a).localeCompare(bankOf(b), "pt-BR") || byName(a, b),
  }[order]

  const active = accs.filter((a) => !a.archived)
  const groups = ACCOUNT_GROUPS.map(([type, label]) => {
    const of = active.filter((a) => a.type === type)
    const assets = of.filter((a) => a.investmentId != null)
    const rows: (A | PortfolioRow)[] = of.filter((a) => a.investmentId == null)
    if (assets.length) rows.push({ portfolio: true, name: "Carteira de investimentos", count: assets.length, balance: sum(assets) })
    return { type, label, total: sum(of), rows: rows.sort(by) }
  }).filter((g) => g.rows.length > 0)

  return { groups, archived: accs.filter((a) => a.archived && a.investmentId == null).sort(by) }
}

/**
 * Uso do limite do cartão: `available` vem da Pluggy (já desconta parcelas futuras); sem ele (cartão manual),
 * é limite − fatura. Limite flexível: o disponível pode ficar negativo e o uso passar de 100%; `pct` fica em 0–100.
 */
export function cardUsage(balance: number, creditLimit: number | null, availableCreditLimit: number | null) {
  if (!creditLimit || creditLimit <= 0) return null
  const available = availableCreditLimit ?? creditLimit - Math.abs(balance)
  const used = creditLimit - available
  return { limit: creditLimit, available, used, pct: Math.min(100, Math.max(0, (used / creditLimit) * 100)) }
}
