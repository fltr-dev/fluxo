"use client"

import { Popover } from "@base-ui/react/popover"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { DynamicIcon, iconNames } from "lucide-react/dynamic"
import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import type { FormSelectProps } from "@/components/form-select"
import { useIsMobile } from "@/components/route-overlay"
import { FormBusy } from "@/components/ui/pending"
import {
  matches,
  SelectCheck,
  SelectEmpty,
  selectItemClass,
  selectLabelClass,
  selectPopupClass,
  SelectSearch,
  selectSearchInputClass,
  selectTriggerClass,
  useAutoSubmit,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// Seletor de subcategoria em dois níveis: a lista mostra as categorias (ícone, nome, chevron) e a categoria em foco
// abre as subcategorias num painel à direita (desktop) ou logo abaixo dela, em sanfona (celular, < 768px). A busca do
// topo procura nos dois níveis e mostra uma lista plana "Categoria › Subcategoria". Teclado no padrão de árvore:
// ↑↓ andam, → entra nas subcategorias, ← volta à categoria, Enter escolhe, Esc fecha.

/** O que chega de `subcategoryOptions()`; `parentId` e `icon` (ícone efetivo da categoria-pai) são opcionais. */
type SubOption = { id: number; name: string; kind: string; parentName: string; parentId?: number; color?: string | null; icon?: string | null }
type Cat = { key: string; name: string; kind: string; color: string; icon?: string | null; subs: SubOption[] }

const EMPTY = "empty"
const ck = (c: Cat) => `c:${c.key}`
const sk = (s: SubOption) => `s:${s.id}`
const KIND_LABEL = (kind: string) => (kind === "INCOME" ? "Receita" : "Despesa")
/** Hover numa categoria só troca o painel depois de uma pausa: atravessar a lista na diagonal até o painel não o troca. */
const HOVER_DELAY = 90

// O ícone vem do servidor pelo nome em PascalCase ("ShoppingBag"); o DynamicIcon carrega só os ícones usados
const KEBAB = new Map(iconNames.map((n) => [n.replaceAll("-", ""), n]))

function CatCircle({ c, className }: { c: Cat; className?: string }) {
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", className)} style={{ background: `${c.color}1f`, color: c.color }} aria-hidden>
      <DynamicIcon name={KEBAB.get(c.icon?.toLowerCase() ?? "") ?? "tag"} className="size-3.5" />
    </span>
  )
}

/** Mantém a linha ativa visível dentro da coluna rolável (sem rolar a página). */
function reveal(el: HTMLElement | null) {
  const box = el?.closest<HTMLElement>("[data-scroll]")
  if (!el || !box) return
  if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 4
  else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 4
}

