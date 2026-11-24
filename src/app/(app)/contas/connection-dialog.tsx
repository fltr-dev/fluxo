import { inArray } from "drizzle-orm"
import { ChevronRight, CircleAlert, ExternalLink } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AccountAvatar } from "@/components/account-avatar"
import { CancelLink, FormActions, Money } from "@/components/bits"
import { InlineName } from "@/components/inline-name"
import { RouteModal } from "@/components/route-overlay"
import { Button, buttonVariants } from "@/components/ui/button"
import { db, investments, type institutions } from "@/db"
import { ACCOUNT_GROUPS, isClosedInvestment } from "@/lib/account-types"
import { accountLook } from "@/lib/banks"
import { ago, dateBR } from "@/lib/format"
import type { listAccounts } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { removeInstitution, renameInstitution } from "./actions"

type Account = Awaited<ReturnType<typeof listAccounts>>[number]
type Institution = typeof institutions.$inferSelect

async function removeAndClose(form: FormData) {
  "use server"
  await removeInstitution(form)
  redirect("/contas")
}

const byBalance = (a: Account, b: Account) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name, "pt-BR")

/**
 * Detalhe da conexão (modal no computador, bottom sheet no celular): nome editável, estado da sincronização, erro e as
 * contas que ela traz, por tipo. Ativos zerados (aplicações de caixinha resgatadas que o Open Finance continua mandando)
 * e contas arquivadas ficam recolhidos no fim. Clicar numa conta abre a edição; fechar a edição volta para cá.
 */
export async function ConnectionDialog({ inst, accounts, href }: { inst: Institution; accounts: Account[]; href: (patch: Record<string, string | number | undefined>) => string }) {
  const terms = await db
    .select({ accountId: investments.accountId, rateLabel: investments.rateLabel, dueDate: investments.dueDate })
    .from(investments)
    .where(inArray(investments.accountId, accounts.length ? accounts.map((a) => a.id) : [-1]))
  const termsOf = new Map(terms.map((t) => [t.accountId, [t.rateLabel, t.dueDate && `vence ${dateBR(t.dueDate)}`].filter(Boolean).join(" · ")]))

  const closed = accounts.filter((a) => a.archived || isClosedInvestment(a)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  const open = accounts.filter((a) => !closed.includes(a))
  const groups = ACCOUNT_GROUPS.map(([type, label]) => {
    const rows = open.filter((a) => a.type === type).sort(byBalance)
    return { type, label, rows, total: rows.reduce((t, a) => t + a.balance, 0) }
  }).filter((g) => g.rows.length)

  const Row = ({ a }: { a: Account }) => {
    const sub = termsOf.get(a.id) || (a.archived ? "Arquivada" : null)
    return (
      <li>
        <Link
          href={href({ editar: a.id })}
          scroll={false}
          className="group/row -mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <AccountAvatar look={accountLook(a)} size={32} />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-sm font-medium" title={a.name}>{a.name || "Sem nome"}</span>
            {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
          </span>
          <Money value={a.balance} className="shrink-0 text-sm font-medium" />
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover/row:translate-x-0.5" aria-hidden />
        </Link>
      </li>
    )
  }

  return (
    <RouteModal
      closeHref={href({ detalhe: undefined })}
      title={<InlineName id={inst.id} value={inst.name} action={renameInstitution} label="conexão" className="text-lg font-semibold" />}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", inst.error ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-income/10 text-income")}>
            <span className={cn("size-1.5 rounded-full", inst.error ? "bg-red-500" : "bg-income")} aria-hidden />
            {inst.error ? "Com erro" : "Ativa"}
          </span>
          <span>Sincronizado {inst.lastSyncedAt ? ago(inst.lastSyncedAt) : "nunca"}</span>
          <span className="w-full min-w-0 truncate text-xs">
            Item ID <span className="font-mono select-all">{inst.pluggyItemId}</span>
          </span>
        </span>
      }
    >
      <div className="grid gap-5">
        {inst.error && (
          <div role="alert" className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-40 flex-1">{inst.error}</span>
            <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Abrir MeuPluggy
              <ExternalLink />
            </a>
          </div>
        )}

        {groups.length === 0 && closed.length === 0 && <p className="text-sm text-muted-foreground">Esta conexão ainda não trouxe contas. Elas aparecem depois da próxima sincronização.</p>}

        {groups.map((g) => (
          <section key={g.type} className="grid gap-1" aria-label={g.label}>
            <h3 className="flex items-baseline justify-between gap-3 text-xs font-medium text-muted-foreground">
              <span>
                {g.label} <span className="tabular-nums">· {g.rows.length}</span>
              </span>
              <Money value={g.total} className="text-xs" />
            </h3>
            <ul className="grid">
              {g.rows.map((a) => <Row key={a.id} a={a} />)}
            </ul>
          </section>
        ))}

        {closed.length > 0 && (
          <details className="group/closed rounded-xl border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform duration-150 group-open/closed:rotate-90" aria-hidden />
              <span>
                <span className="tabular-nums">{closed.length}</span> {closed.length === 1 ? "encerrada" : "encerradas"}
              </span>
              <span className="ml-auto text-xs">saldo zero ou arquivadas</span>
            </summary>
            <ul className="grid px-3 pb-2 opacity-70">
              {closed.map((a) => <Row key={a.id} a={a} />)}
            </ul>
          </details>
        )}

        <FormActions
          start={
            <form action={removeAndClose}>
              <input type="hidden" name="id" value={inst.id} />
              <Button type="submit" variant="destructive" size="lg">
                Remover conexão
              </Button>
            </form>
          }
        >
          <CancelLink href={href({ detalhe: undefined })}>Fechar</CancelLink>
        </FormActions>
      </div>
    </RouteModal>
  )
}
