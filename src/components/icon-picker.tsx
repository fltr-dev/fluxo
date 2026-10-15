"use client"

import type { LucideIcon } from "lucide-react"
import { Search, X } from "lucide-react"
import { useDeferredValue, useMemo, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ICON_CATALOG, spaced } from "@/lib/icon-catalog"
import { cn } from "@/lib/utils"

/** Todos os ícones do Lucide, num pedaço de JS separado carregado só quando o seletor abre. */
export type IconMap = Record<string, LucideIcon>
let cache: Promise<IconMap> | undefined
export const loadIcons = () => (cache ??= import("lucide-react").then((m) => m.icons as IconMap))

const LIMIT = 120

type Props = {
  value: string | null
  onChange: (name: string | null) => void
  /** Ícone atual já renderizado pelo servidor, mostrado enquanto a lista completa não carregou */
  current: React.ReactNode
  icons: IconMap | null
  onOpen: () => void
  color?: string
}

export function IconPicker({ value, onChange, current, icons, onOpen, color }: Props) {
  const [query, setQuery] = useState("")
  const q = useDeferredValue(query.trim().toLowerCase())
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    if (!icons) return { names: [] as string[], total: 0 }
    if (!q) {
      const names = ICON_CATALOG.map(([n]) => n).filter((n) => icons[n])
      return { names, total: names.length }
    }
    const words = q.split(/\s+/)
    const keywords = new Map(ICON_CATALOG)
    const hit = (n: string) => {
      const hay = `${spaced(n)} ${keywords.get(n) ?? ""}`
      return words.every((w) => hay.includes(w))
    }
    // sugeridos primeiro (têm palavras em português), depois o resto do Lucide
    const catalog = ICON_CATALOG.map(([n]) => n).filter((n) => icons[n] && hit(n))
    const seen = new Set(catalog)
    const rest = Object.keys(icons).filter((n) => !seen.has(n) && hit(n))
    const names = [...catalog, ...rest]
    return { names: names.slice(0, LIMIT), total: names.length }
  }, [icons, q])

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) onOpen()
        else setQuery("")
      }}
    >
      <PopoverTrigger
        aria-label="Escolher ícone"
        className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-sm shadow-xs transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 data-popup-open:border-ring dark:bg-input/30"
      >
        <span className="grid size-5 place-items-center [&_svg]:size-[18px]" style={{ color }}>{current}</span>
        <span className="truncate">{value ?? "Padrão"}</span>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] max-w-[calc(100vw-2rem)] gap-3 p-3" align="start">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar: carro, mercado, car, heart…"
            aria-label="Buscar ícone"
            className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
          />
        </div>
        <div className="mt-3 max-h-64 overflow-y-auto pr-1">
          {!icons ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando ícones…</p>
          ) : results.names.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum ícone encontrado.</p>
          ) : (
            <>
              {!q && <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sugeridos</p>}
              <div className="grid grid-cols-8 gap-1" role="listbox" aria-label="Ícones">
                {results.names.map((n) => {
                  const Icon = icons[n]
                  return (
                    <button
                      key={n}
                      type="button"
                      role="option"
                      aria-selected={value === n}
                      aria-label={n}
                      title={n}
                      onClick={() => {
                        onChange(n)
                        setOpen(false)
                      }}
                      className={cn(
                        "grid size-8 place-items-center rounded-md text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                        value === n && "bg-primary/10 text-primary ring-1 ring-primary",
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </button>
                  )
                })}
              </div>
              {results.total > results.names.length && <p className="mt-2 text-center text-xs text-muted-foreground">Mostrando {results.names.length} de {results.total}. Refine a busca.</p>}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null)
            setOpen(false)
          }}
          className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <X className="size-3.5" />
          Usar o ícone padrão
        </button>
      </PopoverContent>
    </Popover>
  )
}
