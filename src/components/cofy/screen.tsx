"use client"

import { Download, Menu } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import type { ConversationRow, UiMessage } from "@/lib/cofy/types"
import { ChatView } from "./chat-view"
import { ConversationList } from "./conversation-list"
import { useCofy } from "./store"

const exportText = (title: string, messages: UiMessage[]) =>
  `# ${title}\n\n${messages.map((m) => `**${m.role === "user" ? "Você" : "Cofy"}:** ${m.parts.map((p) => (p.type === "text" ? p.text : p.type === "card" ? `[${p.card.title}]` : p.type === "action" ? `[${p.action.title}: ${p.action.status === "DONE" ? "salvo" : p.action.status === "CANCELLED" ? "cancelado" : "aguardando confirmação"}]` : "")).join("\n")}`).join("\n\n")}\n`

type Props = { active: ConversationRow[]; archived: ConversationRow[]; activeId?: number; userName: string; demo: boolean; initialDraft?: string }

/** Tela cheia do Cofy: lista de conversas (gaveta no celular) + chat. O estado fica no CofyProvider. */
export function CofyScreen({ active, archived, activeId, userName, demo, initialDraft }: Props) {
  const router = useRouter()
  const { newKey, open, conv } = useCofy()
  const [draftKey, setDraftKey] = useState(() => newKey())
  const [drawer, setDrawer] = useState(false)
  const key = activeId ? String(activeId) : draftKey
  const c = conv(key)

  useEffect(() => {
    if (activeId) open(activeId)
  }, [activeId, open])

  const go = (path: string) => router.push(path, { scroll: false })
  const title = c?.title && c.title !== "Nova conversa" ? c.title : (active.find((r) => r.id === activeId)?.title ?? "Nova conversa")
  const list = (
    <ConversationList
      active={active}
      archived={archived}
      activeId={activeId}
      demo={demo}
      onNew={() => {
        setDraftKey(newKey())
        setDrawer(false)
        go("/cofy")
      }}
      onSelect={(id) => {
        setDrawer(false)
        go(`/cofy?c=${id}`)
      }}
      onDeleted={(id) => id === activeId && go("/cofy")}
    />
  )

  return (
    <div className="-mx-4 -mt-4 -mb-24 flex h-[calc(100svh-3.5rem-var(--demo-bar,0px))] min-h-0 md:-mx-6 md:-mt-6 md:-mb-12">
      <aside className="hidden w-72 shrink-0 border-r bg-card md:block lg:w-[18.5rem]">{list}</aside>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" showCloseButton={false} className="w-[min(20rem,88vw)] gap-0 p-0">
          <SheetTitle className="sr-only">Conversas</SheetTitle>
          <SheetDescription className="sr-only">Histórico de conversas com o Cofy</SheetDescription>
          {list}
        </SheetContent>
      </Sheet>
      <section className="flex min-w-0 flex-1 flex-col max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Conversas" onClick={() => setDrawer(true)}><Menu /></Button>
          <b className="min-w-0 flex-1 truncate text-[15px]">{title}</b>
          <span className="hidden text-xs text-muted-foreground sm:inline">Claude Haiku 5.5 · só finanças e o fluxo</span>
          {c && c.messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => {
              const a = document.createElement("a")
              a.href = URL.createObjectURL(new Blob([exportText(title, c.messages)], { type: "text/markdown;charset=utf-8" }))
              a.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "conversa"}.md`
              a.click()
              URL.revokeObjectURL(a.href)
            }}>
              <Download /> <span className="max-sm:hidden">Exportar conversa</span>
            </Button>
          )}
        </header>
        <ChatView key={activeId ?? "novo"} convKey={key} userName={userName} demo={demo} initialDraft={initialDraft} onConv={(id) => { if (!activeId) { router.replace(`/cofy?c=${id}`, { scroll: false }); setDraftKey(newKey()); router.refresh() } else router.refresh() }} />
      </section>
    </div>
  )
}
