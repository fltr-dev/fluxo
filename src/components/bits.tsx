import type { LucideIcon } from "lucide-react"
import { brl } from "@/lib/format"
import { cn } from "@/lib/utils"

// Peças pequenas reaproveitadas pelas telas (server components, sem JS no cliente)

export const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"

const BAR = { ok: "bg-primary", warn: "bg-amber-500", over: "bg-red-500" }

export function Bar({ value, state, color, className }: { value: number; state?: "ok" | "warn" | "over"; color?: string; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", !color && BAR[state ?? "ok"])} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
    </div>
  )
}

export function PageTitle({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/** Estado vazio: ícone, título, texto e (opcional) uma ação. */
export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center">
      {Icon && (
        <span className="mb-1 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      )}
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export const Money = ({ value, className, signed }: { value: number; className?: string; signed?: boolean }) => (
  <span className={cn("tabular-nums", value < 0 && "text-expense", signed && value > 0 && "text-income", className)}>
    {signed && value > 0 && "+"}
    {brl(value)}
  </span>
)

export const Field = ({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) => (
  <label className={cn("grid content-start gap-1.5 text-sm font-medium", className)}>
    {label}
    {children}
    {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
  </label>
)

/** Valor com seta e cor: verde quando a variação é boa. */
export function Delta({ value, upIsGood = true, className }: { value: number | null; upIsGood?: boolean; className?: string }) {
  if (value == null) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>
  if (Math.abs(value) < 0.0005) return <span className={cn("text-xs font-medium text-muted-foreground", className)}>= 0%</span>
  const good = value === 0 || value > 0 === upIsGood
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", good ? "text-income" : "text-expense", className)}>
      {value > 0 ? "↑" : value < 0 ? "↓" : ""} {`${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
    </span>
  )
}

/** Ícone em círculo colorido (KPIs, listas). */
export const IconCircle = ({ icon: Icon, color, soft, className }: { icon: LucideIcon; color: string; soft?: boolean; className?: string }) => (
  <span
    className={cn("grid size-10 shrink-0 place-items-center rounded-full", !soft && "text-white", className)}
    style={soft ? { background: `${color}1f`, color } : { background: color }}
  >
    <Icon className="size-[18px]" />
  </span>
)

/**
 * Rodapé padrão de modais e painéis: ações no canto inferior direito, com o botão principal por último;
 * `start` (ex.: "Excluir") fica isolado à esquerda. Fica colado ao fim da área rolável.
 */
export function FormActions({ children, start, className }: { children: React.ReactNode; start?: React.ReactNode; className?: string }) {
  return (
    <div data-slot="form-actions" className={cn("sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-2 border-t bg-popover px-6 py-3.5 max-md:pb-[max(0.875rem,env(safe-area-inset-bottom))]", className)}>
      {start && <div className="mr-auto flex items-center gap-2">{start}</div>}
      {children}
    </div>
  )
}
