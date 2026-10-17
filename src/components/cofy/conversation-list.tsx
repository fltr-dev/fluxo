"use client"

import { Archive, ArchiveRestore, MoreHorizontal, Pencil, PenSquare, Search, Trash2 } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { archiveConversationAction, deleteConversationAction, renameConversationAction } from "@/app/(app)/cofy/actions"
import { CofyAvatar } from "@/components/cofy-mascot"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { normalize } from "@/lib/domain/categorize"
import type { ConversationRow } from "@/lib/cofy/types"
import { cn } from "@/lib/utils"
import { useCofy } from "./store"

const MONTHS = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" })
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d)

function group(rows: ConversationRow[]) {
  const now = new Date()
  const today = dayKey(now)
  const week = dayKey(new Date(now.getTime() - 6 * 86_400_000))
  const out = new Map<string, ConversationRow[]>()
  for (const r of rows) {
    const d = new Date(r.updatedAt)
    const k = dayKey(d)
    const label = k === today ? "Hoje" : k >= week ? "Esta semana" : (m => m.charAt(0).toUpperCase() + m.slice(1))(MONTHS.format(d))
    out.set(label, [...(out.get(label) ?? []), r])
  }
  return [...out]
}

type Props = { active: ConversationRow[]; archived: ConversationRow[]; activeId?: number; demo?: boolean; onNew: () => void; onSelect: (id: number) => void; onDeleted: (id: number) => void }

export function ConversationList({ active, archived, activeId, demo, onNew, onSelect, onDeleted }: Props) {
  const { busyIds } = useCofy()
  const [q, setQ] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [, start] = useTransition()
  const list = showArchived ? archived : active
  const groups = useMemo(() => group(q ? list.filter((r) => normalize(r.title).includes(normalize(q))) : list), [list, q])

  const row = (r: ConversationRow) => {
    const on = r.id === activeId
    const busy = busyIds.includes(r.id)
    return (
      <li key={r.id} className="group relative">
        {renaming === r.id ? (
          <form
            className="px-1 py-0.5"
            onSubmit={(e) => {
              e.preventDefault()
              const title = String(new FormData(e.currentTarget).get("title") ?? "")
              setRenaming(null)
              start(() => void renameConversationAction(r.id, title))
            }}
          >
            <input name="title" autoFocus defaultValue={r.title} maxLength={80} aria-label="Novo nome da conversa" onBlur={(e) => e.currentTarget.form?.requestSubmit()} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} className="h-9 w-full rounded-lg border border-ring bg-background px-2.5 text-sm outline-none ring-3 ring-ring/30" />
          </form>
        ) : confirmDelete === r.id ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-sm">
            <span className="flex-1 truncate text-destructive">Excluir?</span>
            <Button size="xs" variant="outline" onClick={() => setConfirmDelete(null)}>Não</Button>
            <Button size="xs" variant="destructive" onClick={() => (setConfirmDelete(null), onDeleted(r.id), start(() => void deleteConversationAction(r.id)))}>Excluir</Button>
          </div>
        ) : (
          <>
            <button type="button" aria-current={on ? "page" : undefined} onClick={() => onSelect(r.id)} className={cn("flex h-9 w-full items-center gap-2 rounded-lg px-2.5 pr-9 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50", on && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent")}>
              <span className="truncate">{r.title}</span>
              {busy && <span className="ml-auto size-2 shrink-0 animate-pulse rounded-full bg-primary" role="status" aria-label="Respondendo" />}
            </button>
            {!demo && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" aria-label={`Opções de ${r.title}`} className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:bg-background focus-visible:opacity-100 aria-expanded:opacity-100 max-md:opacity-100" />}>
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setRenaming(r.id)}><Pencil /> Renomear</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => start(() => void archiveConversationAction(r.id, !r.archived))}>{r.archived ? <ArchiveRestore /> : <Archive />} {r.archived ? "Desarquivar" : "Arquivar"}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(r.id)}><Trash2 /> Excluir</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )}
      </li>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-2.5 p-3.5 pb-2">
        <div className="flex items-center gap-2.5">
          <CofyAvatar size={36} />
          <div className="grid leading-tight">
            <b className="text-base">Cofy</b>
            <span className="text-xs text-muted-foreground">Assistente financeiro do fluxo</span>
          </div>
        </div>
        <Button onClick={onNew} className="w-full" size="lg"><PenSquare /> Nova conversa</Button>
        <label className="flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <Search className="size-4 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversas" aria-label="Buscar conversas" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {showArchived && <p className="px-2.5 pt-2 pb-1 text-xs font-semibold text-muted-foreground">Arquivadas</p>}
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{q ? "Nenhuma conversa encontrada." : showArchived ? "Nada arquivado." : "Suas conversas aparecem aqui."}</p>
        ) : (
          groups.map(([label, rows]) => (
            <section key={label} className="grid gap-0.5 pb-1">
              {!showArchived && <h3 className="px-2.5 pt-3 pb-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{label}</h3>}
              <ul className="grid gap-0.5">{rows.map(row)}</ul>
            </section>
          ))
        )}
      </div>
      <button type="button" onClick={() => setShowArchived((v) => !v)} className="mx-2 mb-2 flex h-10 items-center gap-2 border-t px-2.5 pt-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground">
        {showArchived ? <PenSquare className="size-4" /> : <Archive className="size-4" />}
        {showArchived ? "Voltar às conversas" : `Arquivadas${archived.length ? ` (${archived.length})` : ""}`}
      </button>
    </div>
  )
}
