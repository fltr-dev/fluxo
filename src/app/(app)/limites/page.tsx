import { Gauge, Pencil, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Bar, Empty, Field, fieldClass, PageTitle } from "@/components/bits"
import { FormSelect } from "@/components/form-select"
import { RouteDialog } from "@/components/route-overlay"
import { ContextRow, SwipeRow, type RowAction } from "@/components/swipe-row"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { limitStatus } from "@/lib/domain/calc"
import { monthEnd, monthOf, monthStart, today } from "@/lib/domain/dates"
import { brl, monthLabel, pct } from "@/lib/format"
import { byCategory, categoryTree, limitsWithUsage } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { deleteLimit, saveLimit } from "./actions"

const STATE = {
  ok: { badge: "bg-income/10 text-income", text: "" },
  warn: { badge: "bg-amber-500/10 text-warning", text: "Atenção" },
  over: { badge: "bg-red-500/10 text-red-700 dark:text-red-400", text: "Estourado" },
}

async function saveAndClose(form: FormData) {
  "use server"
  await saveLimit(form)
  redirect("/limites")
}

/** Gestos: arrastar à direita mostra as transações, à esquerda edita/exclui; pressionar (ou clique direito) abre o painel. */
function limitActions(id: number, categoryId: number) {
  const list: RowAction = { label: "Transações", icon: "list", tone: "primary", href: `/transacoes?categoria=${categoryId}&tipo=despesa` }
  const edit: RowAction = { label: "Editar", icon: "edit", href: `/limites?editar=${id}` }
  const remove: RowAction = { label: "Excluir", icon: "trash", tone: "danger", run: deleteLimit, id, confirm: "Confirmar" }
  return {
    left: [list],
    right: [edit, remove],
    menu: [{ ...list, label: "Ver transações" }, { ...edit, label: "Editar limite" }, { ...remove, label: "Excluir limite", confirm: "Toque de novo para excluir" }],
  }
}

