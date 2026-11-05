"use client"

import { Pencil } from "lucide-react"
import { useOptimistic, useRef, useState, useTransition } from "react"
import { useSettings } from "@/components/settings-dialog"
import { actionError } from "@/components/swipe-row"
import { cn } from "@/lib/utils"

type Props = {
  id: number
  value: string
  /** Server Action `(id, nome)`; o novo nome aparece na hora e volta ao antigo se ela falhar. */
  action: (id: number, name: string) => Promise<void>
  /** O que é (ex.: "conta"): vira "Renomear conta X" e "Nome da conta". */
  label: string
  className?: string
  inputClassName?: string
}

/**
 * Nome editável no lugar: clicar no nome abre o campo; Enter ou sair do campo salva, Esc cancela.
 * Fica acima (z-10) de um link "esticado" da linha, então o resto da linha continua abrindo o detalhe.
 * Na demonstração é só texto.
 */
export function InlineName({ id, value, action, label, className, inputClassName }: Props) {
  const { demo } = useSettings()
  const [name, setName] = useOptimistic(value)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Enter/Esc devolvem o foco ao nome (sair clicando fora, não)
  const [refocus, setRefocus] = useState(false)
  const [, start] = useTransition()
  // fechou (Enter, Esc ou blur): o blur que vem depois de fechar não salva de novo
  const closed = useRef(false)

  if (demo) return <span className={cn("block min-w-0 truncate", className)} title={value}>{value}</span>

  const close = (save: string | null, byKey = false) => {
    if (closed.current) return
    closed.current = true
    setEditing(false)
    setRefocus(byKey)
    const next = save?.trim()
    if (!next || next === name) return
    setError(null)
    start(async () => {
      setName(next)
      try {
        await action(id, next)
      } catch (e) {
        setError(actionError(e))
      }
    })
  }

  if (editing)
    return (
      <input
        autoFocus
        defaultValue={name}
        maxLength={200}
        aria-label={`Nome da ${label}`}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => close(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") close(e.currentTarget.value, true)
          if (e.key === "Escape") close(null, true)
        }}
        className={cn("relative z-10 h-8 w-full min-w-0 rounded-md border border-ring bg-background px-2 text-base ring-3 ring-ring/30 outline-none md:text-sm", inputClassName)}
      />
    )

  return (
    <span className="grid min-w-0 justify-items-start">
      <button
        type="button"
        autoFocus={refocus}
        onClick={() => {
          closed.current = false
          setEditing(true)
        }}
        aria-label={`Renomear ${label} ${name}`}
        title={name}
        className={cn("group/name relative z-10 inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40", className)}
      >
        <span className="truncate">{name}</span>
        {/* na cor do texto (também sobre o cartão colorido), apagado como o texto secundário */}
        <Pencil aria-hidden className="size-3.5 shrink-0 opacity-60 md:opacity-0 md:group-hover/name:opacity-60 md:group-focus-visible/name:opacity-60" />
      </button>
      {error && (
        <span role="alert" className="text-xs font-normal text-destructive">
          {error}
        </span>
      )}
    </span>
  )
}
