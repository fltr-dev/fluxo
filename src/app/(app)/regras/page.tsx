import { asc, eq, ne } from "drizzle-orm"
import { ChevronRight, CircleCheck, Eye, ListChecks, Pencil, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { Empty, Field, fieldClass, Money, PageTitle, SubcategoryOptions } from "@/components/bits"
import { RouteSheet } from "@/components/route-overlay"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { categoryRules, db, transactions } from "@/db"
import { ruleMatches } from "@/lib/domain/categorize"
import { brl, dateBR } from "@/lib/format"
import { subcategoryOptions } from "@/lib/ledger"
import { listAccounts } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { applyRulesToExisting, deleteRule, saveRule, toggleRule } from "./actions"

const MATCH_LABEL = { CONTAINS: "Descrição contém", STARTS_WITH: "Descrição começa com", REGEX: "Descrição casa com regex" }
const MATCH_SHORT = { CONTAINS: "Contém", STARTS_WITH: "Começa com", REGEX: "Regex" }

type Rule = typeof categoryRules.$inferSelect

function RuleForm({ rule, accounts, options }: { rule: Partial<Rule>; accounts: { id: number; name: string }[]; options: Awaited<ReturnType<typeof subcategoryOptions>> }) {
  return (
    <form action={saveRule} className="grid gap-4">
      {rule.id && <input type="hidden" name="id" value={rule.id} />}
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Descrição da transação</legend>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-[3px]">
          {Object.entries(MATCH_SHORT).map(([v, l]) => (
            <label key={v} className="flex h-8 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-muted-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm">
              <input type="radio" name="matchType" value={v} defaultChecked={(rule.matchType ?? "CONTAINS") === v} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
        <input name="pattern" required maxLength={200} defaultValue={rule.pattern} aria-label="Padrão" placeholder="Ex.: UBER" className={cn(fieldClass, "mt-1 font-mono")} />
        <span className="text-xs text-muted-foreground">Não diferencia maiúsculas de minúsculas.</span>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Conta">
          <select name="accountId" defaultValue={rule.accountId ?? ""} className={fieldClass}>
            <option value="">Qualquer conta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select name="kind" defaultValue={rule.kind ?? ""} className={fieldClass}>
            <option value="">Qualquer</option>
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Receita</option>
          </select>
        </Field>
        <Field label="Valor mínimo (R$)">
          <input type="number" name="minAmount" min={0} step="0.01" defaultValue={rule.minAmount ?? ""} className={fieldClass} />
        </Field>
        <Field label="Valor máximo (R$)">
          <input type="number" name="maxAmount" min={0} step="0.01" defaultValue={rule.maxAmount ?? ""} className={fieldClass} />
        </Field>
      </div>
      <Field label="Categorizar como">
        <select name="subcategoryId" required defaultValue={rule.subcategoryId ?? ""} className={fieldClass}>
          <option value="" disabled>Escolha…</option>
          <SubcategoryOptions options={options} />
        </select>
      </Field>
      <Field label="Prioridade" hint="Menor número vence quando duas regras casam.">
        <input type="number" name="priority" min={0} max={10000} defaultValue={rule.priority ?? 100} className={cn(fieldClass, "w-28")} />
      </Field>
      <Button type="submit" className="h-9">{rule.id ? "Salvar regra" : "Criar regra"}</Button>
    </form>
  )
}

export default async function RulesPage({ searchParams }: PageProps<"/regras">) {
  const sp = await searchParams
  const fromTx = Number(sp.de) || undefined
  const editId = Number(sp.editar) || undefined

  const [rules, options, accounts, [tx]] = await Promise.all([
    db.select().from(categoryRules).orderBy(asc(categoryRules.priority), asc(categoryRules.id)),
    subcategoryOptions(),
    listAccounts(),
    fromTx ? db.select().from(transactions).where(eq(transactions.id, fromTx)) : [],
  ])
  const label = new Map(options.map((o) => [o.id, { parent: o.parentName, name: o.name, color: o.color }]))
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const editing = rules.find((r) => r.id === editId)
  const sheetOpen = !!(editing || tx || sp.nova)
  const draft: Partial<Rule> = editing ?? (tx ? { pattern: tx.description, subcategoryId: tx.subcategoryId ?? undefined, kind: tx.amount < 0 ? "EXPENSE" : "INCOME" } : {})

  // Pré-visualização em memória (só ao editar): transações que a regra casaria, exceto transferências
  const preview = editing ? (await db.select().from(transactions).where(ne(transactions.kind, "TRANSFER"))).filter((t) => ruleMatches({ ...editing, active: true }, t)) : []
  const userEdited = preview.filter((t) => t.categorySource === "USER").length

  return (
    <div className="grid gap-5">
      <PageTitle title="Regras de categorização" description="Aplicadas em ordem a cada transação nova. A primeira que casar vence.">
        <form action={applyRulesToExisting}>
          <Button type="submit" variant="outline">Aplicar às existentes</Button>
        </form>
        <Link href="/regras?nova=1" className={buttonVariants()}>
          <Plus />
          Nova regra
        </Link>
      </PageTitle>

      {sp.aplicadas && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CircleCheck className="size-4" />
          {sp.aplicadas} transações recategorizadas.
        </div>
      )}

      <Card className="gap-2 px-5 py-4">
        <span className="text-xs font-medium text-muted-foreground">Ordem da categorização automática</span>
        <ol className="flex flex-wrap items-center gap-2 text-xs font-medium">
          {[
            ["1 Suas regras", "bg-emerald-500/10 text-income"],
            ["2 Jev (IA)", "bg-violet-500/10 text-violet-700 dark:text-violet-300"],
            ["3 Mapeamento Pluggy", "bg-muted text-muted-foreground"],
            ["4 A categorizar", "bg-amber-500/10 text-amber-700 dark:text-amber-400"],
          ].map(([l, c], i, all) => (
            <li key={l} className="flex items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-0.5", c)}>{l}</span>
              {i < all.length - 1 && <ChevronRight className="size-3.5 text-muted-foreground" />}
            </li>
          ))}
        </ol>
      </Card>

      {rules.length === 0 ? (
        <Empty icon={ListChecks} title="Nenhuma regra" action={<Link href="/regras?nova=1" className={buttonVariants()}><Plus />Criar regra</Link>}>
          Regras têm prioridade sobre o Jev e o mapeamento da Pluggy.
        </Empty>
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="h-10 w-14 px-4 text-left font-medium">#</th>
                  <th className="px-3 text-left font-medium">Condição</th>
                  <th className="px-3 text-left font-medium">Subcategoria</th>
                  <th className="px-3 text-left font-medium">Ativa</th>
                  <th className="w-28 pr-4"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => {
                  const sub = label.get(r.subcategoryId)
                  const filters = [
                    r.accountId && `Conta: ${accountName.get(r.accountId)}`,
                    r.kind && (r.kind === "EXPENSE" ? "Despesa" : "Receita"),
                    (r.minAmount != null || r.maxAmount != null) && `${r.minAmount != null ? brl(r.minAmount) : "R$ 0"} a ${r.maxAmount != null ? brl(r.maxAmount) : "∞"}`,
                  ].filter(Boolean)
                  return (
                    <tr key={r.id} className={cn("border-b last:border-0", editId === r.id && "bg-muted", !r.active && "opacity-60")}>
                      <td className="px-4 font-medium text-muted-foreground tabular-nums">{r.priority}</td>
                      <td className="px-3 py-3">
                        <Link href={`/regras?editar=${r.id}`} scroll={false} className="grid gap-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground">{MATCH_LABEL[r.matchType]}</span>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] font-medium">{r.pattern}</code>
                          </span>
                          {filters.length > 0 && (
                            <span className="flex flex-wrap gap-1">
                              {filters.map((x) => (
                                <span key={String(x)} className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{x}</span>
                              ))}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-3">
                        <span className="flex items-center gap-2">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: sub?.color ?? "#a1a1aa" }} />
                          <span className="truncate"><span className="text-muted-foreground">{sub?.parent} › </span>{sub?.name ?? "?"}</span>
                        </span>
                      </td>
                      <td className="px-3">
                        <form action={toggleRule}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            role="switch"
                            aria-checked={r.active}
                            aria-label={`Regra ${r.pattern} ativa`}
                            className={cn("relative h-5 w-9 rounded-full transition-colors", r.active ? "bg-primary" : "bg-input")}
                          >
                            <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow transition-transform", r.active && "translate-x-4")} />
                          </button>
                        </form>
                      </td>
                      <td className="pr-4">
                        <span className="flex justify-end gap-0.5">
                          <Link href={`/regras?editar=${r.id}`} scroll={false} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Editar e ver prévia">
                            <Pencil />
                          </Link>
                          <form action={deleteRule}>
                            <input type="hidden" name="id" value={r.id} />
                            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Excluir regra" className="text-muted-foreground hover:text-destructive">
                              <Trash2 />
                            </Button>
                          </form>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {sheetOpen && (
        <RouteSheet closeHref="/regras" title={editing ? "Editar regra" : "Nova regra"} description={tx ? `A partir de “${tx.description}”` : editing ? `Prioridade ${editing.priority}` : undefined}>
          <div className="grid gap-6">
            <RuleForm key={editing?.id ?? fromTx ?? "new"} rule={draft} accounts={accounts.filter((a) => !a.archived)} options={options} />
            {editing && (
              <section className="grid gap-3 rounded-xl border bg-muted/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium"><Eye className="size-4" />Prévia</span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-income tabular-nums">{preview.length} transações</span>
                </div>
                <ul className="grid text-sm">
                  {preview.slice(0, 8).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 border-b py-1.5 last:border-0">
                      <span className="grid min-w-0">
                        <span className="truncate font-mono text-xs">{t.description}</span>
                        <span className="text-xs text-muted-foreground">{dateBR(t.date)} · {t.categorySource === "USER" ? "editada por você" : "será aplicada"}</span>
                      </span>
                      <Money value={t.amount} className="shrink-0 font-medium" />
                    </li>
                  ))}
                </ul>
                {userEdited > 0 && <span className="text-xs text-muted-foreground">{userEdited} foram categorizadas por você e serão preservadas.</span>}
              </section>
            )}
          </div>
        </RouteSheet>
      )}
    </div>
  )
}
