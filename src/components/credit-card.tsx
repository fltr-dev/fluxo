import Link from "next/link"
import { AccountAvatar } from "@/components/account-avatar"
import { Money } from "@/components/bits"
import { cardUsage } from "@/lib/account-types"
import type { AccountLook } from "@/lib/banks"
import { today } from "@/lib/domain/dates"
import { dateBR } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = {
  look: AccountLook
  /** Apelido; aceita nó (ex.: InlineName para renomear no próprio cartão) */
  name: React.ReactNode
  /** Para o link "esticado" (aria-label "Abrir …") */
  label: string
  /** Saldo da conta: a fatura aberta, negativa */
  balance: number
  creditLimit: number | null
  /** Da Pluggy; null (cartão manual) = limite − fatura */
  availableCreditLimit: number | null
  billDueDate: string | null
  href?: string
  /** Ações por cima do link (ex.: lápis de editar) */
  children?: React.ReactNode
  className?: string
}

/** Cartão de crédito com a cor do banco: fatura atual, uso do limite e vencimento. Valores passam por Money (modo privado). */
export function CreditCard({ look, name, label, balance, creditLimit, availableCreditLimit, billDueDate, href, children, className }: Props) {
  const bill = Math.abs(balance)
  const usage = cardUsage(balance, creditLimit, availableCreditLimit)

  return (
    <div
      className={cn("relative flex min-h-40 min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-2xl p-4 shadow-sm dark:ring-1 dark:ring-white/10", className)}
      style={{ background: look.color, color: look.fg }}
    >
      {href && <Link href={href} aria-label={`Abrir ${label}`} className="absolute inset-0 rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none" />}
      <div className="flex min-w-0 items-center gap-3">
        <AccountAvatar look={look} size={32} className="outline-0" />
        <div className="grid min-w-0 flex-1 text-sm font-semibold">{name}</div>
        {children}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="grid">
          <span className="text-xs font-medium opacity-80">Fatura atual</span>
          <Money value={bill} className="text-2xl font-semibold tracking-tight" />
        </div>
        {billDueDate && (
          <span className="text-xs font-medium opacity-90">
            {billDueDate >= today() ? "Vence" : "Venceu"} {dateBR(billDueDate).slice(0, 5)}
          </span>
        )}
      </div>

      {usage && (
        <div className="grid gap-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-current/25" aria-hidden>
            <div className="h-full rounded-full bg-current" style={{ width: `${usage.pct}%` }} />
          </div>
          <p className="flex flex-wrap gap-x-1 text-xs opacity-90">
            {usage.available < 0 ? (
              <span>
                <Money value={-usage.available} /> acima do limite
              </span>
            ) : (
              <>
                <span>
                  <Money value={usage.used} /> usado
                </span>
                <span aria-hidden>·</span>
                <span>
                  <Money value={usage.available} /> disponível
                </span>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
