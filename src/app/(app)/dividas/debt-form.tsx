"use client"

import { Plus, X } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Field, fieldClass, FormActions } from "@/components/bits"
import { FormSelect } from "@/components/form-select"
import { Button, buttonVariants } from "@/components/ui/button"
import { splitAmount } from "@/lib/domain/debts"
import { brl } from "@/lib/format"
import { cn } from "@/lib/utils"
import { RELATIONS } from "./shared"

// Formulário de nova dívida / edição (abre em modal pela URL). Itens e regra de vencimento são dinâmicos, então
// tudo vai num JSON em `payload`; quem valida de verdade é debtInput na Server Action.

export type DebtFormValue = {
  id?: number
  creditor: string
  relation: string
  description: string
  items: { description: string; quantity: number; unitAmount: number }[]
  mode: "LUMP" | "INSTALLMENTS" | "FLEX"
  installments: number
  kind: "FIXED_DAY" | "AFTER_SALARY" | "DATE" | "NONE"
  day: number
  offsetDays: number
  date: string
  remindDaysBefore: number | null
}

export const EMPTY_DEBT: DebtFormValue = {
  creditor: "",
  relation: "",
  description: "",
  items: [{ description: "", quantity: 1, unitAmount: 0 }],
  mode: "INSTALLMENTS",
  installments: 1,
  kind: "FIXED_DAY",
  day: 5,
  offsetDays: 1,
  date: "",
  remindDaysBefore: 1,
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-lg bg-muted p-[3px]" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={cn("h-8 flex-1 rounded-md px-1 text-[13px] font-semibold text-muted-foreground transition-colors sm:text-sm", value === o.value && "bg-card text-foreground shadow-sm")}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const REMIND = [
  { value: 0, label: "No dia" },
  { value: 1, label: "1 dia antes" },
  { value: 3, label: "3 dias antes" },
  { value: -1, label: "Sem aviso" },
]
const num = (v: string) => Number(v.replace(",", ".")) || 0

