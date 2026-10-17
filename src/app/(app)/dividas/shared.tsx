import { cn } from "@/lib/utils"
import type { Status } from "@/lib/domain/debts"

const COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#f43f5e", "#12a06a", "#2563eb", "#ea580c", "#9333ea"]

export function debtColor(creditor: string) {
  let h = 0
  for (const c of creditor) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

const initials = (name: string) => {
  const parts = name.replace(/^(dr|dra)\.?\s+/i, "").split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase()
}

export function DebtAvatar({ creditor, size = 40, className }: { creditor: string; size?: number; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-[11px] font-extrabold text-white", className)} style={{ width: size, height: size, background: debtColor(creditor), fontSize: size * 0.35 }} aria-hidden>
      {initials(creditor)}
    </span>
  )
}

export const STATUS: Record<Status, { label: string; cls: string }> = {
  paid: { label: "Quitada", cls: "bg-muted text-muted-foreground" },
  overdue: { label: "Em atraso", cls: "bg-expense/10 text-expense" },
  soon: { label: "Vence em breve", cls: "bg-amber-500/10 text-warning" },
  open: { label: "Em dia", cls: "bg-income/10 text-income" },
  undated: { label: "Sem data", cls: "bg-muted text-muted-foreground" },
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const s = STATUS[status]
  return <span className={cn("inline-flex h-5 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap", s.cls, className)}>{s.label}</span>
}

export const RELATIONS = ["Amigo", "Família", "Profissional", "Empresa", "Outro"]
