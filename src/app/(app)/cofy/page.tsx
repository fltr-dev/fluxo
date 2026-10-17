import { auth } from "@/auth"
import { CofyScreen } from "@/components/cofy/screen"
import { listConversations } from "@/lib/cofy/store"

export const metadata = { title: "Cofy" }

export default async function CofyPage({ searchParams }: PageProps<"/cofy">) {
  const sp = await searchParams
  const [session, active, archived] = await Promise.all([auth(), listConversations(false), listConversations(true)])
  const c = Number(typeof sp.c === "string" ? sp.c : "")
  const activeId = Number.isInteger(c) && [...active, ...archived].some((r) => r.id === c) ? c : undefined
  const q = typeof sp.q === "string" ? sp.q.slice(0, 500) : undefined
  return <CofyScreen active={active} archived={archived} activeId={activeId} userName={session?.user?.name || "Você"} demo={session?.user?.role === "demo"} initialDraft={q} />
}
