import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Clock, Download, EyeOff, Link2, ListChecks, Lock, Plus, Search, Sparkles, Tag, Trash2, X } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CancelLink, Empty, Field, fieldClass, FormActions, Money, PageTitle } from "@/components/bits"
import { BulkBar, SelectAll } from "@/components/bulk-bar"
import { Filters } from "@/components/filters"
import { FormSelect, SubcategorySelect } from "@/components/form-select"
import { RouteDialog, RouteSheet } from "@/components/route-overlay"
import { TxContextRow, TxOptions, TxSwipe } from "@/components/tx-row"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { transactions } from "@/db"
import { today } from "@/lib/domain/dates"
import { dateBR, dayLabel, pct } from "@/lib/format"
import { subcategoryOptions } from "@/lib/ledger"
import { listAccounts, listTransactions, PAGE_SIZE, parseFilters, shellStatus, withParams } from "@/lib/queries"
import { cn } from "@/lib/utils"
import {
  acceptSuggestion,
  bulkUpdate,
  createManual,
  deleteManual,
  markTransfer,
  rejectSuggestion,
  setCategory,
  setNote,
  toggleIgnored,
  unmarkTransfer,
  updateManual,
} from "./actions"

const SOURCE_LABEL: Record<string, string> = { RULE: "Regra", JEV: "IA", PLUGGY_MAP: "Mapa Pluggy", USER: "Você", NONE: "Nenhuma" }

type Account = Awaited<ReturnType<typeof listAccounts>>[number]
type Option = Awaited<ReturnType<typeof subcategoryOptions>>[number]
type Tx = typeof transactions.$inferSelect

/** Volta para a lista só se o destino for desta tela (evita redirecionamento aberto). */
const backTo = (form: FormData) => {
  const next = String(form.get("next") ?? "")
  return next.startsWith("/transacoes") ? next : "/transacoes"
}

async function createAndClose(form: FormData) {
  "use server"
  await createManual(form)
  redirect(backTo(form))
}

async function deleteAndClose(form: FormData) {
  "use server"
  await deleteManual(form)
  redirect(backTo(form))
}

