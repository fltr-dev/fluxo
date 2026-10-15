import { asc, isNotNull, sql } from "drizzle-orm"
import { ArrowRight, ChevronRight, Lock, Merge, Pencil, Plus, Tag, Tags } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Empty, Field, fieldClass, IconCircle, PageTitle } from "@/components/bits"
import { CategoryFields } from "@/components/category-fields"
import { categoryIcon, CategoryIcon } from "@/components/category-icon"
import { FormSelect, SubcategorySelect } from "@/components/form-select"
import { RouteDialog, RouteSheet } from "@/components/route-overlay"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db, pluggyCategoryMap, transactions } from "@/db"
import { monthEnd, monthOf, monthStart, today } from "@/lib/domain/dates"
import { brl } from "@/lib/format"
import { subcategoryOptions } from "@/lib/ledger"
import { byCategory, categoryTree, shellStatus, withParams } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { createCategory, mergeSubcategories, seedDefaults, setPluggyMapping, toggleArchived, updateCategory } from "./actions"

const TABS = [
  ["EXPENSE", "Despesas"],
  ["INCOME", "Receitas"],
  ["ARCHIVED", "Arquivadas"],
] as const

async function createAndClose(form: FormData) {
  "use server"
  await createCategory(form)
  redirect(form.get("parentId") ? `/categorias?editar=${form.get("parentId")}` : "/categorias")
}
async function mergeAndClose(form: FormData) {
  "use server"
  await mergeSubcategories(form)
  redirect("/categorias")
}

