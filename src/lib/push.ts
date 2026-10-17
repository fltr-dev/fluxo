import "server-only"
import { eq } from "drizzle-orm"
import webpush from "web-push"
import { db, pushSubscriptions } from "@/db"

// Web Push (VAPID): as chaves vêm do ambiente (gere com `node scripts/vapid.mjs`). Sem elas o app só mostra o sino.

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? ""
export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

export type PushPayload = { title: string; body: string; href?: string | null; tag?: string }

/** Envia para todos os aparelhos inscritos; assinaturas que o navegador já revogou (404/410) são apagadas. */
export async function sendToAll(payload: PushPayload) {
  if (!pushConfigured()) return { sent: 0, removed: 0, skipped: true as const }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@localhost", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
  const subs = await db.select().from(pushSubscriptions)
  let sent = 0
  let removed = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12 })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id))
          removed++
        } else console.error("push:", e instanceof Error ? e.message : e)
      }
    }),
  )
  return { sent, removed, skipped: false as const }
}
