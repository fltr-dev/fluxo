"use client"

import { Check, ChartColumn, Download, FileText, HandCoins, List, Loader2, Plus, Target, TrendingUp, Wallet, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { DebtAvatar } from "@/app/(app)/dividas/shared"
import { Button } from "@/components/ui/button"
import type { ActionView, Card, CardBlock, CardIcon, UiAttachment } from "@/lib/cofy/types"
import { cn } from "@/lib/utils"
import { useCofy } from "./store"

const ICONS: Record<CardIcon, LucideIcon> = { chart: ChartColumn, wallet: Wallet, list: List, debt: HandCoins, target: Target, trend: TrendingUp, report: FileText }
const TONE = { good: "text-income", bad: "text-expense", warn: "text-warning" } as const

// ---------- Texto ----------

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|[@#]\[[^\]]+\])/g

/** Negrito, código e menções (@[conta] / #[categoria]) viram chips; o resto é texto. */
function Inline({ text, onUser }: { text: string; onUser?: boolean }) {
  return (
    <>
      {text.split(TOKEN).map((t, i) => {
        if (t.startsWith("**") && t.endsWith("**") && t.length > 4) return <strong key={i}>{t.slice(2, -2)}</strong>
        if (t.startsWith("`") && t.endsWith("`") && t.length > 2) return <code key={i} className="rounded bg-muted px-1 py-px text-[0.85em]">{t.slice(1, -1)}</code>
        const m = /^([@#])\[([^\]]+)\]$/.exec(t)
        if (m)
          return (
            <span key={i} className={cn("mx-px inline-flex items-center rounded-md px-1.5 text-[0.9em] font-semibold", onUser ? "bg-white/20 text-white" : m[1] === "#" ? "bg-amber-500/15 text-warning" : "bg-primary/10 text-primary")}>
              {m[1]}
              {m[2]}
            </span>
          )
        return t
      })}
    </>
  )
}

/** Markdown mínimo: parágrafos, listas com "-" ou "1." e inline. É o que o prompt do Cofy permite. */
export function Text({ text, onUser }: { text: string; onUser?: boolean }) {
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 break-words">
      {blocks.map((b, i) => {
        const lines = b.split("\n")
        if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
          return (
            <ul key={i} className="grid list-disc gap-1 pl-5">
              {lines.map((l, j) => <li key={j}><Inline text={l.replace(/^\s*[-*]\s+/, "")} onUser={onUser} /></li>)}
            </ul>
          )
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
          return (
            <ol key={i} className="grid list-decimal gap-1 pl-5">
              {lines.map((l, j) => <li key={j}><Inline text={l.replace(/^\s*\d+[.)]\s+/, "")} onUser={onUser} /></li>)}
            </ol>
          )
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Inline text={l} onUser={onUser} />
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`)

export function AttachmentChip({ a, onUser }: { a: Pick<UiAttachment, "name" | "size" | "mediaType">; onUser?: boolean }) {
  const ext = a.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "ARQ"
  return (
    <span className={cn("inline-flex max-w-full items-center gap-2 rounded-xl py-1.5 pr-3 pl-1.5 text-[13px] font-semibold", onUser ? "bg-white/15" : "border bg-card")}>
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-expense text-[9px] font-extrabold text-white">{ext}</span>
      <span className="truncate">{a.name}</span>
      <span className={cn("shrink-0 font-normal", onUser ? "text-white/70" : "text-muted-foreground")}>{a.size ? bytes(a.size) : ""}</span>
    </span>
  )
}

// ---------- Cartões das ferramentas ----------

function csvOf(columns: string[], rows: string[][]) {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return "﻿" + [columns, ...rows].map((r) => r.map(esc).join(";")).join("\r\n")
}

function Block({ b }: { b: CardBlock }) {
  if (b.type === "kpis")
    return (
      <div className="grid divide-x" style={{ gridTemplateColumns: `repeat(${Math.min(3, b.items.length)}, minmax(0, 1fr))` }}>
        {b.items.map((k) => (
          <div key={k.label} className="grid gap-0.5 px-3.5 py-2.5">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{k.label}</span>
            <b className={cn("text-[15px] tabular-nums sm:text-base", k.tone && TONE[k.tone])}>{k.value}</b>
          </div>
        ))}
      </div>
    )
  if (b.type === "bars")
    return (
      <div className="grid gap-2 px-3.5 py-3">
        {b.rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto_auto] items-center gap-2 text-[13px] sm:grid-cols-[8.5rem_minmax(0,1fr)_auto_3.5rem]">
            <span className="truncate">{r.label}</span>
            <span className="relative h-2 rounded-full bg-muted">
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (r.value / r.max) * 100)}%`, background: r.color ?? "var(--primary)" }} />
              {r.marker != null && <i className="absolute -top-0.5 h-3 w-0.5 rounded bg-foreground/60" style={{ left: `${Math.min(99, (r.marker / r.max) * 100)}%` }} />}
            </span>
            <b className="text-right tabular-nums">{r.text}</b>
            <span className={cn("hidden text-right text-xs font-bold tabular-nums sm:block", r.tone === "bad" && "text-expense", r.tone === "good" && "text-income")}>{r.delta ?? ""}</span>
          </div>
        ))}
        {b.legend && <span className="text-[11px] text-muted-foreground">{b.legend}</span>}
      </div>
    )
  if (b.type === "table")
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {b.columns.map((c, i) => <th key={c} className={cn("px-3.5 py-1.5 font-semibold", b.align?.[i] === "r" ? "text-right" : "text-left")}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                {r.map((c, j) => <td key={j} className={cn("px-3.5 py-1.5", b.align?.[j] === "r" ? "text-right tabular-nums" : "max-w-[16rem] truncate")}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {b.csvName && b.rows.length > 0 && (
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvOf(b.columns, b.rows))}`} download={`${b.csvName}.csv`} className="flex items-center gap-1.5 border-t px-3.5 py-2 text-xs font-semibold text-primary hover:underline">
            <Download className="size-3.5" /> Baixar CSV
          </a>
        )}
      </div>
    )
  return <p className="px-3.5 py-2.5 text-xs text-muted-foreground">{b.text}</p>
}

export function CardView({ card }: { card: Card }) {
  const Icon = ICONS[card.icon]
  return (
    <section className="overflow-hidden rounded-2xl border bg-card" aria-label={card.title}>
      <header className="flex items-center gap-2 border-b bg-muted/40 px-3.5 py-2 text-[13px] font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{card.title}</span>
        {card.href && <Link href={card.href} className="shrink-0 text-xs font-semibold text-primary hover:underline">{card.hrefLabel ?? "Abrir"}</Link>}
      </header>
      <div className="divide-y">{card.blocks.map((b, i) => <Block key={i} b={b} />)}</div>
    </section>
  )
}

export function ToolRunning({ label }: { label: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" /> Consultando {label.toLowerCase()}…
    </span>
  )
}

// ---------- Confirmação de ações ----------

const KIND: Record<string, string> = { transactions: "Lançar transações", categorize: "Categorizar", debt: "Nova dívida", payment: "Registrar pagamento", rule: "Nova regra", limit: "Definir limite" }

export function ActionCard({ action: a, onEdit }: { action: ActionView; onEdit?: (a: ActionView) => void }) {
  const { act } = useCofy()
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = a.status === "PENDING"
  async function run(kind: "confirm" | "cancel") {
    setBusy(kind)
    setError(null)
    setError(await act(a.id, kind))
    setBusy(null)
  }
  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-card", pending && "border-primary/40")} aria-label={a.title}>
      <header className={cn("flex items-center gap-2 border-b px-3.5 py-2 text-[13px] font-semibold", pending ? "bg-primary/5 text-primary" : "bg-muted/40")}>
        <Plus className="size-4" />
        {KIND[a.kind] ?? "Ação"} · {pending ? "aguardando sua confirmação" : a.status === "DONE" ? "salvo" : "cancelado"}
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 px-3.5 py-3">
        <div className="flex items-center gap-3">
          {(a.kind === "debt" || a.kind === "payment") && <DebtAvatar creditor={a.title.replace(/^Pagamento · /, "")} size={36} />}
          <div className="min-w-0 flex-1">
            <b className="block truncate">{a.title}</b>
            {a.subtitle && <span className="block truncate text-xs text-muted-foreground">{a.subtitle}</span>}
          </div>
          {a.amount && <b className="text-base tabular-nums">{a.amount}</b>}
        </div>
        {a.rows.length > 0 && (
          <ul className="grid gap-0.5 border-t border-dashed pt-2 text-[13px]">
            {a.rows.map((r, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="shrink-0 tabular-nums">{r.value}</span>
              </li>
            ))}
          </ul>
        )}
        {a.tags && a.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {a.tags.map((t, i) => (
              <span key={t} className={cn("inline-flex h-5 items-center rounded-md px-2 text-xs font-semibold", i === a.tags!.length - 1 ? "bg-primary/10 text-primary" : "bg-muted")}>{t}</span>
            ))}
          </div>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-3.5 py-2.5">
        {pending ? (
          <>
            {error && <span role="alert" className="mr-auto text-xs text-destructive">{error}</span>}
            {onEdit && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => onEdit(a)}>Editar</Button>}
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void run("cancel")}>Cancelar</Button>
            <Button size="sm" disabled={!!busy} onClick={() => void run("confirm")}>
              {busy === "confirm" && <Loader2 className="animate-spin" />}
              Confirmar e salvar
            </Button>
          </>
        ) : a.status === "DONE" ? (
          <>
            <span className="mr-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-income">
              <Check className="size-4" strokeWidth={2.5} /> {a.result ?? "Salvo"}
            </span>
            {a.href && <Link href={a.href} className="text-xs font-semibold text-primary hover:underline">{a.hrefLabel ?? "Abrir"}</Link>}
          </>
        ) : (
          <span className="mr-auto text-[13px] text-muted-foreground">Cancelado · nada foi salvo</span>
        )}
      </footer>
    </section>
  )
}

