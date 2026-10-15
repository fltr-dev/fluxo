"use client"

import { Check, ChevronDown, ChevronRight, ListFilter } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { FormSelect } from "@/components/form-select"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type Cat = { id: number; name: string; color: string; subs: { id: number; name: string }[] }

/** Troca um parâmetro da URL (o resto do calendário, como o mês, fica) e volta à primeira "página". */
function useSetParams() {
  const router = useRouter()
  const path = usePathname()
  const current = useSearchParams()
  return (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(current.toString())
    p.delete("dia")
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    const q = p.toString()
    router.push(q ? `${path}?${q}` : path, { scroll: false })
  }
}

export function AccountFilter({ accounts, value }: { accounts: { id: number; name: string }[]; value?: number }) {
  const set = useSetParams()
  return (
    <FormSelect
      aria-label="Conta"
      value={String(value ?? "")}
      onValueChange={(v) => set({ conta: v || undefined })}
      emptyLabel="Todas as contas"
      options={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
      className="w-52"
    />
  )
}

/**
 * Filtro de várias categorias de uma vez. Marcar a categoria inclui todas as subcategorias; também dá para marcar
 * só algumas. Quando todas as subcategorias estão marcadas, vale a categoria inteira.
 */
export function CategoryFilter({ tree, selected }: { tree: Cat[]; selected: number[] }) {
  const set = useSetParams()
  const [open, setOpen] = useState(false)
  const [ids, setIds] = useState<Set<number>>(new Set(selected))
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const state = (c: Cat): "all" | "some" | "none" => {
    if (ids.has(c.id)) return "all"
    return c.subs.some((s) => ids.has(s.id)) ? "some" : "none"
  }
  const toggleParent = (c: Cat) => {
    const next = new Set(ids)
    c.subs.forEach((s) => next.delete(s.id))
    if (state(c) === "all") next.delete(c.id)
    else next.add(c.id)
    setIds(next)
  }
  const toggleSub = (c: Cat, subId: number) => {
    const next = new Set(ids)
    if (next.has(c.id)) {
      // categoria inteira marcada: desmarcar uma sub = marcar todas as outras
      next.delete(c.id)
      c.subs.filter((s) => s.id !== subId).forEach((s) => next.add(s.id))
    } else {
      if (next.has(subId)) next.delete(subId)
      else next.add(subId)
      if (c.subs.length && c.subs.every((s) => next.has(s.id))) {
        c.subs.forEach((s) => next.delete(s.id))
        next.add(c.id)
      }
    }
    setIds(next)
  }
  const apply = () => {
    set({ categorias: ids.size ? [...ids].join(",") : undefined })
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setIds(new Set(selected))
      }}
    >
      <PopoverTrigger render={<Button variant="outline" />}>
        <ListFilter />
        {selected.length ? `Categorias (${selected.length})` : "Todas as categorias"}
        <ChevronDown className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <ul className="max-h-80 overflow-y-auto p-1.5" aria-label="Categorias">
          {tree.map((c) => {
            const st = state(c)
            const open = expanded.has(c.id) || st === "some"
            return (
              <li key={c.id}>
                <div className="flex items-center gap-1 rounded-md hover:bg-muted/60">
                  <button
                    type="button"
                    aria-label={open ? `Recolher ${c.name}` : `Expandir ${c.name}`}
                    onClick={() => setExpanded((e) => new Set(e.has(c.id) ? [...e].filter((x) => x !== c.id) : [...e, c.id]))}
                    className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
                  </button>
                  <button type="button" role="checkbox" aria-checked={st === "all" ? true : st === "some" ? "mixed" : false} onClick={() => toggleParent(c)} className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md pr-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Box state={st} color={c.color} />
                    <span className="truncate font-medium">{c.name}</span>
                  </button>
                </div>
                {open && (
                  <ul className="ml-8 grid gap-0.5 pb-1">
                    {c.subs.map((s) => {
                      const on = ids.has(c.id) || ids.has(s.id)
                      return (
                        <li key={s.id}>
                          <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleSub(c, s.id)} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[0.8125rem] outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring">
                            <Box state={on ? "all" : "none"} color={c.color} />
                            <span className="truncate">{s.name}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t p-2">
          <Button variant="ghost" size="sm" onClick={() => setIds(new Set())} disabled={ids.size === 0}>Limpar</Button>
          <Button size="sm" onClick={apply}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Box({ state, color }: { state: "all" | "some" | "none"; color: string }) {
  return (
    <span className="grid size-4 shrink-0 place-items-center rounded-[5px] border" style={state === "none" ? undefined : { background: color, borderColor: color }}>
      {state === "all" && <Check className="size-3 text-white" strokeWidth={3} />}
      {state === "some" && <span className="h-0.5 w-2 rounded bg-white" />}
    </span>
  )
}
