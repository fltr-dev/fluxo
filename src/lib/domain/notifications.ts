import { brl, dateBR } from "../format"
import { daysBetween, monthOf } from "./dates"
import type { DueRow } from "./debts"

// Quais avisos existem hoje. Função pura: o banco só guarda o resultado (e `dedupeKey` impede repetir o mesmo aviso).

export type NotificationKind = "DEBT_DUE" | "DEBT_OVERDUE" | "SALARY" | "LIMIT" | "SYSTEM"
export type Draft = { kind: NotificationKind; title: string; body: string; href: string | null; dedupeKey: string }
export type NotifySettings = { pushHour: number; notifyDue: boolean; notifyOverdue: boolean; notifySalary: boolean; notifyLimit: boolean }

export const DEFAULT_NOTIFY: NotifySettings = { pushHour: 9, notifyDue: true, notifyOverdue: true, notifySalary: true, notifyLimit: true }

export type NotifyInput = {
  today: string
  debts: { id: number; creditor: string; description: string | null; remindDaysBefore: number | null; afterSalary: boolean; totalRows: number; rows: DueRow[] }[]
  /** Última entrada de salário (categoria "Salário"); só avisa se for de hoje ou dos últimos 2 dias. */
  salary: { date: string; amount: number } | null
  limits: { categoryId: number; label: string; limit: number; spent: number }[]
  settings: NotifySettings
}

const when = (days: number) => (days <= 0 ? "Hoje" : days === 1 ? "Amanhã" : `Em ${days} dias`)

export function buildNotifications({ today, debts, salary, limits, settings }: NotifyInput): Draft[] {
  const out: Draft[] = []
  for (const d of debts) {
    const href = `/dividas?ver=${d.id}`
    for (const r of d.rows) {
      if (r.paidOn || !r.due) continue
      if (r.status === "overdue") {
        if (settings.notifyOverdue)
          out.push({ kind: "DEBT_OVERDUE", title: `Dívida atrasada: ${d.creditor} · ${brl(r.amount)}`, body: `Venceu em ${dateBR(r.due)}. Registre o pagamento ou escolha uma nova data.`, href, dedupeKey: `debt-overdue:${r.id}` })
        continue
      }
      const days = daysBetween(today, r.due)
      if (settings.notifyDue && d.remindDaysBefore != null && days >= 0 && days <= d.remindDaysBefore)
        out.push({
          kind: "DEBT_DUE",
          title: `${when(days)}: parcela de ${d.creditor}`,
          body: `${r.number} de ${d.totalRows} · ${brl(r.amount)}${d.description ? ` · ${d.description}` : ""}`,
          href,
          dedupeKey: `debt-due:${r.id}:${r.due}`,
        })
    }
  }
  if (settings.notifySalary && salary && daysBetween(salary.date, today) >= 0 && daysBetween(salary.date, today) <= 2) {
    const soon = debts.flatMap((d) => (d.afterSalary ? d.rows.filter((r) => !r.paidOn && r.due && r.due >= today && daysBetween(today, r.due) <= 7).map((r) => ({ d, r })) : []))
    out.push({
      kind: "SALARY",
      title: `Salário caiu! ${brl(salary.amount)}`,
      body: soon.length ? `Parcelas para pagar nesta semana: ${soon.map(({ d, r }) => `${d.creditor} ${brl(r.amount)}`).join(", ")}.` : `Recebido em ${dateBR(salary.date)}.`,
      href: soon.length ? "/dividas" : "/transacoes",
      dedupeKey: `salary:${salary.date}`,
    })
  }
  if (settings.notifyLimit)
    for (const l of limits)
      if (l.limit > 0 && l.spent >= l.limit)
        out.push({ kind: "LIMIT", title: `Limite estourado: ${l.label}`, body: `Você gastou ${brl(l.spent)} de ${brl(l.limit)} neste mês.`, href: "/limites", dedupeKey: `limit:${l.categoryId}:${monthOf(today)}` })
  return out
}