export default async function CategoriesPage({ searchParams }: PageProps<"/categorias">) {
  const sp = await searchParams
  const ym = monthOf(today())
  const [tree, options, seen, mapped, monthSpend, monthIncome, status] = await Promise.all([
    categoryTree(true),
    subcategoryOptions(),
    db.selectDistinct({ name: transactions.pluggyCategory }).from(transactions).where(isNotNull(transactions.pluggyCategory)).orderBy(asc(transactions.pluggyCategory)),
    db.select().from(pluggyCategoryMap).orderBy(asc(sql`lower(${pluggyCategoryMap.pluggyCategory})`)),
    byCategory({ preset: "mes", page: 1, from: monthStart(ym), to: monthEnd(ym), kind: "EXPENSE" }),
    byCategory({ preset: "mes", page: 1, from: monthStart(ym), to: monthEnd(ym), kind: "INCOME" }),
    shellStatus(),
  ])

  if (tree.length === 0) {
    return (
      <div className="grid gap-5">
        <PageTitle title="Categorias" />
        <Empty icon={Tags} title="Nenhuma categoria ainda" action={<form action={seedDefaults}><Button type="submit">Criar categorias padrão</Button></form>}>
          Comece com o conjunto padrão (Moradia, Alimentação, Transporte…) e ajuste depois.
        </Empty>
      </div>
    )
  }

  const tab = (TABS.find(([k]) => k === sp.tipo)?.[0] ?? "EXPENSE") as (typeof TABS)[number][0]
  const monthTotal = new Map([...monthSpend, ...monthIncome].map((c) => [c.id, c.total]))
  const visible = tab === "ARCHIVED" ? tree.filter((p) => p.archived || p.subs.some((s) => s.archived)) : tree.filter((p) => p.kind === tab && !p.archived)
  const count = (k: string) => (k === "ARCHIVED" ? tree.filter((p) => p.archived || p.subs.some((s) => s.archived)).length : tree.filter((p) => p.kind === k && !p.archived).length)

  const mapBy = new Map(mapped.map((m) => [m.pluggyCategory, m.subcategoryId]))
  const pluggyNames = [...new Set([...seen.map((s) => s.name!), ...mapped.map((m) => m.pluggyCategory)])].sort((a, b) => a.localeCompare(b))
  const editing = tree.find((p) => p.id === Number(sp.editar))
  const close = `/categorias${withParams(sp, { editar: undefined, nova: undefined, mesclar: undefined })}`

  return (
    <div className="grid gap-5">
      <PageTitle title="Categorias" description="Dois níveis: categoria e subcategoria. Toda transação fica numa subcategoria.">
        <Link href="/categorias?mesclar=1" className={buttonVariants({ variant: "outline" })}>
          <Merge />
          Mesclar
        </Link>
        <Link href={`/categorias${withParams(sp, { nova: 1 })}`} className={buttonVariants()}>
          <Plus />
          Nova categoria
        </Link>
      </PageTitle>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card className="gap-3">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <nav className="inline-flex gap-0.5 rounded-lg bg-muted p-[3px]" aria-label="Tipo de categoria">
              {TABS.map(([k, l]) => (
                <Link
                  key={k}
                  href={withParams(sp, { tipo: k === "EXPENSE" ? undefined : k })}
                  aria-current={tab === k ? "page" : undefined}
                  className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground", tab === k && "bg-card text-foreground shadow-sm")}
                >
                  {l}
                  <span className="text-xs text-muted-foreground tabular-nums">{count(k)}</span>
                </Link>
              ))}
            </nav>
            <span className="hidden text-xs text-muted-foreground sm:block">Valores do mês atual</span>
          </CardHeader>
          <CardContent className="grid">
            {visible.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nada por aqui.</p>}
            {visible.map((p) => (
              <details key={p.id} className="group border-b last:border-0">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <IconCircle icon={categoryIcon(p.name, p.icon)} color={p.color} soft className="size-9" />
                  <span className="grid min-w-0 flex-1">
                    <span className={cn("truncate font-medium", p.archived && "text-muted-foreground line-through")}>{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.subs.length} subcategorias</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums">{monthTotal.get(p.id) ? brl(monthTotal.get(p.id)!) : "—"}</span>
                  <Link href={`/categorias${withParams(sp, { editar: p.id })}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Editar ${p.name}`}>
                    <Pencil />
                  </Link>
                </summary>
                <ul className="grid gap-0.5 pb-3 pl-[4.25rem]">
                  {p.subs.map((s) => (
                    <li key={s.id} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2 text-sm", s.archived && "text-muted-foreground line-through")}>
                      <span className="size-2 rounded-full opacity-60" style={{ background: p.color }} />
                      {s.name}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            {tab === "EXPENSE" && (
              <div className="flex items-center gap-3 pt-3 pl-7">
                <IconCircle icon={Lock} color="#f59e0b" soft className="size-9" />
                <span className="grid min-w-0 flex-1">
                  <span className="font-medium">A categorizar</span>
                  <span className="text-xs text-muted-foreground">Categoria do sistema · não pode ser editada</span>
                </span>
                <Link href="/transacoes?ver=uncategorized&periodo=12m" className={buttonVariants({ variant: "outline", size: "sm" })}>{status.uncategorized} transações</Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Mapeamento Pluggy</CardTitle>
            <p className="text-sm text-muted-foreground">Categoria enviada pela Pluggy → sua subcategoria. Vale quando nenhuma regra nem a IA resolvem.</p>
          </CardHeader>
          <CardContent className="grid max-h-[640px] overflow-y-auto">
            {pluggyNames.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma categoria da Pluggy vista ainda.</p>}
            {pluggyNames.map((name) => (
              <form key={name} action={setPluggyMapping} className="grid gap-1 border-b py-2.5 last:border-0">
                <input type="hidden" name="pluggyCategory" value={name} />
                <span className="font-mono text-xs text-muted-foreground">{name}</span>
                <span className="flex items-center gap-2">
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <SubcategorySelect name="subcategoryId" options={options} defaultValue={String(mapBy.get(name) ?? "")} emptyLabel="Não mapear" autoSubmit size="sm" aria-label={`Mapeamento de ${name}`} />
                </span>
              </form>
            ))}
          </CardContent>
        </Card>
      </div>

      {sp.nova && (
        <RouteDialog closeHref={close} title="Nova categoria" description="Depois você adiciona as subcategorias.">
          <form action={createAndClose} className="grid gap-4">
            <CategoryFields defaultColor="#64748b" defaultIcon={null} currentIcon={<Tag />} fallbackIcon={<Tag />} placeholder="Ex.: Pets" />
            <Field label="Tipo">
              <FormSelect
                name="kind"
                defaultValue={tab === "INCOME" ? "INCOME" : "EXPENSE"}
                options={[
                  { value: "EXPENSE", label: "Despesa" },
                  { value: "INCOME", label: "Receita" },
                ]}
              />
            </Field>
            <Button type="submit" className="h-9">Criar categoria</Button>
          </form>
        </RouteDialog>
      )}

      {sp.mesclar && (
        <RouteDialog closeHref={close} title="Mesclar subcategorias" description="Transações, regras, mapeamentos e limites passam para o destino. A origem é apagada.">
          <form action={mergeAndClose} className="grid gap-4">
            <Field label="Mover tudo de">
              <SubcategorySelect name="sourceId" options={options} required placeholder="Escolha a origem…" />
            </Field>
            <Field label="Para">
              <SubcategorySelect name="targetId" options={options} required placeholder="Escolha o destino…" />
            </Field>
            <Button type="submit" variant="destructive" className="h-9">Mesclar e apagar origem</Button>
          </form>
        </RouteDialog>
      )}

      {editing && (
        <RouteSheet closeHref={close} title="Editar categoria" description={editing.kind === "INCOME" ? "Receita" : "Despesa"}>
          <div className="grid gap-6">
            <form action={updateCategory} className="grid gap-4">
              <input type="hidden" name="id" value={editing.id} />
              <CategoryFields
                key={editing.id}
                defaultName={editing.name}
                defaultColor={editing.color}
                defaultIcon={editing.icon}
                currentIcon={<CategoryIcon name={editing.name} icon={editing.icon} />}
                fallbackIcon={<CategoryIcon name={editing.name} />}
              />
              <Button type="submit" variant="outline" className="justify-self-start">Salvar</Button>
            </form>

            <section className="grid gap-2">
              <h3 className="text-sm font-medium">Subcategorias</h3>
              <ul className="grid rounded-xl border">
                {editing.subs.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 border-b p-2 last:border-0">
                    <form action={updateCategory} className="flex flex-1 items-center gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <input name="name" defaultValue={s.name} required maxLength={200} aria-label="Nome da subcategoria" className={cn(fieldClass, "h-8", s.archived && "text-muted-foreground line-through")} />
                      <Button type="submit" variant="ghost" size="sm">Salvar</Button>
                    </form>
                    <form action={toggleArchived}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button type="submit" variant="ghost" size="sm">{s.archived ? "Reativar" : "Arquivar"}</Button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={createAndClose} className="flex gap-2">
                <input type="hidden" name="parentId" value={editing.id} />
                <input name="name" required maxLength={200} placeholder="Nova subcategoria" className={fieldClass} />
                <Button type="submit" variant="outline" className="h-9">
                  <Plus />
                  Adicionar
                </Button>
              </form>
            </section>

            <form action={toggleArchived} className="border-t pt-4">
              <input type="hidden" name="id" value={editing.id} />
              <Button type="submit" variant={editing.archived ? "outline" : "destructive"}>{editing.archived ? "Reativar categoria" : "Arquivar categoria"}</Button>
              <p className="mt-2 text-xs text-muted-foreground">Arquivar não apaga nada: some dos seletores e fica no histórico.</p>
            </form>
          </div>
        </RouteSheet>
      )}
    </div>
  )
}