export default async function LimitsPage({ searchParams }: PageProps<"/limites">) {
  const sp = await searchParams
  const ym = monthOf(today())
  const month = { from: monthStart(ym), to: monthEnd(ym) }
  const [limits, tree, spent] = await Promise.all([
    limitsWithUsage(month),
    categoryTree(),
    byCategory({ preset: "mes", page: 1, ...month, kind: "EXPENSE" }),
  ])
  const expenseTree = tree.filter((c) => c.kind === "EXPENSE")
  const colorOf = new Map(expenseTree.flatMap((p) => [[p.id, p.color] as const, ...p.subs.map((s) => [s.id, p.color] as const)]))
  const rows = limits.map((l) => ({ l, s: limitStatus(l.spent, l.limit) })).sort((a, b) => b.s.pct - a.s.pct)
  const budget = limits.reduce((s, l) => s + l.limit, 0)
  const used = limits.reduce((s, l) => s + l.spent, 0)
  const count = (st: string) => rows.filter((r) => r.s.state === st).length
  const limited = new Set(limits.map((l) => l.categoryId))
  const withoutLimit = spent.filter((c) => c.id && !limited.has(c.id) && !expenseTree.find((p) => p.id === c.id)?.subs.some((s) => limited.has(s.id)))

  const editId = Number(sp.editar) || undefined
  const editing = limits.find((l) => l.id === editId)
  const preset = Number(sp.categoria) || editing?.categoryId

  return (
    <div className="grid gap-5">
      <PageTitle title="Limites de gasto" description={`${monthLabel(ym)} · pendentes contam; transferências e ignoradas não.`}>
        <Link href="/limites?novo=1" className={buttonVariants()}>
          <Plus />
          Novo limite
        </Link>
      </PageTitle>

      {limits.length === 0 ? (
        <Empty icon={Gauge} title="Nenhum limite definido" action={<Link href="/limites?novo=1" className={buttonVariants()}><Plus />Criar limite</Link>}>
          Defina um teto mensal por categoria ou subcategoria e acompanhe o consumo do mês.
        </Empty>
      ) : (
        <>
          <Card className="gap-0 py-0">
            <div className="grid sm:grid-cols-4">
              {[
                ["Orçado no mês", brl(budget), `${limits.length} limites ativos`],
                ["Gasto até agora", brl(used), `${budget ? pct(used / budget) : "—"} do orçado`],
                ["Disponível", brl(budget - used), "somando todos os limites"],
              ].map(([label, value, hint], i) => (
                <div key={label} className={cn("grid gap-0.5 px-5 py-4", i > 0 && "border-t sm:border-t-0 sm:border-l")}>
                  <span className="text-sm font-medium text-muted-foreground">{label}</span>
                  <span className={cn("text-xl font-semibold tracking-tight tabular-nums", label === "Disponível" && (budget - used >= 0 ? "text-income" : "text-expense"))}>{value}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </div>
              ))}
              <div className="grid content-start gap-2 border-t px-5 py-4 sm:border-t-0 sm:border-l">
                <span className="text-sm font-medium text-muted-foreground">Situação</span>
                <span className="flex flex-wrap gap-1.5">
                  {count("over") > 0 && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATE.over.badge)}>{count("over")} estourado</span>}
                  {count("warn") > 0 && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATE.warn.badge)}>{count("warn")} em atenção</span>}
                  {count("ok") > 0 && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATE.ok.badge)}>{count("ok")} ok</span>}
                </span>
              </div>
            </div>
            <div className="px-5 pb-5">
              <Bar value={budget ? used / budget : 0} state={used > budget ? "over" : used >= budget * 0.8 ? "warn" : "ok"} className="h-2.5" />
            </div>
          </Card>

          <Card className="gap-0 pb-0">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-3">
              <CardTitle className="font-semibold">Uso por limite</CardTitle>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" />Abaixo de 80%</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-amber-500" />Atenção · 80%+</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-red-500" />Estourado · 100%+</span>
              </div>
            </CardHeader>
            {/* Celular: lista com gestos (arrastar revela ações, pressionar abre o painel) */}
            <div className="border-t md:hidden">
              {rows.map(({ l, s }) => {
                const over = l.spent - l.limit
                return (
                  <SwipeRow key={l.id} {...limitActions(l.id, l.categoryId)} title={l.label} description={`${brl(l.spent)} de ${brl(l.limit)} · ${pct(s.pct)}`} className="border-b last:border-0">
                    <Link href={`/transacoes?categoria=${l.categoryId}&tipo=despesa`} draggable={false} className="grid gap-2 px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf.get(l.categoryId) ?? "#a1a1aa" }} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.label}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", STATE[s.state].badge)}>{pct(s.pct)}</span>
                      </span>
                      <Bar value={s.pct} state={s.state} />
                      <span className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                        <span>{brl(l.spent)} de {brl(l.limit)}</span>
                        <span className={cn(over > 0 && "font-medium text-expense")}>{over > 0 ? `${brl(over)} acima` : `${brl(-over)} disponível`}</span>
                      </span>
                    </Link>
                  </SwipeRow>
                )
              })}
            </div>
            <div className="overflow-x-auto border-t max-md:hidden">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="h-10 px-5 text-left font-medium">Categoria</th>
                    <th className="px-3 text-left font-medium">Consumo</th>
                    <th className="px-3 text-right font-medium">Gasto</th>
                    <th className="px-3 text-right font-medium">Limite</th>
                    <th className="px-3 text-right font-medium">Disponível</th>
                    <th className="w-24 pr-4"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ l, s }) => (
                    <ContextRow key={l.id} menu={limitActions(l.id, l.categoryId).menu} title={l.label} description={`${brl(l.spent)} de ${brl(l.limit)} · ${pct(s.pct)}`} className="border-b last:border-0">
                      <td className="h-14 px-5">
                        <Link href={`/transacoes?categoria=${l.categoryId}&tipo=despesa`} className="flex items-center gap-2.5 font-medium hover:underline">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf.get(l.categoryId) ?? "#a1a1aa" }} />
                          {l.label}
                        </Link>
                      </td>
                      <td className="px-3">
                        <span className="flex items-center gap-2.5">
                          <Bar value={s.pct} state={s.state} className="w-40" />
                          <span className={cn("min-w-12 rounded-full px-2 py-0.5 text-center text-xs font-medium tabular-nums", STATE[s.state].badge)}>{pct(s.pct)}</span>
                        </span>
                      </td>
                      <td className="px-3 text-right font-medium tabular-nums">{brl(l.spent)}</td>
                      <td className="px-3 text-right text-muted-foreground tabular-nums">{brl(l.limit)}</td>
                      <td className={cn("px-3 text-right font-medium tabular-nums", l.limit - l.spent < 0 && "text-expense")}>{brl(l.limit - l.spent)}</td>
                      <td className="pr-4">
                        <span className="flex justify-end gap-0.5">
                          <Link href={`/limites?editar=${l.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Editar limite de ${l.label}`}>
                            <Pencil />
                          </Link>
                          <form action={deleteLimit}>
                            <input type="hidden" name="id" value={l.id} />
                            <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Remover limite de ${l.label}`}>
                              <Trash2 />
                            </Button>
                          </form>
                        </span>
                      </td>
                    </ContextRow>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {withoutLimit.length > 0 && (
        <section className="grid gap-3 rounded-2xl border border-dashed p-5">
            <div className="grid">
              <span className="font-medium">Sem limite definido</span>
              <span className="text-sm text-muted-foreground">Gastos do mês nessas categorias. Toque para criar um limite.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {withoutLimit.map((c) => (
                <Link key={c.id} href={`/limites?novo=1&categoria=${c.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-medium hover:bg-muted">
                  <span className="size-2 rounded-full" style={{ background: c.color ?? "#a1a1aa" }} />
                  {c.name}
                  <span className="text-xs text-muted-foreground tabular-nums">{brl(c.total)}</span>
                  <Plus className="size-3.5 text-muted-foreground" />
                </Link>
              ))}
            </div>
        </section>
      )}

      {(sp.novo || editing) && (
        <RouteDialog closeHref="/limites" title={editing ? "Editar limite" : "Novo limite"} description="Vale para todo mês calendário até você remover.">
          <form action={saveAndClose} className="grid gap-4">
            <Field label="Categoria ou subcategoria">
              <FormSelect
                name="categoryId"
                required
                defaultValue={preset ? String(preset) : null}
                placeholder="Escolha…"
                groups={expenseTree.map((p) => ({
                  label: p.name,
                  options: [{ value: String(p.id), label: `${p.name} (categoria inteira)`, text: p.name, color: p.color }, ...p.subs.map((s) => ({ value: String(s.id), label: s.name, text: `${p.name} › ${s.name}`, color: p.color }))],
                }))}
              />
            </Field>
            <Field label="Valor mensal (R$)" hint="Salvar de novo para a mesma categoria atualiza o valor.">
              <input type="number" name="monthlyAmount" required min="0.01" step="0.01" inputMode="decimal" defaultValue={editing?.limit} className={cn(fieldClass, "h-11 text-lg font-semibold tabular-nums")} />
            </Field>
            <Button type="submit" className="h-9">{editing ? "Salvar limite" : "Criar limite"}</Button>
          </form>
        </RouteDialog>
      )}
    </div>
  )
}
