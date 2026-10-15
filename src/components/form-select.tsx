"use client"

import { useEffect, useRef, useState } from "react"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

// Substitui o <select> do navegador (lista feita pelo sistema operacional, fora do tema) por um seletor do
// próprio design. Continua funcionando em <form action={serverAction}>: o valor vai num input oculto com `name`.

export type Option = { value: string; label: string; /** texto mostrado no campo fechado (padrão: label) */ text?: string; color?: string; disabled?: boolean }
export type OptionGroup = { label: string; options: Option[] }

type Props = {
  name?: string
  defaultValue?: string | null
  value?: string | null
  onValueChange?: (value: string) => void
  options?: Option[]
  groups?: OptionGroup[]
  /** Opção de valor "" no topo da lista ("Todas", "A categorizar", "Não mapear"…) */
  emptyLabel?: string
  /** Mostrado enquanto nada está escolhido (sem `emptyLabel`) */
  placeholder?: string
  /** Envia o formulário ao escolher (edição rápida na tabela) */
  autoSubmit?: boolean
  required?: boolean
  disabled?: boolean
  size?: "sm" | "default"
  className?: string
  id?: string
  "aria-label"?: string
}

const Dot = ({ color }: { color?: string }) => (color ? <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden /> : null)

export function FormSelect({ name, defaultValue, value, onValueChange, options = [], groups = [], emptyLabel, placeholder, autoSubmit, required, disabled, size, className, id, "aria-label": ariaLabel }: Props) {
  const [inner, setInner] = useState<string | null>(defaultValue ?? (emptyLabel != null ? "" : null))
  const current = value !== undefined ? value : inner
  const trigger = useRef<HTMLButtonElement>(null)

  const all: Option[] = [...(emptyLabel != null ? [{ value: "", label: emptyLabel }] : []), ...options, ...groups.flatMap((g) => g.options)]
  const items = all.map((o) => ({
    value: o.value,
    label: (
      <span className="flex min-w-0 items-center gap-2">
        <Dot color={o.color} />
        <span className="truncate">{o.text ?? o.label}</span>
      </span>
    ),
  }))

  // Só depois do commit o input oculto já tem o valor novo; por isso o envio sai de um efeito. Compara com o valor
  // anterior (e não com "primeira execução"): o StrictMode roda o efeito duas vezes ao montar e não pode enviar nada.
  const previous = useRef(current)
  useEffect(() => {
    if (previous.current === current) return
    previous.current = current
    if (autoSubmit) trigger.current?.closest("form")?.requestSubmit()
  }, [current, autoSubmit])

  const item = (o: Option) => (
    <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
      <Dot color={o.color} />
      <span className="truncate">{o.label}</span>
    </SelectItem>
  )

  return (
    <Select
      name={name}
      items={items}
      value={current}
      required={required}
      disabled={disabled}
      onValueChange={(v) => {
        const next = (v as string | null) ?? ""
        setInner(next)
        onValueChange?.(next)
      }}
    >
      <SelectTrigger ref={trigger} id={id} size={size} aria-label={ariaLabel} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="w-max max-w-[min(26rem,var(--available-width))]">
        {emptyLabel != null && item({ value: "", label: emptyLabel })}
        {options.map(item)}
        {groups.map((g) => (
          <SelectGroup key={g.label}>
            <SelectLabel>{g.label}</SelectLabel>
            {g.options.map(item)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

type SubOption = { id: number; name: string; kind: string; parentName: string; color?: string | null }

/** Seletor de subcategoria agrupado "Despesa · Categoria" (substitui <SubcategoryOptions/> dentro de <select>). */
export function SubcategorySelect({ options, ...props }: { options: SubOption[] } & Omit<Props, "options" | "groups">) {
  const groups = new Map<string, Option[]>()
  for (const o of options) {
    const key = `${o.kind === "INCOME" ? "Receita" : "Despesa"} · ${o.parentName}`
    groups.set(key, [...(groups.get(key) ?? []), { value: String(o.id), label: o.name, text: `${o.parentName} › ${o.name}`, color: o.color ?? undefined }])
  }
  return <FormSelect {...props} groups={[...groups].map(([label, options]) => ({ label, options }))} className={cn(props.className)} />
}
