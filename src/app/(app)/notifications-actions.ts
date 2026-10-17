"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/auth"
import { markAllRead, markRead, saveNotifySettings } from "@/lib/notifications"
import { pushConfigured, sendToAll } from "@/lib/push"

// Marcar como lido vale também na demonstração (o banco dela é em memória); o resto exige o dono.
export async function markNotificationRead(id: number) {
  await requireUser({ allowDemo: true })
  await markRead(z.number().int().positive().parse(id))
  refresh()
}

export async function markAllNotificationsRead() {
  await requireUser({ allowDemo: true })
  await markAllRead()
  refresh()
}

const patch = z.object({ pushHour: z.number().int().min(0).max(23), notifyDue: z.boolean(), notifyOverdue: z.boolean(), notifySalary: z.boolean(), notifyLimit: z.boolean() }).partial()

export async function updateNotifySettings(input: z.input<typeof patch>) {
  await requireUser()
  const next = await saveNotifySettings(patch.parse(input))
  refresh()
  return next
}

/** Manda um aviso de teste para todos os aparelhos inscritos. */
export async function sendTestPush() {
  await requireUser()
  if (!pushConfigured()) return { ok: false as const, error: "O envio de push ainda não foi configurado no servidor (chaves VAPID)." }
  const r = await sendToAll({ title: "Cofy aqui! 🐷", body: "Tudo certo: os avisos do fluxo vão chegar neste aparelho.", href: "/", tag: "teste" })
  return r.sent > 0 ? { ok: true as const, sent: r.sent } : { ok: false as const, error: "Nenhum aparelho inscrito recebeu o aviso. Ative o push neste aparelho primeiro." }
}
