"use client"

import { useState } from "react"
import { Field, fieldClass } from "@/components/bits"
import { FormSelect, SubcategorySelect } from "@/components/form-select"

type Kind = "" | "EXPENSE" | "INCOME"
type SubOption = Parameters<typeof SubcategorySelect>[0]["options"][number]

type Props = {
  accounts: { id: number; name: string }[]
  options: SubOption[]
  accountId?: number | null
  kind?: string | null
  minAmount?: number | string | null
  maxAmount?: number | string | null
  subcategoryId?: number | null
}

/**
 * Conta, tipo, valores e "Categorizar como" da regra. Tipo e categoria andam juntos: com Despesa só aparecem
 * categorias de despesa (e vice-versa); trocar o tipo limpa a categoria que deixou de servir.
 */
export function RuleFields({ accounts, options, accountId, kind: k0, minAmount, maxAmount, subcategoryId }: Props) {
  const [kind, setKind] = useState<Kind>((k0 ?? "") as Kind)
  const [sub, setSub] = useState<string | null>(subcategoryId ? String(subcategoryId) : null)
  const visible = kind ? options.filter((o) => o.kind === kind) : options

  function changeKind(next: Kind) {
    setKind(next)
    const chosen = options.find((o) => String(o.id) === sub)
    if (next && chosen && chosen.kind !== next) setSub(null)
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Conta">
          <FormSelect name="accountId" defaultValue={String(accountId ?? "")} emptyLabel="Qualquer conta" options={accounts.map((a) => ({ value: String(a.id), label: a.name }))} />
        </Field>
        <Field label="Tipo">
          <FormSelect
            name="kind"
            value={kind}
            onValueChange={(v) => changeKind(v as Kind)}
            emptyLabel="Qualquer"
            options={[
              { value: "EXPENSE", label: "Despesa" },
              { value: "INCOME", label: "Receita" },
            ]}
          />
        </Field>
        <Field label="Valor mínimo (R$)">
          <input type="number" name="minAmount" min={0} step="0.01" defaultValue={minAmount ?? ""} className={fieldClass} />
        </Field>
        <Field label="Valor máximo (R$)">
          <input type="number" name="maxAmount" min={0} step="0.01" defaultValue={maxAmount ?? ""} className={fieldClass} />
        </Field>
      </div>
      <Field label="Categorizar como">
        <SubcategorySelect name="subcategoryId" options={visible} required value={sub} onValueChange={(v) => setSub(v || null)} placeholder="Escolha…" />
      </Field>
    </>
  )
}
