"use client"

import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

const boxes = (formId: string) => [...document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="ids"]`)]

/**
 * Barra flutuante de ações em lote. Os checkboxes das linhas apontam para este formulário
 * com o atributo `form`, então cada linha pode continuar tendo os próprios formulários.
 */
export function BulkBar({ formId, action, children }: { formId: string; action: (f: FormData) => Promise<void>; children: React.ReactNode }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const update = () => setCount(boxes(formId).filter((b) => b.checked).length)
    document.addEventListener("change", update)
    update()
    return () => document.removeEventListener("change", update)
  }, [formId])
  const clear = () => {
    boxes(formId).forEach((b) => (b.checked = false))
    setCount(0)
  }
  return (
    <form
      id={formId}
      action={async (f) => {
        await action(f)
        clear()
      }}
      hidden={count === 0}
      className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl bg-foreground py-2 pr-2 pl-4 text-background shadow-lg md:bottom-6 md:left-[calc(50%+var(--sidebar-w)/2)]"
      role="toolbar"
      aria-label="Ações em lote"
    >
      <span className="mr-1 text-sm font-medium tabular-nums">{count} selecionada{count === 1 ? "" : "s"}</span>
      {children}
      <Button type="button" variant="ghost" size="icon" onClick={clear} aria-label="Limpar seleção" className="text-background hover:bg-background/15 hover:text-background">
        <X />
      </Button>
    </form>
  )
}

/** Checkbox do cabeçalho: marca/desmarca todas as linhas do formulário. */
export function SelectAll({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Selecionar todas"
      className="size-4 accent-primary"
      onChange={(e) => {
        boxes(formId).forEach((b) => (b.checked = e.currentTarget.checked))
        document.dispatchEvent(new Event("change"))
      }}
    />
  )
}
