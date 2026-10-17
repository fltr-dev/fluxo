import "server-only"
import { desc, eq, isNull, sql } from "drizzle-orm"
import { db, notificationSettings, notifications } from "@/db"
import { monthEnd, monthOf, monthStart, today } from "./domain/dates"
import { buildNotifications, DEFAULT_NOTIFY, type NotifySettings } from "./domain/notifications"
import { loadDebts, salaryEntries } from "./debts"
import { sendToAll } from "./push"
import { limitsWithUsage } from "./queries"

export async function getNotifySettings(): Promise<NotifySettings> {
  const [row] = await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1))
  return row ? { pushHour: row.pushHour, notifyDue: row.notifyDue, notifyOverdue: row.notifyOverdue, notifySalary: row.notifySalary, notifyLimit: row.notifyLimit } : DEFAULT_NOTIFY
}

export async function saveNotifySettings(patch: Partial<NotifySettings>) {
  const next = { ...(await getNotifySettings()), ...patch }
  await db.insert(notificationSettings).values({ id: 1, ...next }).onConflictDoUpdate({ target: notificationSettings.id, set: next })
  return next
}

/** Cria os avisos que faltam (idempotente: o mesmo aviso nunca é criado duas vezes). Devolve só os novos. */
export async function generateNotifications() {
  const now = today()
  const [{ views }, settings, entries, limits] = await Promise.all([
    loadDebts(),
    getNotifySettings(),
    salaryEntries(),
    limitsWithUsage({ from: monthStart(monthOf(now)), to: monthEnd(monthOf(now)) }),
  ])
  const last = entries.at(-1)
  const drafts = buildNotifications({
    today: now,
    debts: views.map((v) => ({ id: v.debt.id, creditor: v.debt.creditor, description: v.debt.description, remindDaysBefore: v.debt.remindDaysBefore, afterSalary: v.schedule.kind === "AFTER_SALARY", totalRows: v.ev.rows.length, rows: v.ev.rows })),
    salary: last ? { date: last.day, amount: last.amount } : null,
    limits,
    settings,
  })
  if (!drafts.length) return []
  return db.insert(notifications).values(drafts).onConflictDoNothing({ target: notifications.dedupeKey }).returning()
}

// A tela gera os avisos ao abrir (no máximo a cada 10 min por instância); o cron diário cobre quem não abre o app.
const g = globalThis as unknown as { notifyAt?: number }
export async function ensureNotifications() {
  if (g.notifyAt && Date.now() - g.notifyAt < 600_000) return
  g.notifyAt = Date.now()
  try {
    await generateNotifications()
  } catch (e) {
    g.notifyAt = undefined
    console.error("avisos:", e instanceof Error ? e.message : e)
  }
}

export async function listNotifications(limit = 20) {
  const [items, [{ unread }]] = await Promise.all([
    db.select().from(notifications).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit),
    db.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(isNull(notifications.readAt)),
  ])
  return { items, unread }
}

export const markRead = (id: number) => db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id))
export const markAllRead = () => db.update(notifications).set({ readAt: new Date() }).where(isNull(notifications.readAt))

const brtHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date())) % 24

/**
 * Cron diário: gera os avisos e manda por push os que ainda não foram, quando já passou do horário escolhido.
 * (Com o cron uma vez ao dia o horário real é o do agendamento; rodando de hora em hora, vale o escolhido.)
 */
export async function runNotificationJob({ ignoreHour = false } = {}) {
  await generateNotifications()
  const settings = await getNotifySettings()
  if (!ignoreHour && brtHour() < settings.pushHour) return { pushed: 0, waiting: true }
  const pending = await db.select().from(notifications).where(isNull(notifications.pushedAt)).orderBy(notifications.createdAt)
  let pushed = 0
  for (const n of pending) {
    const r = await sendToAll({ title: n.title, body: n.body, href: n.href, tag: n.dedupeKey })
    // sem chaves VAPID ou sem aparelhos inscritos, não marca: continua pendente para quando houver
    if (r.skipped) break
    if (r.sent > 0 || r.removed > 0) {
      await db.update(notifications).set({ pushedAt: new Date() }).where(eq(notifications.id, n.id))
      pushed += r.sent
    }
  }
  return { pushed, waiting: false }
}
