export const ACCOUNT_TYPES = { CHECKING: "Conta corrente", CREDIT_CARD: "Cartão de crédito", SAVINGS_INVESTMENT: "Poupança/investimento", CASH: "Dinheiro" } as const
export type AccountType = keyof typeof ACCOUNT_TYPES
