"use client"

import { BarChart3, FileUp, HandCoins, Lightbulb } from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { CofyAvatar, CofyPose } from "@/components/cofy-mascot"
import { currentNav } from "@/components/nav-items"
import type { ActionView, UiMessage } from "@/lib/cofy/types"
import { cn } from "@/lib/utils"
import { ActionCard, AttachmentChip, CardView, Text, ToolRunning } from "./cards"
import { Composer } from "./composer"
import { useCofy } from "./store"

/** Descreve a tela atual para o Cofy (vai no contexto de cada mensagem): "Dashboard (/) · mês 2026-10". */
export function useScreenContext() {
  const path = usePathname()
  const sp = useSearchParams()
  const nav = currentNav(path)
  const extra = ["mes", "periodo", "de", "ate", "conta", "categoria"].flatMap((k) => (sp.get(k) ? [`${k}=${sp.get(k)}`] : []))
  return { label: nav?.item.label ?? "fluxo", text: `${nav?.item.label ?? "fluxo"} (${path})${extra.length ? ` · filtros: ${extra.join(", ")}` : ""}` }
}

const SUGGESTIONS = [
  { icon: BarChart3, text: "Como foi meu mês até agora?" },
  { icon: HandCoins, text: "Quando consigo quitar minhas dívidas?" },
  { icon: Lightbulb, text: "Onde posso economizar?" },
  { icon: FileUp, text: "Importar um extrato (CSV ou OFX)" },
]

function Bubble({ m, onEdit, last, streaming }: { m: UiMessage; onEdit: (a: ActionView) => void; last: boolean; streaming: boolean }) {
  if (m.role === "user")
    return (
      <div className="flex max-w-[88%] flex-col items-end gap-1.5 self-end sm:max-w-[78%]">
        {m.attachments?.map((a, i) => <AttachmentChip key={`${a.id}-${i}`} a={a} onUser={false} />)}
        {m.parts.map((p, i) => p.type === "text" && <div key={i} className="rounded-[18px] rounded-br-md bg-primary px-3.5 py-2.5 text-[15px] leading-[22px] text-primary-foreground"><Text text={p.text} onUser /></div>)}
      </div>
    )
  const empty = m.parts.length === 0
  return (
    <div className="flex max-w-full items-start gap-3">
      <CofyAvatar size={32} className="mt-0.5" />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-2.5 text-[15px] leading-[22px]">
        {m.parts.map((p, i) =>
          p.type === "text" ? <Text key={i} text={p.text} /> : p.type === "card" ? <CardView key={i} card={p.card} /> : p.type === "action" ? <ActionCard key={i} action={p.action} onEdit={onEdit} /> : <ToolRunning key={i} label={p.label} />,
        )}
        {last && streaming && (empty || m.parts.at(-1)?.type === "card" || m.parts.at(-1)?.type === "action") && (
          <span className="inline-flex items-center gap-1.5 py-1.5" aria-label="Cofy está pensando" role="status">
            {[0, 1, 2].map((i) => <i key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 140}ms` }} />)}
          </span>
        )}
      </div>
    </div>
  )
}

export function ChatView({ convKey, userName, compact, demo, initialDraft, onConv }: { convKey: string; userName: string; compact?: boolean; demo?: boolean; initialDraft?: string; onConv?: (id: number) => void }) {
  const { conv, send } = useCofy()
  const c = conv(convKey)
  const screen = useScreenContext()
  const [draft, setDraft] = useState<{ text: string; nonce: number } | undefined>(initialDraft ? { text: initialDraft, nonce: 1 } : undefined)
  const end = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // acompanha a resposta chegando, a menos que você tenha rolado para cima
  useEffect(() => {
    if (stick.current && c?.messages.length) end.current?.scrollIntoView({ block: "end" })
  }, [c?.messages, c?.streaming])

  const messages = c?.messages ?? []
  const streaming = !!c?.streaming
  const doSend = (text: string, files: File[]) => {
    stick.current = true
    void send(convKey, { text, files, page: screen.text }, onConv)
  }
  const edit = (a: ActionView) => setDraft({ text: `Quero ajustar "${a.title}": `, nonce: Date.now() })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
      >
        <div className={cn("mx-auto flex min-h-full w-full flex-col gap-5 px-4 py-5", compact ? "max-w-none" : "max-w-3xl sm:px-6")}>
          {c && !c.loaded && messages.length === 0 && <p className="m-auto text-sm text-muted-foreground">Carregando conversa…</p>}
          {c?.loaded !== false && messages.length === 0 && (
            <div className="m-auto flex w-full max-w-md flex-col items-center gap-3 py-6 text-center">
              <CofyPose size={compact ? 96 : 132} />
              <div className="grid gap-1">
                <b className="text-xl leading-7">Oi, {userName.split(" ")[0]}! Sou o Cofy.</b>
                <span className="mx-auto max-w-[32ch] text-sm text-muted-foreground">Pergunte sobre seus gastos, dívidas e investimentos, ou mande um arquivo para eu ler.</span>
              </div>
              <div className="grid w-full gap-2 pt-1">
                {SUGGESTIONS.map(({ icon: Icon, text }) => (
                  <button key={text} type="button" disabled={demo || streaming} onClick={() => (text.startsWith("Importar") ? setDraft({ text: "Quero importar um extrato. ", nonce: Date.now() }) : doSend(text, []))} className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left text-sm font-semibold outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><Icon className="size-4" /></span>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => <Bubble key={m.id} m={m} onEdit={edit} last={i === messages.length - 1} streaming={streaming} />)}
          {c?.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{c.error}</p>}
          <div ref={end} />
        </div>
      </div>
      <div className={cn("mx-auto w-full shrink-0 px-4 pb-4", compact ? "max-w-none" : "max-w-3xl sm:px-6 sm:pb-5")}>
        {messages.length > 0 && !streaming && !compact && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {["Resumo da semana", "Onde posso economizar?", "Gerar relatório do mês"].map((s) => (
              <button key={s} type="button" disabled={demo} onClick={() => doSend(s, [])} className="h-8 rounded-full border bg-card px-3 text-[13px] font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-60">{s}</button>
            ))}
          </div>
        )}
        <Composer compact={compact} streaming={streaming} disabled={demo} draft={draft} placeholder={demo ? "Entre com a sua conta para conversar com o Cofy" : undefined} onSend={doSend} />
        {!compact && <p className="mt-2 text-center text-[11px] text-muted-foreground">O Cofy só fala de finanças e do fluxo, e sempre pede confirmação antes de alterar seus dados.</p>}
      </div>
    </div>
  )
}