export function DebtForm({ action, initial, closeHref, editing, start }: { action: (form: FormData) => Promise<void>; initial: DebtFormValue; closeHref: string; editing?: boolean; start?: React.ReactNode }) {
  const [v, setV] = useState(initial)
  const set = <K extends keyof DebtFormValue>(k: K, val: DebtFormValue[K]) => setV((s) => ({ ...s, [k]: val }))
  const total = Math.round(v.items.reduce((t, i) => t + i.quantity * Math.round(i.unitAmount * 100), 0)) / 100
  const n = v.mode === "LUMP" ? 1 : v.installments
  const part = n > 0 && total > 0 ? splitAmount(total, n)[0] : 0
  const setItem = (i: number, patch: Partial<DebtFormValue["items"][number]>) => set("items", v.items.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  const payload = JSON.stringify({
    id: v.id,
    creditor: v.creditor,
    relation: v.relation || null,
    description: v.description || null,
    items: v.items,
    mode: v.mode,
    installments: v.mode === "INSTALLMENTS" ? v.installments : 1,
    schedule: { kind: v.mode === "FLEX" ? "NONE" : v.kind, day: v.kind === "FIXED_DAY" ? v.day : null, offsetDays: v.offsetDays, date: v.kind === "DATE" ? v.date : null },
    remindDaysBefore: v.mode === "FLEX" || v.kind === "NONE" || v.remindDaysBefore === -1 ? null : v.remindDaysBefore,
  })

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="payload" value={payload} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Para quem você deve">
          <input value={v.creditor} onChange={(e) => set("creditor", e.target.value)} required maxLength={120} placeholder="Ex.: João, Dr. Paulo" className={fieldClass} />
        </Field>
        <Field label="Relação">
          <FormSelect value={v.relation} onValueChange={(x) => set("relation", x)} emptyLabel="Sem relação" options={RELATIONS.map((r) => ({ value: r, label: r }))} aria-label="Relação" />
        </Field>
      </div>
      <Field label="Descrição" hint="Opcional. Ex.: passagens de Salvador, sessões de outubro.">
        <input value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={500} className={fieldClass} />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Itens da dívida</legend>
        <ul className="grid gap-2">
          {v.items.map((it, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_4rem_7rem_2rem] items-center gap-2">
              <input aria-label={`Item ${i + 1}`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} required maxLength={200} placeholder="Descrição" className={fieldClass} />
              <input aria-label="Quantidade" type="number" inputMode="numeric" min="1" step="1" value={it.quantity} onChange={(e) => setItem(i, { quantity: Math.max(1, Math.round(num(e.target.value))) })} className={cn(fieldClass, "px-2 text-center")} />
              <span className={cn(fieldClass, "flex items-center gap-1 px-2 text-base md:text-sm")}>
                <span className="text-muted-foreground">R$</span>
                <input aria-label="Valor unitário" type="number" inputMode="decimal" min="0.01" step="0.01" required value={it.unitAmount || ""} onChange={(e) => setItem(i, { unitAmount: num(e.target.value) })} className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none" placeholder="0,00" />
              </span>
              <button type="button" aria-label={`Remover item ${i + 1}`} disabled={v.items.length === 1} onClick={() => set("items", v.items.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => set("items", [...v.items, { description: "", quantity: 1, unitAmount: 0 }])}>
            <Plus /> Adicionar item
          </Button>
          <span className="text-sm text-muted-foreground">
            Total <b className="ml-1 text-base text-foreground tabular-nums sensitive">{brl(total)}</b>
          </span>
        </div>
      </fieldset>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Como vai pagar</span>
        <Segmented
          label="Como vai pagar"
          value={v.mode}
          onChange={(m) => set("mode", m)}
          options={[
            { value: "LUMP", label: "De uma vez" },
            { value: "INSTALLMENTS", label: "Parcelado" },
            { value: "FLEX", label: "Quando der" },
          ]}
        />
        {v.mode === "INSTALLMENTS" && (
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              {editing ? "Parcelas restantes" : "Número de parcelas"}
              <input type="number" min="1" max="120" value={v.installments} onChange={(e) => set("installments", Math.min(120, Math.max(1, Math.round(num(e.target.value)))))} className={cn(fieldClass, "w-20 text-center")} />
            </label>
            {part > 0 && <span className="text-muted-foreground">de ~<span className="sensitive">{brl(part)}</span></span>}
          </div>
        )}
        {v.mode === "FLEX" && <p className="text-xs text-muted-foreground">Sem data nem parcelas: você registra cada pagamento quando fizer.</p>}
      </div>

      {v.mode !== "FLEX" && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">Quando pagar</span>
          <Segmented
            label="Quando pagar"
            value={v.kind}
            onChange={(k) => set("kind", k)}
            options={[
              { value: "FIXED_DAY", label: "Dia fixo" },
              { value: "AFTER_SALARY", label: "Após o salário" },
              { value: "DATE", label: "Data" },
              { value: "NONE", label: "Sem data" },
            ]}
          />
          {v.kind === "FIXED_DAY" && (
            <label className="flex items-center gap-2 text-sm">
              Todo dia
              <input type="number" min="1" max="31" required value={v.day} onChange={(e) => set("day", Math.min(31, Math.max(1, Math.round(num(e.target.value)))))} className={cn(fieldClass, "w-20 text-center")} />
              <span className="text-muted-foreground">do mês</span>
            </label>
          )}
          {v.kind === "AFTER_SALARY" && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input type="number" min="0" max="30" value={v.offsetDays} onChange={(e) => set("offsetDays", Math.min(30, Math.max(0, Math.round(num(e.target.value)))))} className={cn(fieldClass, "w-20 text-center")} />
              dia(s) depois que o salário cair
              <span className="w-full text-xs text-muted-foreground">Usa a entrada na categoria Salário; antes de cair, estima pelo dia dos últimos meses.</span>
            </label>
          )}
          {v.kind === "DATE" && (
            <label className="flex items-center gap-2 text-sm">
              Vence em
              <input type="date" required value={v.date} onChange={(e) => set("date", e.target.value)} className={cn(fieldClass, "w-44")} />
              {v.mode === "INSTALLMENTS" && v.installments > 1 && <span className="text-muted-foreground">e nos meses seguintes</span>}
            </label>
          )}
          {v.kind !== "NONE" && (
            <div className="mt-1 grid gap-1.5">
              <span className="text-sm font-medium">Lembrete</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lembrete">
                {REMIND.map((r) => (
                  <button key={r.value} type="button" aria-pressed={(v.remindDaysBefore ?? -1) === r.value} onClick={() => set("remindDaysBefore", r.value)} className={cn("h-8 rounded-full border px-3 text-sm font-medium text-muted-foreground", (v.remindDaysBefore ?? -1) === r.value && "border-primary bg-primary/10 text-primary")}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <FormActions start={start}>
        <Link href={closeHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancelar
        </Link>
        <Button type="submit" size="lg" disabled={total <= 0 || !v.creditor.trim()}>
          {editing ? "Salvar alterações" : "Salvar dívida"}
        </Button>
      </FormActions>
    </form>
  )
}
