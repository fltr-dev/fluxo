"use client"

import { CalendarDays } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { fieldClass } from "@/components/bits"
import { dateBR, isoFromBR, maskDateBR } from "@/lib/format"
import { cn } from "@/lib/utils"

// Campo de data sempre em dd/mm/aaaa. O <input type="date"> do navegador segue o idioma do navegador (em inglês,
// mm/dd/yyyy) e a página não consegue mudar isso; aqui se digita com máscara e o botão abre o calendário nativo.
// O valor que vai para o formulário (input oculto com `name`) e para `onValueChange` continua aaaa-mm-dd.

type Props = {
  name?: string
  /** aaaa-mm-dd */
  value?: string
  defaultValue?: string
  onValueChange?: (iso: string) => void
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  id?: string
  className?: string
  "aria-label"?: string
}

export function DateInput({ name, value, defaultValue, onValueChange, min, max, required, disabled, id, className, "aria-label": ariaLabel }: Props) {
  const [inner, setInner] = useState(defaultValue ?? "")
  const iso = value !== undefined ? value : inner
  const [text, setText] = useState(iso ? dateBR(iso) : "")
  // Valor trocado por fora (ex.: o formulário recalculou a data): o texto acompanha, a não ser que já diga a mesma data
  const [seen, setSeen] = useState(iso)
  if (iso !== seen) {
    setSeen(iso)
    if (isoFromBR(text) !== iso) setText(iso ? dateBR(iso) : "")
  }
  const field = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const d = isoFromBR(text)
    const msg = !text ? "" : !d ? "Use o formato dd/mm/aaaa" : min && d < min ? `A data deve ser a partir de ${dateBR(min)}` : max && d > max ? `A data deve ser até ${dateBR(max)}` : ""
    field.current?.setCustomValidity(msg)
  }, [text, min, max])

  const commit = (next: string) => {
    setInner(next)
    onValueChange?.(next)
  }

  return (
    <span className="relative block">
      <input
        ref={field}
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={text}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => {
          const t = maskDateBR(e.target.value)
          setText(t)
          const d = isoFromBR(t)
          if (d) commit(d)
          else if (!t) commit("")
        }}
        className={cn(fieldClass, "pr-9 tabular-nums", className)}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Abrir calendário"
        onClick={() => picker.current?.showPicker()}
        className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground hover:text-foreground disabled:pointer-events-none"
      >
        <CalendarDays className="size-4" />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={iso}
        min={min}
        max={max}
        onChange={(e) => {
          commit(e.target.value)
          setText(e.target.value ? dateBR(e.target.value) : "")
        }}
        className="pointer-events-none absolute right-0 bottom-0 size-px opacity-0"
      />
      {name && <input type="hidden" name={name} value={iso} />}
    </span>
  )
}
