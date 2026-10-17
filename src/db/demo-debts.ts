import type { PgliteDatabase } from "drizzle-orm/pglite"
import { addDays, addMonths } from "@/lib/domain/dates"
import * as s from "./schema"

type Db = PgliteDatabase<typeof import("./schema")>

/** Dívidas fictícias da demonstração (datas relativas a hoje): parcelado em dia fixo, após o salário, atrasada e pagamento livre. */
export async function seedDemoDebts(db: Db, { now, thisMonth }: { now: string; thisMonth: string }) {
  const day = Number(now.slice(8))
  const [joao, paulo, ana, mae] = await db
    .insert(s.debts)
    .values([
      // João: 5× de R$ 300 todo dia 7; as duas primeiras já pagas
      { creditor: "João Silva", relation: "Amigo", description: "Passagens de Salvador", scheduleKind: "FIXED_DAY", scheduleDay: 7, startMonth: addMonths(day <= 7 ? thisMonth : addMonths(thisMonth, 1), -2), remindDaysBefore: 1 },
      // Dr. Paulo: 2× de R$ 290, um dia depois que o salário (dia 5 na demonstração) cair
      { creditor: "Dr. Paulo Mendes", relation: "Profissional", description: "Sessões de psicologia de outubro", scheduleKind: "AFTER_SALARY", salaryOffsetDays: 1, startMonth: day >= 6 ? addMonths(thisMonth, 1) : thisMonth, remindDaysBefore: 1 },
      { creditor: "Ana Costa", relation: "Amigo", description: "Ingresso do show", scheduleKind: "DATE", scheduleDate: addDays(now, -3), remindDaysBefore: 0 },
      { creditor: "Mãe", relation: "Família", description: "Conserto do carro", scheduleKind: "NONE", remindDaysBefore: null },
    ])
    .returning({ id: s.debts.id })

  await db.insert(s.debtItems).values([
    { debtId: joao.id, description: "Passagens de ida e volta", quantity: 1, unitAmount: 1500 },
    { debtId: paulo.id, description: "Consulta", quantity: 4, unitAmount: 90 },
    { debtId: paulo.id, description: "Consulta (horário especial)", quantity: 2, unitAmount: 110 },
    { debtId: ana.id, description: "Ingresso", quantity: 1, unitAmount: 45 },
    { debtId: mae.id, description: "Conserto do carro", quantity: 1, unitAmount: 1000 },
  ])

  const joaoStart = addMonths(day <= 7 ? thisMonth : addMonths(thisMonth, 1), -2)
  await db.insert(s.debtInstallments).values([
    { debtId: joao.id, number: 1, amount: 300, paidOn: `${joaoStart}-07` },
    { debtId: joao.id, number: 2, amount: 300, paidOn: `${addMonths(joaoStart, 1)}-07` },
    ...[3, 4, 5].map((number) => ({ debtId: joao.id, number, amount: 300 })),
    { debtId: paulo.id, number: 1, amount: 290 },
    { debtId: paulo.id, number: 2, amount: 290 },
    { debtId: ana.id, number: 1, amount: 45 },
    { debtId: mae.id, number: 1, amount: 200, paidOn: `${addMonths(thisMonth, -1)}-20` },
  ])
}
