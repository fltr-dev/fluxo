"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cn } from "cn"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, SearchIcon } from "lucide-react"

// Peças visuais do seletor (padrão shadcn/base). As mesmas classes servem ao Select, ao Combobox (lista com busca)
// e ao seletor de categoria, para os três terem a mesma cara.

const EASE = "duration-150 ease-[cubic-bezier(.2,.7,.2,1)]"

/** Campo fechado: 40px e 16px no celular (sem zoom do iOS), 36px e 14px a partir de `md`. Tamanho via `data-size`. */
export const selectTriggerClass = cn(
  "flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-base whitespace-nowrap shadow-xs transition-colors outline-none select-none md:text-sm",
  EASE,
  "hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-popup-open:border-ring",
  "data-[size=default]:h-10 data-[size=sm]:h-9 md:data-[size=default]:h-9 md:data-[size=sm]:h-8",
  "dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
)

/** Popup: anel de 1px + sombra de popover/menu, abre e fecha com fade + zoom (150ms, curva do design). */
export const selectPopupClass = cn(
  "relative flex max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-[0_8px_24px_-8px_rgb(0_0_0/.18)] ring-1 ring-foreground/10 outline-none",
  EASE,
  "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
)

/** Linha da lista: 44px no celular (alvo de toque), compacta no desktop; destaque em `accent`. */
export const selectItemClass =
  "relative flex w-full cursor-pointer items-center gap-2 rounded-md py-2.5 pr-8 pl-2 text-base outline-hidden select-none md:py-1.5 md:text-sm data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground"

export const selectLabelClass = "px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground"

/** Check do item escolhido, à direita da linha. */
export const SelectCheck = () => <CheckIcon className="pointer-events-none absolute right-2 size-4" aria-hidden />

/** Linha de busca no topo do popup: ícone + campo sem borda, separada da lista por uma linha. */
export function SelectSearch({ children }: { children: React.ReactElement }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-3">
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {children}
    </div>
  )
}
export const selectSearchInputClass = "h-11 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:h-9 md:text-sm"

export const SelectEmpty = () => (
  <div role="status" className="px-2 py-6 text-center text-sm text-muted-foreground">
    Nada encontrado
  </div>
)

/** Compara sem caixa nem acento (pt-BR): "alimentacao" acha "Alimentação". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR")
export const matches = (text: string, query: string) => fold(text).includes(fold(query.trim()))

/** Envia o formulário do campo depois que o valor novo foi gravado (edição rápida). */
export function useAutoSubmit(value: unknown, enabled: boolean | undefined, ref: React.RefObject<HTMLElement | null>) {
  // Só depois do commit o input oculto já tem o valor novo; por isso o envio sai de um efeito. Compara com o valor
  // anterior (e não com "primeira execução"): o StrictMode roda o efeito duas vezes ao montar e não pode enviar nada.
  const previous = React.useRef(value)
  React.useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    if (enabled) ref.current?.closest("form")?.requestSubmit()
  }, [value, enabled, ref])
}

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn("scroll-my-1", className)} {...props} />
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" className={cn("flex flex-1 items-center gap-2 truncate text-left data-placeholder:text-muted-foreground", className)} {...props} />
}

function SelectTrigger({ className, size = "default", children, ...props }: SelectPrimitive.Trigger.Props & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger data-slot="select-trigger" data-size={size} className={cn(selectTriggerClass, className)} {...props}>
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 text-muted-foreground" />} />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({ className, children, sideOffset = 4, align = "start", ...props }: SelectPrimitive.Popup.Props & Pick<SelectPrimitive.Positioner.Props, "sideOffset" | "align">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={sideOffset} align={align} alignItemWithTrigger={false} className="isolate z-[60] outline-none">
        <SelectPrimitive.Popup data-slot="select-content" className={cn(selectPopupClass, className)} {...props}>
          <SelectPrimitive.ScrollUpArrow className="absolute top-0 z-10 flex h-5 w-full cursor-default items-center justify-center bg-popover text-muted-foreground">
            <ChevronUpIcon className="size-4" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List className="max-h-(--available-height) scroll-py-1 overflow-y-auto overscroll-contain p-1">{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="absolute bottom-0 z-10 flex h-5 w-full cursor-default items-center justify-center bg-popover text-muted-foreground">
            <ChevronDownIcon className="size-4" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return <SelectPrimitive.GroupLabel data-slot="select-label" className={cn(selectLabelClass, className)} {...props} />
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item data-slot="select-item" className={cn(selectItemClass, className)} {...props}>
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator render={<span className="pointer-events-none absolute right-2 grid size-4 place-items-center" />}>
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue }
