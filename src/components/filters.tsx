import { accountGroups } from "@/components/account-avatar"
import { CategoryFilter } from "@/components/calendar-filters"
import { DateInput } from "@/components/date-input"
import { ArrowDownUp, Calendar, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PRESETS } from "@/lib/domain/dates"
import { dateBR } from "@/lib/format"
import { categoryTree, listAccounts, SORTS, withParams, type Filters as F, type SearchParams } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { Field } from "./bits"
import { FormSelect } from "./form-select"
import { FilterSheet, MenuLinks } from "./filters-client"

/** Formulário GET: os filtros ficam na URL. Datas só valem com período "Personalizado". */
async function FiltersForm({ f, children }: { f: F; children?: React.ReactNode }) {
  const [accs, tree] = await Promise.all([listAccounts(), categoryTree()])
  const kind = f.kind === "INCOME" ? "receita" : f.kind === "EXPENSE" ? "despesa" : ""
  return (
    <form method="get" className="grid gap-4">
      <Field label="Período">
        <FormSelect name="periodo" defaultValue={f.preset} options={Object.entries(PRESETS).map(([value, label]) => ({ value, label }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="De">
          <DateInput name="de" defaultValue={f.preset === "custom" ? f.from : ""} />
        </Field>
        <Field label="Até">
          <DateInput name="ate" defaultValue={f.preset === "custom" ? f.to : ""} />
        </Field>
      </div>
      <Field label="Conta">
        <FormSelect name="conta" defaultValue={String(f.accountId ?? "")} emptyLabel="Todas" groups={accountGroups(accs.filter((a) => !a.archived))} />
      </Field>
      <Field label="Categoria">
        <CategoryFilter name="categorias" tree={tree} selected={[...(f.categoryId ? [f.categoryId] : []), ...(f.categoryIds ?? [])]} />
      </Field>
      {f.q && <input type="hidden" name="q" value={f.q} />}
      <Field label="Tipo">
        <FormSelect
          name="tipo"
          defaultValue={kind}
          emptyLabel="Receitas e despesas"
          options={[
            { value: "despesa", label: "Despesas" },
            { value: "receita", label: "Receitas" },
          ]}
        />
      </Field>
      {children}
      <div className="flex gap-2 pt-2">
        <Button type="submit" className="h-9 flex-1">Aplicar filtros</Button>
        <a href="?" className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted">Limpar</a>
      </div>
    </form>
  )
}

const periodLabel = (f: F) => (f.preset === "custom" ? `${dateBR(f.from)} a ${dateBR(f.to)}` : PRESETS[f.preset as keyof typeof PRESETS] ?? PRESETS.mes)

/** Só o seletor de período (menu de links; o período vive na URL). */
export function PeriodMenu({ f, sp }: { f: F; sp: SearchParams }) {
  return (
    <MenuLinks
      label={
        <>
          <Calendar />
          {periodLabel(f)}
          <ChevronDown className="text-muted-foreground" />
        </>
      }
      items={Object.entries(PRESETS)
        .filter(([v]) => v !== "custom")
        .map(([v, l]) => ({ label: l, href: withParams(sp, { periodo: v, de: undefined, ate: undefined, pagina: undefined }), active: f.preset === v }))}
    />
  )
}

/** Ordem da lista de transações (menu de links; a ordem vive na URL). No celular, só o ícone. */
export function SortMenu({ f, sp }: { f: F; sp: SearchParams }) {
  const sort = f.sort ?? "recentes"
  const custom = sort !== "recentes"
  return (
    <MenuLinks
      label={
        <>
          <ArrowDownUp className={cn(custom && "text-primary")} />
          <span className="max-sm:sr-only">{SORTS[sort]}</span>
          <ChevronDown className="text-muted-foreground max-sm:hidden" />
        </>
      }
      ariaLabel={`Ordenar: ${SORTS[sort]}`}
      items={Object.entries(SORTS).map(([v, l]) => ({ label: l, href: withParams(sp, { ordem: v === "recentes" ? undefined : v, pagina: undefined, tx: undefined }), active: sort === v }))}
    />
  )
}

/** Seletor de período (menu) + botão "Filtros" que abre o formulário completo num painel lateral. */
export function Filters({ f, sp, children }: { f: F; sp: SearchParams; children?: React.ReactNode }) {
  const active = [f.accountId, f.categoryId || f.categoryIds?.length, f.kind, f.q].filter(Boolean).length
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PeriodMenu f={f} sp={sp} />
      <FilterSheet count={active}>
        <FiltersForm f={f}>{children}</FiltersForm>
      </FilterSheet>
    </div>
  )
}
