import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as schema from "@/db/schema"
import { addDays, today } from "./domain/dates"

const pg = new PGlite()
const testDb = drizzle(pg, { schema, casing: "snake_case" })
const sent: { title: string }[] = []
let configured = true
vi.mock("server-only", () => ({}))
vi.mock("@/db", () => ({ ...schema, db: testDb }))
vi.mock("./push", () => ({
  pushConfigured: () => configured,
  vapidPublicKey: () => "k",
  sendToAll: async (p: { title: string }) => (configured ? (sent.push(p), { sent: 1, removed: 0, skipped: false }) : { sent: 0, removed: 0, skipped: true }),
}))

const debtsLib = await import("./debts")
const n = await import("./notifications")
const now = today()

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" })
  const dueTomorrow = addDays(now, 1)
  await debtsLib.createDebt({
    creditor: "Ana",
    items: [{ description: "Show", quantity: 1, unitAmount: 45 }],
    mode: "LUMP",
    installments: 1,
    schedule: { kind: "DATE", date: dueTomorrow, offsetDays: 1 },
    remindDaysBefore: 1,
  })
  await debtsLib.createDebt({
    creditor: "Atrasada",
    items: [{ description: "x", quantity: 1, unitAmount: 100 }],
    mode: "LUMP",
    installments: 1,
    schedule: { kind: "DATE", date: addDays(now, -5), offsetDays: 1 },
    remindDaysBefore: 1,
  })
})
beforeEach(() => void (sent.length = 0))

describe("avisos", () => {
  it("gera uma vez só (idempotente) e lista com não lidos", async () => {
    expect((await n.generateNotifications()).map((x) => x.kind).sort()).toEqual(["DEBT_DUE", "DEBT_OVERDUE"])
    expect(await n.generateNotifications()).toEqual([])
    const { items, unread } = await n.listNotifications()
    expect(unread).toBe(2)
    await n.markRead(items[0].id)
    expect((await n.listNotifications()).unread).toBe(1)
    await n.markAllRead()
    expect((await n.listNotifications()).unread).toBe(0)
  })

  it("o job manda push dos pendentes uma vez e marca como enviado", async () => {
    const r = await n.runNotificationJob({ ignoreHour: true })
    expect(r.pushed).toBe(2)
    expect(sent.map((s) => s.title.replace(/\u00a0/g, " ")).sort()).toEqual(["Amanhã: parcela de Ana", "Dívida atrasada: Atrasada · R$ 100,00"])
    expect((await n.runNotificationJob({ ignoreHour: true })).pushed).toBe(0)
  })

  it("sem chaves de push, os avisos continuam pendentes para depois", async () => {
    const { views } = await debtsLib.loadDebts()
    await debtsLib.payInstallment({ debtId: views.find((v) => v.debt.creditor === "Atrasada")!.debt.id, installmentId: views.find((v) => v.debt.creditor === "Atrasada")!.ev.rows[0].id, amount: 100, date: now })
    await testDb.update(schema.notifications).set({ pushedAt: null })
    configured = false
    expect((await n.runNotificationJob({ ignoreHour: true })).pushed).toBe(0)
    configured = true
    expect((await n.runNotificationJob({ ignoreHour: true })).pushed).toBe(2)
  })

  it("salva configurações e respeita tipos desligados", async () => {
    await n.saveNotifySettings({ notifyLimit: false, pushHour: 8 })
    expect(await n.getNotifySettings()).toMatchObject({ notifyLimit: false, pushHour: 8, notifyDue: true })
  })
})
