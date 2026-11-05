// Tipos compartilhados entre o servidor (ferramentas, conversa) e a interface do Cofy.

/** Cofy desligado por enquanto: /cofy dá 404 e /api/cofy recusa. Para religar: `true` aqui e reverter o PR "Esconde o Cofy". */
export const COFY_ENABLED = false

/** Peças de um cartão: o jeito de mostrar o resultado de uma ferramenta com o visual do fluxo. */
export type CardBlock =
  | { type: "kpis"; items: { label: string; value: string; tone?: "good" | "bad" | "warn" }[] }
  | { type: "bars"; legend?: string; rows: { label: string; value: number; max: number; text: string; delta?: string; tone?: "good" | "bad"; color?: string; marker?: number }[] }
  | { type: "table"; columns: string[]; align?: ("l" | "r")[]; rows: string[][]; csvName?: string }
  | { type: "note"; text: string }

export type CardIcon = "chart" | "wallet" | "list" | "debt" | "target" | "trend" | "report"

export type Card = { title: string; icon: CardIcon; href?: string; hrefLabel?: string; blocks: CardBlock[] }

/** Ação proposta pela IA que espera a confirmação do usuário (nada é gravado antes disso). */
export type ActionView = {
  id: number
  kind: string
  status: "PENDING" | "DONE" | "CANCELLED"
  result: string | null
  title: string
  subtitle?: string
  amount?: string
  rows: { label: string; value: string }[]
  tags?: string[]
  href?: string
  hrefLabel?: string
}

export type UiPart = { type: "text"; text: string } | { type: "card"; card: Card } | { type: "action"; action: ActionView } | { type: "tool"; id: string; label: string }
export type UiAttachment = { id: number; name: string; size: number; mediaType: string }
export type UiMessage = { id: number | string; role: "user" | "assistant"; parts: UiPart[]; attachments?: UiAttachment[]; createdAt?: string }

/** Linhas do stream NDJSON de /api/cofy. */
export type StreamEvent =
  | { t: "conv"; id: number; title: string }
  | { t: "text"; d: string }
  | { t: "tool"; id: string; name: string; label: string }
  | { t: "card"; id: string; card: Card }
  | { t: "action"; id: string; action: ActionView }
  | { t: "title"; title: string }
  | { t: "done" }
  | { t: "error"; message: string }

export type ConversationRow = { id: number; title: string; archived: boolean; updatedAt: string }

export const MAX_FILES = 5
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.txt,.ofx,.xlsx"