export function SubcategorySelect({
  options,
  name,
  defaultValue,
  value,
  onValueChange,
  emptyLabel,
  placeholder,
  autoSubmit,
  required,
  disabled,
  size = "default",
  className,
  id,
  "aria-label": ariaLabel,
}: { options: SubOption[] } & Omit<FormSelectProps, "options" | "groups">) {
  const [inner, setInner] = useState<string | null>(defaultValue ?? (emptyLabel != null ? "" : null))
  const current = value !== undefined ? value : inner
  const trigger = useRef<HTMLButtonElement>(null)
  useAutoSubmit(current, autoSubmit, trigger)

  const mobile = useIsMobile()
  const uid = useId()
  const rowId = (k: string) => `${uid}-${k}`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const hover = useRef<number>(undefined)

  const cats = useMemo(() => {
    const m = new Map<string, Cat>()
    for (const o of options) {
      const key = `${o.kind}-${o.parentId ?? o.parentName}`
      const c = m.get(key) ?? { key, name: o.parentName, kind: o.kind, color: o.color ?? "#a1a1aa", icon: o.icon, subs: [] }
      c.subs.push(o)
      m.set(key, c)
    }
    return [...m.values()]
  }, [options])
  const catOf = useMemo(() => new Map(cats.flatMap((c) => c.subs.map((s) => [String(s.id), c] as const))), [cats])
  const kinds = [...new Set(cats.map((c) => c.kind))]

  const chosenCat = current ? catOf.get(current) : undefined
  const chosenSub = chosenCat?.subs.find((s) => String(s.id) === current)
  const valueText = chosenCat && chosenSub ? `${chosenCat.name} › ${chosenSub.name}` : current === "" && emptyLabel != null ? emptyLabel : undefined

  // Busca: categoria que bate traz todas as subcategorias; senão só as subcategorias que batem
  const q = query.trim()
  const showEmpty = emptyLabel != null && (!q || matches(emptyLabel, q))
  const results = q ? cats.flatMap((c) => (matches(c.name, q) ? c.subs : c.subs.filter((s) => matches(s.name, q))).map((s) => ({ c, s }))) : []

  // Linhas que ↑↓ percorrem agora (no desktop, dentro do painel ou na coluna de categorias)
  const panel = !q && !mobile ? cats.find((c) => c.key === expanded) : undefined
  const inPanel = !!panel && !!active?.startsWith("s:")
  const nav = [
    ...(showEmpty && !inPanel ? [EMPTY] : []),
    ...(q ? results.map((r) => sk(r.s)) : inPanel ? panel.subs.map(sk) : cats.flatMap((c) => [ck(c), ...(mobile && expanded === c.key ? c.subs.map(sk) : [])])),
  ]
  const cur = active && nav.includes(active) ? active : nav[0]

  useEffect(() => {
    if (open && cur) reveal(document.getElementById(`${uid}-${cur}`))
  }, [open, cur, uid])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) return
    setQuery("")
    const c = current ? catOf.get(current) : undefined
    setActive(c ? ck(c) : null)
    setExpanded(c?.key ?? (mobile ? null : (cats[0]?.key ?? null)))
  }
  const pick = (v: string) => {
    setInner(v)
    onValueChange?.(v)
    setOpen(false)
  }
  const go = (k?: string) => {
    if (!k) return
    setActive(k)
    if (!mobile && k.startsWith("c:")) setExpanded(k.slice(2))
  }
  /** Abre a categoria e entra nas subcategorias (→, ou Enter no desktop). */
  const enter = (c: Cat) => {
    setExpanded(c.key)
    setActive(c.subs[0] ? sk(c.subs[0]) : ck(c))
  }
  const toggle = (c: Cat) => {
    setExpanded(expanded === c.key ? null : c.key)
    setActive(ck(c))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const i = cur ? nav.indexOf(cur) : -1
    const cat = cur?.startsWith("c:") ? cats.find((c) => ck(c) === cur) : undefined
    const parent = cur?.startsWith("s:") ? catOf.get(cur.slice(2)) : undefined
    if (e.key === "ArrowDown") go(nav[(i + 1) % nav.length])
    else if (e.key === "ArrowUp") go(nav[(i - 1 + nav.length) % nav.length])
    else if (e.key === "ArrowRight" && !q && cat) enter(cat)
    else if (e.key === "ArrowLeft" && !q && parent) go(ck(parent))
    else if (e.key === "ArrowLeft" && !q && cat && mobile && expanded === cat.key) setExpanded(null)
    else if (e.key === "Enter") {
      if (cur === EMPTY) pick("")
      else if (parent) pick(cur!.slice(2))
      else if (cat && mobile) toggle(cat)
      else if (cat) enter(cat)
    } else return
    e.preventDefault()
  }

  const row = (k: string, onClick: () => void) => ({
    id: rowId(k),
    "data-highlighted": cur === k ? "" : undefined,
    onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(), // o foco fica na busca
    onClick,
  })
  const hoverCat = (c: Cat) => (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || mobile) return
    window.clearTimeout(hover.current)
    hover.current = window.setTimeout(() => go(ck(c)), HOVER_DELAY)
  }
  const hoverSub = (k: string) => (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return
    window.clearTimeout(hover.current)
    setActive(k)
  }

  const emptyRow = showEmpty && (
    <div role="treeitem" aria-selected={current === ""} {...row(EMPTY, () => pick(""))} className={selectItemClass}>
      <span className="truncate">{emptyLabel}</span>
      {current === "" && <SelectCheck />}
    </div>
  )

  const subRow = (s: SubOption, c: Cat, flat?: boolean) => {
    const k = sk(s)
    const on = String(s.id) === current
    return (
      <div key={k} role="treeitem" aria-selected={on} {...row(k, () => pick(String(s.id)))} onPointerEnter={hoverSub(k)} className={cn(selectItemClass, mobile && !flat && "pl-10")}>
        {flat && <CatCircle c={c} />}
        <span className="min-w-0 truncate">
          {flat && <span className="text-muted-foreground">{c.name} › </span>}
          {s.name}
        </span>
        {on && <SelectCheck />}
      </div>
    )
  }

  const catRow = (c: Cat) => {
    const isOpen = expanded === c.key
    return (
      <div
        role="treeitem"
        aria-selected={false}
        aria-expanded={isOpen}
        aria-owns={panel?.key === c.key ? `${uid}-panel` : undefined}
        {...row(ck(c), () => (mobile ? toggle(c) : go(ck(c))))}
        onPointerEnter={hoverCat(c)}
        onPointerLeave={() => window.clearTimeout(hover.current)}
        className={cn(selectItemClass, "pr-2", !mobile && isOpen && "bg-muted")}
      >
        <CatCircle c={c} />
        <span className="min-w-0 flex-1 truncate">{c.name}</span>
        {chosenCat === c && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
        {mobile ? (
          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform duration-150 ease-[cubic-bezier(.2,.7,.2,1)]", isOpen && "rotate-180")} aria-hidden />
        ) : (
          <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
        )}
      </div>
    )
  }

  const column = "relative min-h-0 overflow-y-auto overscroll-contain p-1"

  return (
    <>
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger
          ref={trigger}
          id={id}
          disabled={disabled}
          data-size={size}
          aria-label={ariaLabel && (valueText ? `${ariaLabel}: ${valueText}` : ariaLabel)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
            e.preventDefault()
            onOpenChange(true)
          }}
          className={cn(selectTriggerClass, className)}
        >
          <span className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", !valueText && "text-muted-foreground")}>
            {chosenCat && <CatCircle c={chosenCat} className="size-5 [&_svg]:size-3" />}
            <span className="truncate" title={valueText}>
              {valueText ?? placeholder}
            </span>
          </span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={4} align="start" className="isolate z-[60] outline-none">
            <Popover.Popup
              aria-label={ariaLabel ?? placeholder ?? "Categoria"}
              className={cn(selectPopupClass, "max-h-[min(24rem,var(--available-height))] w-[min(22rem,var(--available-width))] md:w-[min(32rem,var(--available-width))]")}
            >
              <SelectSearch>
                <input
                  role="combobox"
                  aria-expanded
                  aria-controls={`${uid}-tree`}
                  aria-activedescendant={cur ? rowId(cur) : undefined}
                  aria-autocomplete="list"
                  aria-label="Buscar categoria"
                  placeholder="Buscar categoria…"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActive(null)
                  }}
                  onKeyDown={onKeyDown}
                  className={selectSearchInputClass}
                />
              </SelectSearch>
              <div className="flex min-h-0 flex-1">
                <div id={`${uid}-tree`} role="tree" aria-label={ariaLabel ?? "Categorias"} data-scroll className={cn(column, "flex-1", panel && "w-1/2 flex-none")}>
                  {emptyRow}
                  {q
                    ? results.map(({ c, s }) => subRow(s, c, true))
                    : kinds.map((kind) => (
                        <Fragment key={kind}>
                          {kinds.length > 1 && (
                            <div role="presentation" className={selectLabelClass}>
                              {KIND_LABEL(kind)}
                            </div>
                          )}
                          {cats
                            .filter((c) => c.kind === kind)
                            .map((c) => (
                              <Fragment key={c.key}>
                                {catRow(c)}
                                {mobile && expanded === c.key && <div role="group">{c.subs.map((s) => subRow(s, c))}</div>}
                              </Fragment>
                            ))}
                        </Fragment>
                      ))}
                  {q && !showEmpty && results.length === 0 && <SelectEmpty />}
                </div>
                {panel && (
                  <div id={`${uid}-panel`} role="group" aria-labelledby={rowId(ck(panel))} data-scroll className={cn(column, "w-1/2 border-l")}>
                    <div aria-hidden className={cn(selectLabelClass, "truncate")}>
                      {panel.name}
                    </div>
                    {panel.subs.map((s) => subRow(s, panel))}
                  </div>
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {name && (
        <input
          name={name}
          value={current ?? ""}
          required={required}
          disabled={disabled}
          onChange={() => {}}
          onFocus={() => trigger.current?.focus()}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute size-px opacity-0"
        />
      )}
      {autoSubmit && <FormBusy />}
    </>
  )
}
