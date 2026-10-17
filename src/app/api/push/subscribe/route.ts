import { eq } from "drizzle-orm"
import { z } from "zod"
import { requireUser } from "@/auth"
import { db, pushSubscriptions } from "@/db"

const body = z.object({
  subscription: z.object({ endpoint: z.url().max(2000), keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }) }),
  label: z.string().trim().max(120).optional(),
})

/** Guarda a inscrição de push deste aparelho (só o dono; a demonstração não recebe push). */
export async function POST(request: Request) {
  try {
    await requireUser()
  } catch {
    return Response.json({ error: "Não autorizado" }, { status: 401 })
  }
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Inscrição inválida" }, { status: 400 })
  const { subscription: s, label } = parsed.data
  const values = { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, label: label ?? null }
  await db.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  try {
    await requireUser()
  } catch {
    return Response.json({ error: "Não autorizado" }, { status: 401 })
  }
  const parsed = z.object({ endpoint: z.string().max(2000) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Pedido inválido" }, { status: 400 })
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint))
  return Response.json({ ok: true })
}
