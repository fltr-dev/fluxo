"use client"

import { useState } from "react"
import { AccountAvatar } from "@/components/account-avatar"
import { ColorPicker } from "@/components/color-picker"
import { FormSelect } from "@/components/form-select"
import { accountLook, BANKS, detectBank } from "@/lib/banks"

const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"

type Props = {
  defaultName?: string
  /** null = detectar pelo nome; "none" = sem banco; ou a chave de um banco */
  defaultBank: string | null
  defaultColor: string | null
  /** Nome da instituição conectada (ajuda a detectar o banco) */
  institution?: string | null
  placeholder?: string
}

/** Apelido, banco e cor da conta, com pré-visualização do quadrado (logo + cor) como aparece na sidebar e nas listas. */
export function AccountFields({ defaultName = "", defaultBank, defaultColor, institution, placeholder }: Props) {
  const [name, setName] = useState(defaultName)
  const [bank, setBank] = useState(defaultBank ?? "")
  const [color, setColor] = useState<string | null>(defaultColor)

  const look = accountLook({ name: name || "Conta", bank: bank || null, color, institution })
  const auto = detectBank(institution, name)
  const base = accountLook({ name: name || "Conta", bank: bank || null, color: null, institution })

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3" aria-label="Pré-visualização">
        <AccountAvatar look={look} size={40} />
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-medium">{name.trim() || "Nome da conta"}</span>
          <span className="truncate text-xs text-muted-foreground">{look.bankName ?? "Sem banco"}</span>
        </span>
        <AccountAvatar look={look} size={24} />
      </div>

      <label className="grid gap-1.5 text-sm font-medium">
        Apelido
        <input name="name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} className={fieldClass} />
      </label>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid content-start gap-1.5 text-sm font-medium">
          Banco
          <FormSelect
            name="bank"
            value={bank}
            onValueChange={setBank}
            emptyLabel={auto ? `Detectar automaticamente (${auto.name})` : "Detectar automaticamente"}
            options={[{ value: "none", label: "Nenhum" }, ...BANKS.map((b) => ({ value: b.key, label: b.name, color: b.color }))]}
          />
        </div>
        <div className="grid content-start gap-1.5 text-sm font-medium">
          Cor
          <ColorPicker name="color" value={color} onChange={setColor} fallback={base.color} clearLabel={base.bankName ? `Usar a cor do ${base.bankName}` : "Usar a cor automática"} className="w-full" />
        </div>
      </div>
    </div>
  )
}
