import { timingSafeEqual } from "node:crypto"
import { asOwner } from "@/db"
import { runNotificationJob } from "@/lib/notifications"

export const maxDuration = 60

export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`)
  const got = Buffer.from(request.headers.get("authorization") ?? "")
  if (!process.env.CRON_SECRET || got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return new Response("Unauthorized", { status: 401 })
  }
  return Response.json(await asOwner(() => runNotificationJob()))
}
