"use client"

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { createContext, use, type ReactNode } from "react"
import { acceptSuggestion, deleteManual, markTransfer, rejectSuggestion, setCategory, toggleIgnored, unmarkTransfer } from "@/app/(app)/transacoes/actions"
import { Money } from "@/components/bits"
import { SubcategorySelect } from "@/components/form-select"
import { ContextRow, SwipeRow, type RowAction } from "@/components/swipe-row"
import type { transactions } from "@/db"
import { brl, dateBR } from "@/lib/format"
import { cn } from "@/lib/utils"

// Linha de transação com gestos (lista do celular, detalhe da conta, dashboard) e o mesmo painel no desktop.

type Tx = typeof transactions.$inferSelect
export type TxItem = { tx: Tx; accountName: string; color: string | null; subName: string | null; parentName: string | null }
type Option = Parameters<typeof SubcategorySelect>[0]["options"][number]

// As subcategorias vão uma vez por lista, não uma vez por linha
const Options = createContext<Option[]>([])
export const TxOptions = ({ options, children }: { options: Option[]; children: ReactNode }) => <Options value={options}>{children}</Options>

function txActions({ tx }: TxItem, detailsHref: string) {
  const id = tx.id
  const transfer = tx.kind === "TRANSFER"
  const manual = !tx.pluggyId
  const ignore: RowAction = tx.ignored ? { label: "Considerar", icon: "eye", run: toggleIgnored, id } : { label: "Ignorar", icon: "eyeOff", run: toggleIgnored, id }
  const accept: RowAction = { label: "Aceitar", icon: "check", tone: "primary", run: acceptSuggestion, id }
  const left: RowAction[] = transfer
    ? []
    : tx.suggestedSubcategoryId
      ? [accept, { label: "Categoria", icon: "tag", sheet: true }]
      : [{ label: "Categorizar", icon: "tag", tone: "primary", sheet: true }]
  const right: RowAction[] = [ignore, ...(manual ? [{ label: "Excluir", icon: "trash", tone: "danger", run: deleteManual, id, confirm: "Confirmar" } as const] : [])]
  const menu: RowAction[] = [
    ...(tx.suggestedSubcategoryId ? [{ ...accept, label: "Aceitar sugestão da IA" }, { label: "Rejeitar sugestão", icon: "x", run: rejectSuggestion, id } as const] : []),
    { ...ignore, label: tx.ignored ? "Voltar a considerar nos relatórios" : "Ignorar nos relatórios" },
    transfer ? { label: "Não é transferência", icon: "transfer", run: unmarkTransfer, id } : { label: "Marcar como transferência", icon: "transfer", run: markTransfer, id },
    ...(transfer ? [] : [{ label: "Criar regra a partir desta", icon: "rule", href: `/regras?de=${id}` } as const]),
    { label: "Ver detalhes e nota", icon: "details", href: detailsHref },
    ...(manual ? [{ label: "Excluir transação", icon: "trash", tone: "danger", run: deleteManual, id, confirm: "Toque de novo para excluir" } as const] : []),
  ]
  return { left, right, menu }
}

const sheetInfo = ({ tx, accountName }: TxItem) => ({ title: tx.description, description: `${brl(tx.amount)} · ${dateBR(tx.date)} · ${accountName}` })

function CategoryPicker({ tx, run }: { tx: Tx; run: (fn: () => Promise<unknown>) => void }) {
  const options = use(Options)
  return (
    <form action={(f) => run(() => setCategory(f))} className="grid gap-1.5">
      <input type="hidden" name="id" value={tx.id} />
      <label htmlFor={`cat-${tx.id}`} className="text-sm font-medium">Categoria</label>
      <SubcategorySelect id={`cat-${tx.id}`} name="subcategoryId" options={options} defaultValue={String(tx.subcategoryId ?? "")} emptyLabel="A categorizar" autoSubmit />
    </form>
  )
}

const picker = (tx: Tx) => (tx.kind === "TRANSFER" ? undefined : ({ run }: { run: (fn: () => Promise<unknown>) => void }) => <CategoryPicker tx={tx} run={run} />)

/** Linha da lista: arrastar à direita categoriza (ou aceita a sugestão), à esquerda ignora/exclui; pressionar abre o painel. */
export function TxSwipe({ item, href, showAccount }: { item: TxItem; href: string; showAccount?: boolean }) {
  const { tx, accountName, color, subName, parentName } = item
  const Icon = tx.kind === "TRANSFER" ? ArrowLeftRight : tx.amount > 0 ? ArrowDownLeft : ArrowUpRight
  const c = tx.kind === "TRANSFER" ? "#71717a" : tx.amount > 0 ? "#22c55e" : (color ?? "#f59e0b")
  const trailing = tx.status === "PENDING" ? "Pendente" : showAccount ? accountName : null
  return (
    <SwipeRow {...txActions(item, href)} {...sheetInfo(item)} extra={picker(tx)} className="border-b last:border-0">
      <Link href={href} scroll={false} draggable={false} className={cn("flex items-center gap-3 px-3.5 py-3 hover:bg-muted/40", tx.ignored && "opacity-60")}>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `${c}1f`, color: c }}>
          <Icon className="size-4" />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{tx.description}</span>
            {tx.totalInstallments && tx.totalInstallments > 1 && <span className="shrink-0 rounded-full bg-muted px-2 text-xs text-muted-foreground">{tx.installmentNumber}/{tx.totalInstallments}</span>}
          </span>
          <span className={cn("truncate text-xs", !subName && tx.kind !== "TRANSFER" ? "font-medium text-warning" : "text-muted-foreground")}>
            {tx.kind === "TRANSFER" ? "Transferência" : subName ? `${parentName} › ${subName}` : "A categorizar"}
          </span>
        </span>
        <span className="grid shrink-0 justify-items-end">
          <Money value={tx.amount} signed={tx.kind !== "TRANSFER"} className={cn("text-sm font-medium", tx.kind === "TRANSFER" && "text-muted-foreground")} />
          {trailing && <span className="text-xs text-muted-foreground">{trailing}</span>}
        </span>
      </Link>
    </SwipeRow>
  )
}

/** Linha da tabela do desktop: clique direito abre o mesmo painel. */
export function TxContextRow({ item, href, className, children }: { item: TxItem; href: string; className?: string; children: ReactNode }) {
  return (
    <ContextRow menu={txActions(item, href).menu} {...sheetInfo(item)} extra={picker(item.tx)} className={className}>
      {children}
    </ContextRow>
  )
}
