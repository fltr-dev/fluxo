import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, Pencil, Search } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AccountAvatar } from "@/components/account-avatar"
import { Empty, fieldClass, Money, PageTitle } from "@/components/bits"
import { BalanceArea } from "@/components/charts"
import { PeriodMenu } from "@/components/filters"
import { TxOptions, TxSwipe } from "@/components/tx-row"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ACCOUNT_TYPES } from "@/lib/account-types"
import { accountLook } from "@/lib/banks"
import { monthEnd, monthOf, monthStart, today } from "@/lib/domain/dates"
import { ago, dateBR, dayLabel } from "@/lib/format"
import { subcategoryOptions } from "@/lib/ledger"
import { accountBalanceSeries, listAccounts, listTransactions, PAGE_SIZE, parseFilters, totals, withParams } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { AccountEditSheet } from "../account-edit"

export default async function AccountPage({ params, searchParams }: PageProps<"/contas/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const accountId = Number(id)
  if (!Number.isInteger(accountId) || accountId <= 0) notFound()

  const accs = await listAccounts()
  const acc = accs.find((a) => a.id === accountId)
  if (!acc) notFound()

  // Histórico: últimos 3 meses por padrão; período, busca e página vivem na URL
  const f = parseFilters({ ...sp, periodo: typeof sp.periodo === "string" ? sp.periodo : "3m", conta: String(accountId), categoria: undefined, categorias: undefined, tipo: undefined, ver: undefined })
  const ym = monthOf(today())
  const month = { from: monthStart(ym), to: monthEnd(ym) }
  const [{ rows, count }, flow, series, options] = await Promise.all([
    listTransactions(f),
    totals({ preset: "mes", page: 1, accountId, ...month }),
    accountBalanceSeries(accountId, 12),
    subcategoryOptions(),
  ])

  const look = accountLook({ name: acc.name, bank: acc.bank, color: acc.color, institution: acc.institution })
  const card = acc.type === "CREDIT_CARD"
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const days = new Map<string, typeof rows>()
  for (const r of rows) days.set(r.tx.date, [...(days.get(r.tx.date) ?? []), r])
  const dayNet = (list: typeof rows) => list.filter((r) => r.tx.kind !== "TRANSFER" && !r.tx.ignored).reduce((s, r) => s + r.tx.amount, 0)
  // Abre o detalhe na tela de Transações, no dia da transação (a lista de lá já a contém)
  const txHref = (tx: (typeof rows)[number]["tx"]) => `/transacoes?periodo=custom&de=${tx.date}&ate=${tx.date}&conta=${accountId}&tx=${tx.id}`
  const self = `/contas/${accountId}`

  const info: [string, React.ReactNode][] = [
    ["Tipo", ACCOUNT_TYPES[acc.type]],
    ["Instituição", acc.institution ?? (acc.source === "MANUAL" ? "Conta manual" : "—")],
    ["Origem", acc.source === "PLUGGY" ? "Importada (Open Finance)" : "Lançamentos manuais"],
    ["Última sincronização", acc.source === "PLUGGY" ? (acc.syncedAt ? ago(acc.syncedAt) : "nunca") : "—"],
    ...(acc.source === "MANUAL" ? ([["Saldo inicial", <Money key="o" value={acc.openingBalance} />]] as [string, React.ReactNode][]) : []),
    ["Reserva de emergência", acc.isEmergencyReserve ? "Compõe a reserva" : "Não"],
  ]

  return (
    <div className="grid gap-5">
      <PageTitle
        title={acc.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {look.bankName ?? ACCOUNT_TYPES[acc.type]}
            {acc.archived && <span className="rounded-full bg-muted px-2 text-xs">arquivada</span>}
          </span>
        }
      >
        <Link href="/contas" className={buttonVariants({ variant: "outline" })}>
          <ChevronLeft />
          Todas as contas
        </Link>
        <Link href={`${self}?editar=1`} className={buttonVariants()}>
          <Pencil />
          Editar
        </Link>
      </PageTitle>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,4fr)_repeat(3,minmax(0,3fr))] lg:gap-4" aria-label="Resumo da conta">
        {/* Sem min-w-0 no bloco do saldo: se o valor não couber ao lado do avatar, ele desce em vez de ser cortado */}
        <Card className="col-span-2 flex-row flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 lg:col-span-1">
          <AccountAvatar look={look} size={48} className="rounded-xl" />
          <div className="grid">
            <span className="text-sm font-medium text-muted-foreground">{card ? "Fatura aberta" : "Saldo atual"}</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              <Money value={card ? Math.abs(acc.balance) : acc.balance} />
            </span>
          </div>
        </Card>
        {[
          { label: "Receitas no mês", value: flow.income, icon: ArrowDownLeft, color: "#22c55e" },
          { label: "Despesas no mês", value: flow.expense, icon: ArrowUpRight, color: "#f43f5e" },
          { label: "Resultado do mês", value: flow.income - flow.expense, icon: ArrowLeftRight, color: "#0ea5e9", signed: true, wide: true },
        ].map((k) => (
          <Card key={k.label} className={cn("gap-1 px-4 py-4", k.wide && "col-span-2 lg:col-span-1")}>
            <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <k.icon className="size-4" style={{ color: k.color }} />
              {k.label}
            </span>
            <Money value={k.value} signed={k.signed} className="text-xl font-semibold tracking-tight" />
            <span className="text-xs text-muted-foreground">Sem transferências</span>
          </Card>
        ))}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Evolução do saldo</CardTitle>
          </CardHeader>
          <CardContent>
            {series.length >= 2 ? <BalanceArea data={series} color={look.color} /> : <p className="py-10 text-center text-sm text-muted-foreground">O histórico de saldo aparece depois de algumas sincronizações.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Detalhes</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2.5 text-sm">
              {info.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b pb-2.5 last:border-0 last:pb-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-3" aria-label="Histórico de transações">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Histórico de transações</h2>
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" role="search" className="relative">
              {typeof sp.periodo === "string" && <input type="hidden" name="periodo" value={sp.periodo} />}
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input name="q" defaultValue={f.q} placeholder="Buscar na conta…" aria-label="Buscar transações da conta" className={cn(fieldClass, "w-56 pl-9")} />
            </form>
            <PeriodMenu f={f} sp={{ ...sp, editar: undefined }} />
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty icon={Search} title="Nada por aqui" action={<Link href={self} className={buttonVariants({ variant: "outline" })}>Limpar filtros</Link>}>
            Nenhuma transação desta conta em {dateBR(f.from)} a {dateBR(f.to)}.
          </Empty>
        ) : (
          <TxOptions options={options}>
          <div className="grid gap-4">
            {[...days].map(([day, list]) => {
              const net = dayNet(list)
              return (
                <section key={day} className="grid gap-1.5">
                  <div className="flex justify-between px-1 text-xs font-medium text-muted-foreground">
                    <span>{dayLabel(day)}</span>
                    {net ? <Money value={net} signed /> : <span>—</span>}
                  </div>
                  <Card className="gap-0 py-0">
                    {list.map((r) => (
                      <TxSwipe key={r.tx.id} item={r} href={txHref(r.tx)} />
                    ))}
                  </Card>
                </section>
              )
            })}
          </div>
          </TxOptions>
        )}

        {pages > 1 && (
          <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginação">
            <span className="text-muted-foreground">Página {f.page} de {pages} · {count} transações</span>
            <div className="flex gap-1">
              <Link aria-disabled={f.page <= 1} href={withParams(sp, { pagina: f.page - 1, editar: undefined })} className={buttonVariants({ variant: "outline", size: "icon", className: f.page <= 1 && "pointer-events-none opacity-50" })} aria-label="Página anterior">
                <ChevronLeft />
              </Link>
              <Link aria-disabled={f.page >= pages} href={withParams(sp, { pagina: f.page + 1, editar: undefined })} className={buttonVariants({ variant: "outline", size: "icon", className: f.page >= pages && "pointer-events-none opacity-50" })} aria-label="Próxima página">
                <ChevronRight />
              </Link>
            </div>
          </nav>
        )}
      </section>

      {sp.editar && <AccountEditSheet account={acc} closeHref={self} />}
    </div>
  )
}