function ManualForm({ action, accounts, options, values, submit, next, start, plain, cancelHref }: {
  action: (f: FormData) => Promise<void>
  accounts: Account[]
  options: Option[]
  values?: Pick<Tx, "id" | "accountId" | "date" | "description" | "amount" | "subcategoryId" | "note">
  submit: string
  next?: string
  /** botões à esquerda do rodapé (ex.: Excluir) */
  start?: React.ReactNode
  /** dentro de um bloco do painel: rodapé simples, sem grudar no fim da área rolável */
  plain?: boolean
  /** mostra "Cancelar" (modal de nova transação) */
  cancelHref?: string
}) {
  return (
    <form action={action} className="grid gap-4">
      {values && <input type="hidden" name="id" value={values.id} />}
      {next && <input type="hidden" name="next" value={next} />}
      <fieldset className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-[3px]">
        <legend className="sr-only">Tipo</legend>
        {(["despesa", "receita"] as const).map((d) => (
          <label key={d} className="flex h-8 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-muted-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm">
            <input type="radio" name="direction" value={d} defaultChecked={(values ? (values.amount > 0 ? "receita" : "despesa") : "despesa") === d} className="sr-only" />
            {d === "despesa" ? "Despesa" : "Receita"}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)">
          <input type="number" name="amount" required min="0.01" step="0.01" inputMode="decimal" placeholder="0,00" defaultValue={values ? Math.abs(values.amount) : undefined} className={cn(fieldClass, "h-11 text-lg font-semibold tabular-nums")} />
        </Field>
        <Field label="Data">
          <input type="date" name="date" required defaultValue={values?.date ?? today()} className={cn(fieldClass, "h-11")} />
        </Field>
      </div>
      <Field label="Descrição">
        <input name="description" required maxLength={200} placeholder="Ex.: Feira livre" defaultValue={values?.description} className={fieldClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Conta">
          <FormSelect name="accountId" required defaultValue={String(values?.accountId ?? accounts[0]?.id ?? "")} options={accounts.map((a) => ({ value: String(a.id), label: a.name }))} />
        </Field>
        <Field label="Categoria">
          <SubcategorySelect name="subcategoryId" options={options} defaultValue={String(values?.subcategoryId ?? "")} emptyLabel="A categorizar" />
        </Field>
      </div>
      <Field label="Nota (opcional)">
        <input name="note" maxLength={1000} placeholder="Algo para lembrar depois" defaultValue={values?.note ?? ""} className={fieldClass} />
      </Field>
      <FormActions start={start} plain={plain}>
        {cancelHref && <CancelLink href={cancelHref} />}
        <Button type="submit" size="lg">{submit}</Button>
      </FormActions>
    </form>
  )
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  const sp = await searchParams
  const f = parseFilters(sp)
  const [{ rows, count }, options, accounts, status] = await Promise.all([listTransactions(f), subcategoryOptions(), listAccounts(), shellStatus()])
  const activeAccounts = accounts.filter((a) => !a.archived)
  const label = new Map(options.map((o) => [o.id, `${o.parentName} › ${o.name}`]))
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const here = `/transacoes${withParams(sp, { tx: undefined, nova: undefined })}`
  const txHref = (id: number) => `/transacoes${withParams(sp, { tx: id, nova: undefined })}`

  // Agrupa por dia, com o saldo do dia (sem transferências e ignoradas)
  const days = new Map<string, typeof rows>()
  for (const r of rows) days.set(r.tx.date, [...(days.get(r.tx.date) ?? []), r])
  const dayNet = (list: typeof rows) => list.filter((r) => r.tx.kind !== "TRANSFER" && !r.tx.ignored).reduce((s, r) => s + r.tx.amount, 0)

  const views = [
    [undefined, "Todas", undefined, undefined],
    ["uncategorized", "A categorizar", Tag, status.uncategorized],
    ["suggested", "Sugestões da IA", Sparkles, status.suggested],
    ["pending", "Pendentes", Clock, undefined],
    ["transfers", "Transferências", ArrowLeftRight, undefined],
  ] as const

  const openId = Number(sp.tx) || undefined
  const open = rows.find((r) => r.tx.id === openId)

  return (
    <div className="grid gap-4">
      <PageTitle title="Transações" description={`${count} transações · ${dateBR(f.from)} a ${dateBR(f.to)}`}>
        <a href={`/api/export${withParams(sp, { pagina: undefined, tx: undefined, nova: undefined })}`} className={buttonVariants({ variant: "outline" })}>
          <Download />
          Exportar CSV
        </a>
        {activeAccounts.length > 0 && (
          <Link href={`/transacoes${withParams(sp, { nova: 1, tx: undefined })}`} className={buttonVariants({ className: "max-md:hidden" })}>
            <Plus />
            Nova transação
          </Link>
        )}
      </PageTitle>

      <div className="flex flex-wrap items-center gap-2">
        <form method="get" className="relative min-w-0 flex-1 sm:max-w-72" role="search">
          {Object.entries(sp).map(([k, v]) => typeof v === "string" && !["q", "pagina", "tx", "nova"].includes(k) && <input key={k} type="hidden" name={k} value={v} />)}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={f.q} placeholder="Buscar por descrição…" aria-label="Buscar transações" className={cn(fieldClass, "pl-9")} />
        </form>
        <Filters f={f} sp={sp}>{f.view && <input type="hidden" name="ver" value={f.view} />}</Filters>
      </div>

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Visões">
        {views.map(([v, l, Icon, n]) => (
          <Link
            key={l}
            href={withParams(sp, { ver: v, pagina: undefined, tx: undefined })}
            aria-current={f.view === v ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-medium hover:bg-muted",
              f.view === v && "border-primary bg-primary/10 text-primary hover:bg-primary/15",
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {l}
            {!!n && <span className="text-xs text-muted-foreground tabular-nums">{n}</span>}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Empty icon={Search} title="Nada por aqui" action={<Link href="/transacoes" className={buttonVariants({ variant: "outline" })}>Limpar filtros</Link>}>
          Nenhuma transação com esses filtros.
        </Empty>
      ) : (
        <TxOptions options={options}>
          {/* Desktop: tabela agrupada por dia; clique direito numa linha abre o painel de ações */}
          <Card className="hidden gap-0 py-0 md:flex">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] table-fixed text-sm">
                <colgroup>
                  <col className="w-12" />
                  <col />
                  <col className="w-60" />
                  <col className="w-48" />
                  <col className="w-32" />
                  <col className="w-12" />
                </colgroup>
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="h-10 w-12 pl-4 text-left"><SelectAll formId="bulk" /></th>
                    <th className="px-3 text-left font-medium">Descrição</th>
                    <th className="w-60 px-3 text-left font-medium">Categoria</th>
                    <th className="w-48 px-3 text-left font-medium">Conta</th>
                    <th className="w-32 px-3 text-right font-medium">Valor</th>
                    <th className="w-12 pr-3"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                {[...days].map(([day, list]) => {
                  const net = dayNet(list)
                  return (
                    <tbody key={day}>
                      <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                        <td colSpan={4} className="h-8 px-4">{dayLabel(day)}</td>
                        <td className={cn("px-3 text-right tabular-nums", net > 0 && "text-income")}>{net ? <Money value={net} signed /> : "—"}</td>
                        <td />
                      </tr>
                      {list.map((r) => {
                        const { tx, accountName, color } = r
                        return (
                        <TxContextRow key={tx.id} item={r} href={txHref(tx.id)} className={cn("border-b last:border-0 hover:bg-muted/30", tx.ignored && "opacity-60", openId === tx.id && "bg-muted")}>
                          <td className="pl-4"><input type="checkbox" name="ids" value={tx.id} form="bulk" aria-label={`Selecionar ${tx.description}`} className="size-4 accent-primary" /></td>
                          <td className="max-w-0 px-3 py-2.5">
                            <Link href={txHref(tx.id)} scroll={false} className="grid gap-0.5 hover:underline">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate font-medium" title={tx.description}>{tx.description}</span>
                                {tx.status === "PENDING" && <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 text-xs text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"><Clock className="size-3" />Pendente</span>}
                                {tx.totalInstallments && tx.totalInstallments > 1 && <span className="shrink-0 rounded-full bg-muted px-2 text-xs text-muted-foreground">Parcela {tx.installmentNumber}/{tx.totalInstallments}</span>}
                                {!tx.pluggyId && <span className="shrink-0 rounded-full border px-2 text-xs text-muted-foreground">Manual</span>}
                                {tx.ignored && <span className="shrink-0 rounded-full border px-2 text-xs text-muted-foreground">Ignorada</span>}
                              </span>
                            </Link>
                          </td>
                          <td className="px-3">
                            {tx.kind === "TRANSFER" ? (
                              <span className="flex items-center gap-1.5 text-muted-foreground"><Link2 className="size-4" />Transferência</span>
                            ) : tx.suggestedSubcategoryId ? (
                              <span className="flex items-center gap-1">
                                <span className="inline-flex max-w-52 items-center gap-1 truncate rounded-full border border-violet-200 bg-violet-50 px-2 text-xs font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300" title="Sugestão da IA">
                                  <Sparkles className="size-3 shrink-0" />
                                  {label.get(tx.suggestedSubcategoryId)?.split(" › ")[1] ?? "?"} · {pct(tx.suggestionConfidence ?? 0)}
                                </span>
                                <form action={acceptSuggestion}>
                                  <input type="hidden" name="id" value={tx.id} />
                                  <Button type="submit" variant="ghost" size="icon-sm" aria-label="Aceitar sugestão" className="text-income"><Check /></Button>
                                </form>
                                <form action={rejectSuggestion}>
                                  <input type="hidden" name="id" value={tx.id} />
                                  <Button type="submit" variant="ghost" size="icon-sm" aria-label="Rejeitar sugestão" className="text-muted-foreground"><X /></Button>
                                </form>
                              </span>
                            ) : (
                              <form action={setCategory} className="flex min-w-0 items-center gap-2">
                                <input type="hidden" name="id" value={tx.id} />
                                <span className="size-2 shrink-0 rounded-full" style={{ background: tx.subcategoryId ? (color ?? "#a1a1aa") : "#f59e0b" }} aria-hidden />
                                <SubcategorySelect
                                  name="subcategoryId"
                                  options={options}
                                  defaultValue={String(tx.subcategoryId ?? "")}
                                  emptyLabel="A categorizar"
                                  autoSubmit
                                  size="sm"
                                  aria-label={`Categoria de ${tx.description}`}
                                  className={cn(
                                    "h-7 w-full min-w-0 border-transparent bg-transparent px-1.5 shadow-none hover:border-border",
                                    !tx.subcategoryId && "border-dashed border-amber-300 bg-amber-50 font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400",
                                  )}
                                />
                              </form>
                            )}
                          </td>
                          <td className="max-w-40 truncate px-3 text-muted-foreground">{accountName}</td>
                          <td className={cn("px-3 text-right font-medium whitespace-nowrap tabular-nums", tx.kind === "TRANSFER" && "text-muted-foreground")}>
                            {tx.kind === "TRANSFER" ? <Money value={tx.amount} className="text-muted-foreground" /> : <Money value={tx.amount} signed />}
                          </td>
                          <td className="pr-3">
                            <Link href={txHref(tx.id)} scroll={false} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Detalhes de ${tx.description}`}>
                              <ChevronRight />
                            </Link>
                          </td>
                        </TxContextRow>
                        )
                      })}
                    </tbody>
                  )
                })}
              </table>
            </div>
          </Card>

          {/* Celular: lista agrupada por dia; arrastar revela ações, pressionar abre o painel */}
          <div className="grid gap-4 md:hidden">
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
                      <TxSwipe key={r.tx.id} item={r} href={txHref(r.tx.id)} showAccount />
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
          <span className="text-muted-foreground">Página {f.page} de {pages}</span>
          <div className="flex gap-1">
            <Link aria-disabled={f.page <= 1} href={withParams(sp, { pagina: f.page - 1, tx: undefined })} className={buttonVariants({ variant: "outline", size: "icon", className: f.page <= 1 && "pointer-events-none opacity-50" })} aria-label="Página anterior">
              <ChevronLeft />
            </Link>
            <Link aria-disabled={f.page >= pages} href={withParams(sp, { pagina: f.page + 1, tx: undefined })} className={buttonVariants({ variant: "outline", size: "icon", className: f.page >= pages && "pointer-events-none opacity-50" })} aria-label="Próxima página">
              <ChevronRight />
            </Link>
          </div>
        </nav>
      )}

      <BulkBar formId="bulk" action={bulkUpdate}>
        <SubcategorySelect
          name="subcategoryId"
          options={options}
          defaultValue=""
          emptyLabel="A categorizar"
          size="sm"
          aria-label="Categoria para as selecionadas"
          className="w-52 border-background/20 bg-transparent text-background shadow-none hover:bg-background/15 dark:bg-transparent dark:hover:bg-background/15 [&_svg]:text-background/70"
        />
        <Button type="submit" name="op" value="categorizar" variant="ghost" className="text-background hover:bg-background/15 hover:text-background">
          <Tag />
          Categorizar
        </Button>
        <Button type="submit" name="op" value="ignorar" variant="ghost" className="text-background hover:bg-background/15 hover:text-background">
          <EyeOff />
          Ignorar
        </Button>
      </BulkBar>

      {sp.nova && activeAccounts.length > 0 && (
        <RouteDialog closeHref={here} title="Nova transação" description="Lançamento manual. Você pode editar ou excluir depois.">
          <ManualForm action={createAndClose} accounts={activeAccounts} options={options} submit="Salvar transação" next={here} cancelHref={here} />
        </RouteDialog>
      )}

      {open && (
        <RouteSheet
          closeHref={here}
          title="Detalhes da transação"
          description={open.tx.pluggyId ? `Importada da Pluggy · ${open.accountName}` : `Lançamento manual · ${open.accountName}`}
        >
          <TxDetails tx={open.tx} accountName={open.accountName} label={label} options={options} accounts={accounts} here={here} />
        </RouteSheet>
      )}
    </div>
  )
}

function TxDetails({ tx, accountName, label, options, accounts, here }: { tx: Tx; accountName: string; label: Map<number, string>; options: Option[]; accounts: Account[]; here: string }) {
  const manual = !tx.pluggyId
  return (
    <div className="grid gap-5">
      <div className="grid gap-1 rounded-xl bg-muted p-4">
        <Money value={tx.amount} signed={tx.kind !== "TRANSFER"} className="text-2xl font-semibold tracking-tight" />
        <span className="font-medium">{tx.description}</span>
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full border bg-card px-2 py-0.5">{tx.kind === "TRANSFER" ? "Transferência" : tx.kind === "INCOME" ? "Receita" : "Despesa"}</span>
          <span className={cn("rounded-full px-2 py-0.5", tx.status === "PENDING" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-income/10 text-income")}>
            {tx.status === "PENDING" ? "Pendente" : "Confirmada"}
          </span>
          {tx.ignored && <span className="rounded-full border bg-card px-2 py-0.5">Ignorada nos relatórios</span>}
        </div>
      </div>

      <dl className="grid gap-2.5 text-sm">
        {[
          ["Data", dateBR(tx.date)],
          ["Conta", accountName],
          ...(tx.totalInstallments && tx.totalInstallments > 1 ? [["Parcela", `${tx.installmentNumber}/${tx.totalInstallments}`]] : []),
          ...(tx.pluggyCategory ? [["Categoria da Pluggy", tx.pluggyCategory]] : []),
          ["Origem da categoria", SOURCE_LABEL[tx.categorySource] ?? tx.categorySource],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {!manual && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Valor e data vêm do banco e não podem ser editados.
        </p>
      )}

      {tx.suggestedSubcategoryId && (
        <div className="grid gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4" />
            Sugestão da IA · {pct(tx.suggestionConfidence ?? 0)} de confiança
          </span>
          <span className="text-sm">{label.get(tx.suggestedSubcategoryId) ?? "?"}</span>
          <div className="flex gap-2">
            <form action={acceptSuggestion}>
              <input type="hidden" name="id" value={tx.id} />
              <Button type="submit">Aceitar</Button>
            </form>
            <form action={rejectSuggestion}>
              <input type="hidden" name="id" value={tx.id} />
              <Button type="submit" variant="outline">Rejeitar</Button>
            </form>
          </div>
        </div>
      )}

      {tx.kind !== "TRANSFER" && (
        <form action={setCategory} className="grid gap-1.5">
          <input type="hidden" name="id" value={tx.id} />
          <label htmlFor="sheet-cat" className="text-sm font-medium">Categoria</label>
          <SubcategorySelect id="sheet-cat" name="subcategoryId" options={options} defaultValue={String(tx.subcategoryId ?? "")} emptyLabel="A categorizar" autoSubmit />
          <Link href={`/regras?de=${tx.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <ListChecks className="size-3.5" />
            Criar regra a partir desta transação
          </Link>
        </form>
      )}

      <form action={setNote} className="grid gap-1.5">
        <input type="hidden" name="id" value={tx.id} />
        <label htmlFor="sheet-note" className="text-sm font-medium">Nota</label>
        <textarea id="sheet-note" name="note" defaultValue={tx.note ?? ""} maxLength={1000} rows={3} placeholder="Ex.: racha do jantar de sexta" className={cn(fieldClass, "h-auto py-2")} />
        <Button type="submit" variant="outline" className="justify-self-start">Salvar nota</Button>
      </form>

      <div className="grid gap-2">
        <form action={toggleIgnored} className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
          <input type="hidden" name="id" value={tx.id} />
          <span className="grid">
            <span className="text-sm font-medium">Ignorar nos relatórios</span>
            <span className="text-xs text-muted-foreground">Não conta em receitas, despesas, limites nem médias.</span>
          </span>
          <Button type="submit" variant="outline" size="sm">{tx.ignored ? "Voltar a considerar" : "Ignorar"}</Button>
        </form>
        <form action={tx.kind === "TRANSFER" ? unmarkTransfer : markTransfer} className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
          <input type="hidden" name="id" value={tx.id} />
          <span className="grid">
            <span className="text-sm font-medium">Transferência entre contas</span>
            <span className="text-xs text-muted-foreground">{tx.kind === "TRANSFER" ? "Não conta como receita nem despesa." : "Use quando for uma movimentação entre suas contas."}</span>
          </span>
          <Button type="submit" variant="outline" size="sm">{tx.kind === "TRANSFER" ? "Não é" : "Marcar"}</Button>
        </form>
      </div>

      {manual && (
        <details className="group rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">Editar lançamento manual</summary>
          <div className="mt-4 grid gap-4">
            <ManualForm
              action={updateManual}
              accounts={accounts}
              options={options}
              values={tx}
              submit="Salvar alterações"
              plain
              start={
                <Button type="submit" form="delete-tx" variant="destructive" size="lg">
                  <Trash2 />
                  Excluir
                </Button>
              }
            />
            {/* formulário à parte: o botão Excluir do rodapé o aciona pelo atributo `form` */}
            <form id="delete-tx" action={deleteAndClose}>
              <input type="hidden" name="id" value={tx.id} />
              <input type="hidden" name="next" value={here} />
            </form>
          </div>
        </details>
      )}
    </div>
  )
}
