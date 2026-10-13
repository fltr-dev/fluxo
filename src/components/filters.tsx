import { Calendar, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PRESETS } from "@/lib/domain/dates"
import { dateBR } from "@/lib/format"
import { categoryTree, listAccounts, withParams, type Filters as F, type SearchParams } from "@/lib/queries"
import { Field, fieldClass } from "./bits"
import { FilterSheet, MenuLinks } from "./filters-client"

/** Formulário GET: os filtros ficam na URL. Datas só valem com período "Personalizado". */
async function FiltersForm({ f, children }: { f: F; children?: React.ReactNode }) {
  const [accs, tree] = await Promise.all([listAccounts(), categoryTree()])
  const kind = f.kind === "INCOME" ? "receita" : f.kind === "EXPENSE" ? "despesa" : ""
  return (
    <form method="get" className="grid gap-4">
      <Field label="Período">
        <select name="periodo" defaultValue={f.preset} className={fieldClass}>
          {Object.entries(PRESETS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="De">
          <input type="date" name="de" defaultValue={f.preset === "custom" ? f.from : ""} className={fieldClass} />
        </Field>
        <Field label="Até">
          <input type="date" name="ate" defaultValue={f.preset === "custom" ? f.to : ""} className={fieldClass} />
        </Field>
      </div>
      <Field label="Conta">
        <select name="conta" defaultValue={f.accountId ?? ""} className={fieldClass}>
          <option value="">Todas</option>
          {accs.filter((a) => !a.archived).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Categoria">
        <select name="categoria" defaultValue={f.categoryId ?? ""} className={fieldClass}>
          <option value="">Todas</option>
          {tree.map((p) => (
            <optgroup key={p.id} label={p.name}>
              <option value={p.id}>{p.name} (todas)</option>
              {p.subs.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="Tipo">
        <select name="tipo" defaultValue={kind} className={fieldClass}>
          <option value="">Receitas e despesas</option>
          <option value="despesa">Despesas</option>
          <option value="receita">Receitas</option>
        </select>
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

/** Seletor de período (menu) + botão "Filtros" que abre o formulário completo num painel lateral. */
export function Filters({ f, sp, children }: { f: F; sp: SearchParams; children?: React.ReactNode }) {
  const active = [f.accountId, f.categoryId, f.kind, f.q].filter(Boolean).length
  return (
    <div className="flex flex-wrap items-center gap-2">
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
      <FilterSheet count={active}>
        <FiltersForm f={f}>{children}</FiltersForm>
      </FilterSheet>
    </div>
  )
}
