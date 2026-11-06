"use client"

import { Combobox } from "@base-ui/react/combobox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useRef, useState } from "react"
import { FormBusy } from "@/components/ui/pending"
import {
  matches,
  Select,
  SelectContent,
  SelectEmpty,
  SelectGroup,
  SelectItem,
  SelectLabel,
  selectItemClass,
  selectLabelClass,
  selectPopupClass,
  SelectSearch,
  selectSearchInputClass,
  SelectTrigger,
  selectTriggerClass,
  SelectValue,
  useAutoSubmit,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export { SubcategorySelect } from "@/components/category-select"

// Substitui o <select> do navegador (lista feita pelo sistema operacional, fora do tema) por um seletor do
// próprio design. Continua funcionando em <form action={serverAction}>: o valor vai num input oculto com `name`.
// Listas longas (mais de SEARCH_FROM opções) ganham um campo de busca no topo do popup.

export type Option = { value: string; label: string; /** texto mostrado no campo fechado (padrão: label) */ text?: string; color?: string; disabled?: boolean }
export type OptionGroup = { label: string; options: Option[] }

export type FormSelectProps = {
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

/** A partir de quantas opções a lista ganha busca */
const SEARCH_FROM = 9

const Dot = ({ color }: { color?: string }) => (color ? <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden /> : null)

export function FormSelect({ name, defaultValue, value, onValueChange, options = [], groups = [], emptyLabel, placeholder, autoSubmit, required, disabled, size = "default", className, id, "aria-label": ariaLabel }: FormSelectProps) {
  const [inner, setInner] = useState<string | null>(defaultValue ?? (emptyLabel != null ? "" : null))
  const [query, setQuery] = useState("")
  const current = value !== undefined ? value : inner
  const trigger = useRef<HTMLButtonElement>(null)
  useAutoSubmit(current, autoSubmit, trigger)

  const first: Option[] = [...(emptyLabel != null ? [{ value: "", label: emptyLabel }] : []), ...options]
  const all = [...first, ...groups.flatMap((g) => g.options)]
  const pick = (v: string | null) => {
    const next = v ?? ""
    setInner(next)
    onValueChange?.(next)
  }

  if (all.length < SEARCH_FROM) {
    const items = all.map((o) => ({
      value: o.value,
      label: (
        <span className="flex min-w-0 items-center gap-2">
          <Dot color={o.color} />
          <span className="truncate" title={o.text ?? o.label}>{o.text ?? o.label}</span>
        </span>
      ),
    }))
    const item = (o: Option) => (
      <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
        <Dot color={o.color} />
        <span className="truncate" title={o.label}>{o.label}</span>
      </SelectItem>
    )
    return (
      <Select name={name} items={items} value={current} required={required} disabled={disabled} onValueChange={(v) => pick(v as string | null)}>
        <SelectTrigger ref={trigger} id={id} size={size} aria-label={ariaLabel} className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="w-max max-w-[min(26rem,var(--available-width))]">
          {first.map(item)}
          {groups.map((g) => (
            <SelectGroup key={g.label}>
              <SelectLabel>{g.label}</SelectLabel>
              {g.options.map(item)}
            </SelectGroup>
          ))}
        </SelectContent>
        {autoSubmit && <FormBusy />}
      </Select>
    )
  }

  // Lista longa: Combobox do Base UI com o campo de busca dentro do popup (o gatilho continua sendo o campo do formulário)
  const chosen = all.find((o) => o.value === current)
  const sections = [{ label: "", options: first }, ...groups].map((g) => ({ ...g, options: g.options.filter((o) => matches(o.label, query)) })).filter((g) => g.options.length)
  const item = (o: Option) => (
    <Combobox.Item key={o.value} value={o.value} disabled={o.disabled} className={selectItemClass}>
      <Dot color={o.color} />
      <span className="truncate" title={o.label}>{o.label}</span>
      <Combobox.ItemIndicator className="pointer-events-none absolute right-2 grid size-4 place-items-center">
        <CheckIcon className="size-4" />
      </Combobox.ItemIndicator>
    </Combobox.Item>
  )

  return (
    <Combobox.Root name={name} value={current} onValueChange={pick} inputValue={query} onInputValueChange={setQuery} required={required} disabled={disabled}>
      <Combobox.Trigger ref={trigger} id={id} data-size={size} aria-label={ariaLabel} className={cn(selectTriggerClass, className)}>
        <span className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", !chosen && "text-muted-foreground")}>
          <Dot color={chosen?.color} />
          <span className="truncate">{chosen ? (chosen.text ?? chosen.label) : placeholder}</span>
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="isolate z-[60] outline-none">
          <Combobox.Popup className={cn(selectPopupClass, "max-h-[min(24rem,var(--available-height))] w-max max-w-[min(26rem,var(--available-width))]")} aria-label={ariaLabel ?? placeholder}>
            <SelectSearch>
              <Combobox.Input placeholder="Buscar…" aria-label="Buscar" className={selectSearchInputClass} />
            </SelectSearch>
            {sections.length === 0 ? (
              <SelectEmpty />
            ) : (
              <Combobox.List className="min-h-0 flex-1 scroll-py-1 overflow-y-auto overscroll-contain p-1">
                {sections.map((g) =>
                  g.label ? (
                    <Combobox.Group key={g.label}>
                      <Combobox.GroupLabel className={selectLabelClass}>{g.label}</Combobox.GroupLabel>
                      {g.options.map(item)}
                    </Combobox.Group>
                  ) : (
                    g.options.map(item)
                  ),
                )}
              </Combobox.List>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
      {autoSubmit && <FormBusy />}
    </Combobox.Root>
  )
}
