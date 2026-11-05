import "server-only"
import type { PluggyInvestment, PluggyInvestmentTx, PluggyTx } from "./domain/sync-merge"

const BASE = "https://api.pluggy.ai"

export type PluggyItem = {
  id: string
  status: string
  executionStatus?: string
  error?: { message?: string } | null
  connector?: { name?: string }
}
export type PluggyAccount = {
  id: string
  type: "BANK" | "CREDIT"
  subtype: string
  name: string
  marketingName?: string | null
  number?: string
  balance: number
  // só cartões (type CREDIT); a Pluggy manda outros campos também, só estes interessam
  creditData?: { creditLimit?: number | null; availableCreditLimit?: number | null; balanceDueDate?: string | null } | null
}

async function request<T>(apiKey: string | null, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...(apiKey ? { "X-API-KEY": apiKey } : {}), ...init?.headers },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Pluggy ${init?.method ?? "GET"} ${path.split("?")[0]}: HTTP ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function pluggyClient() {
  const { PLUGGY_CLIENT_ID: clientId, PLUGGY_CLIENT_SECRET: clientSecret } = process.env
  if (!clientId || !clientSecret) throw new Error("PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET não configurados")
  // ponytail: apiKey vale 2h; um token por execução de sync basta
  const { apiKey } = await request<{ apiKey: string }>(null, "/auth", {
    method: "POST",
    body: JSON.stringify({ clientId, clientSecret }),
  })
  const get = <T>(path: string) => request<T>(apiKey, path)

  return {
    item: (id: string) => get<PluggyItem>(`/items/${id}`),
    accounts: async (itemId: string) => (await get<{ results: PluggyAccount[] }>(`/accounts?itemId=${itemId}`)).results,
    async investments(itemId: string) {
      const all: PluggyInvestment[] = []
      for (let page = 1; ; page++) {
        const r = await get<{ results: PluggyInvestment[]; totalPages?: number }>(`/investments?itemId=${itemId}&page=${page}`)
        all.push(...r.results)
        if (!r.totalPages || page >= r.totalPages) return all
      }
    },
    async investmentTransactions(investmentId: string) {
      const all: PluggyInvestmentTx[] = []
      for (let page = 1; ; page++) {
        const r = await get<{ results: PluggyInvestmentTx[]; totalPages?: number }>(`/investments/${investmentId}/transactions?page=${page}&pageSize=500`)
        all.push(...r.results)
        if (!r.totalPages || page >= r.totalPages) return all
      }
    },
    /** GET /v2/transactions com paginação por cursor (`next` é a query string pronta da próxima página). */
    async transactions(accountId: string, dateFrom?: string) {
      const all: PluggyTx[] = []
      let query: string | null = `?accountId=${accountId}${dateFrom ? `&dateFrom=${dateFrom}` : ""}`
      while (query) {
        const r: { results: PluggyTx[]; next: string | null } = await get(`/v2/transactions${query}`)
        all.push(...r.results)
        query = r.next
      }
      return all
    },
  }
}
