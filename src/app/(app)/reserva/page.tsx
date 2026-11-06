import { eq } from "drizzle-orm"
import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/auth"
import { fieldClass, Money, PageTitle } from "@/components/bits"
import { MonthlyExpenseChart } from "@/components/charts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { accounts, db, reserveSettings } from "@/db"
import { fd, parseForm } from "@/lib/form"
import { brl, num1, pct } from "@/lib/format"
import { listAccounts, reserveOverview } from "@/lib/queries"
import { cn } from "@/lib/utils"

const TYPE_LABEL = { CHECKING: "Corrente", CREDIT_CARD: "Cartão de crédito", SAVINGS_INVESTMENT: "Investimento", CASH: "Dinheiro" }

async function saveSettings(form: FormData) {
  "use server"
  await requireUser()
  const v = parseForm(form, {
    targetMode: z.enum(["MONTHS", "FIXED"]),
    targetMonths: z.coerce.number().int().min(1).max(60),
    targetAmount: fd.optMoney,
  })
  if (v.targetMode === "FIXED" && !v.targetAmount) throw new Error("Informe o valor da meta")
  const ids = form.getAll("reserveAccountIds").map((x) => fd.id.parse(x))
  await db.insert(reserveSettings).values({ id: 1, ...v }).onConflictDoUpdate({ target: reserveSettings.id, set: v })
  await db.update(accounts).set({ isEmergencyReserve: false })
  for (const id of ids) await db.update(accounts).set({ isEmergencyReserve: true }).where(eq(accounts.id, id))
  refresh()
}

export default async function ReservePage() {
  const [r, accs] = await Promise.all([reserveOverview(), listAccounts()])
  const active = accs.filter((a) => !a.archived)
  const targetMonths = r.avgMonthlyExpense ? r.target / r.avgMonthlyExpense : r.settings.targetMonths
  const ticks = Math.max(1, Math.round(targetMonths))
  const missing = Math.max(0, r.target - r.balance)

  return (
    <div className="grid gap-5">
      <PageTitle title="Reserva de emergência" description="Quantos meses de despesa você cobre com as contas marcadas como reserva." />

      <Card className="gap-0 py-0">
        <CardContent className="grid gap-5 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-0.5">
              <span className="text-sm font-medium text-muted-foreground">Cobertura atual</span>
              <span className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">{r.coverageMonths == null ? "—" : num1(r.coverageMonths)}</span>
                <span className="text-muted-foreground">meses de despesa</span>
              </span>
            </div>
            {missing > 0 ? (
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-warning">Faltam <span className="tabular-nums sensitive">{brl(missing)}</span> para o alvo</span>
            ) : (
              <span className="rounded-full bg-income/10 px-2.5 py-0.5 text-xs font-medium text-income">Alvo atingido</span>
            )}
          </div>
          <div className="grid gap-1.5">
            <div className="relative">
              <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(r.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da reserva">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, r.pct * 100)}%` }} />
              </div>
              {Array.from({ length: ticks - 1 }, (_, i) => (
                <span key={i} className="absolute -top-0.5 h-4 w-0.5 -translate-x-1/2 bg-card" style={{ left: `${((i + 1) / ticks) * 100}%` }} />
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>0</span>
              <span className={cn("font-medium text-foreground", r.settings.targetMode !== "MONTHS" && "sensitive")}>{r.settings.targetMode === "MONTHS" ? `${r.settings.targetMonths} meses · alvo` : `${brl(r.target)} · alvo`}</span>
            </div>
          </div>
        </CardContent>
        <div className="grid border-t sm:grid-cols-4">
          {[
            ["Saldo da reserva", brl(r.balance), `${r.accounts.length} conta(s) marcada(s)`],
            ["Alvo", brl(r.target), r.settings.targetMode === "MONTHS" ? `${r.settings.targetMonths} × despesa média` : "valor fixo"],
            ["Falta", brl(missing), `${pct(r.pct)} do alvo atingido`],
            ["Despesa média mensal", brl(r.avgMonthlyExpense), "últimos 12 meses fechados"],
          ].map(([label, value, hint], i) => (
            <div key={label} className={cn("grid gap-0.5 px-5 py-4", i > 0 && "border-t sm:border-t-0 sm:border-l")}>
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
              <span className="text-lg font-semibold tracking-tight tabular-nums sensitive">{value}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </div>
          ))}
        </div>
      </Card>

      <form action={saveSettings} className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Contas da reserva</CardTitle>
            <p className="text-sm text-muted-foreground">A reserva soma o saldo atual das contas marcadas.</p>
          </CardHeader>
          <CardContent className="grid">
            {active.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-3 border-b py-3 last:border-0">
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{TYPE_LABEL[a.type]} · {a.institution ?? "manual"}</span>
                </span>
                <Money value={a.balance} className="text-sm font-medium" />
                <input type="checkbox" name="reserveAccountIds" value={a.id} defaultChecked={a.isEmergencyReserve} className="size-4 accent-primary" aria-label={`Compõe a reserva: ${a.name}`} />
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Alvo da reserva</CardTitle>
            <p className="text-sm text-muted-foreground">Escolha como definir o valor ideal.</p>
          </CardHeader>
          <CardContent className="grid gap-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-checked:border-primary has-checked:bg-primary/5">
              <input type="radio" name="targetMode" value="MONTHS" defaultChecked={r.settings.targetMode === "MONTHS"} className="mt-0.5 size-4 accent-primary" />
              <span className="grid flex-1 gap-2.5">
                <span className="grid">
                  <span className="text-sm font-medium">Meses de despesa média</span>
                  <span className="text-xs text-muted-foreground">Acompanha automaticamente seu custo de vida.</span>
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="number" name="targetMonths" required min={1} max={60} defaultValue={r.settings.targetMonths} aria-label="Meses" className={cn(fieldClass, "w-20 text-center tabular-nums")} />
                  meses × <span className="tabular-nums sensitive">{brl(r.avgMonthlyExpense)}</span>
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-checked:border-primary has-checked:bg-primary/5">
              <input type="radio" name="targetMode" value="FIXED" defaultChecked={r.settings.targetMode === "FIXED"} className="mt-0.5 size-4 accent-primary" />
              <span className="grid flex-1 gap-2.5">
                <span className="grid">
                  <span className="text-sm font-medium">Valor fixo</span>
                  <span className="text-xs text-muted-foreground">Um valor em reais que não muda com as despesas.</span>
                </span>
                <input type="number" name="targetAmount" min="0" step="0.01" defaultValue={r.settings.targetAmount ?? ""} placeholder="R$ 0,00" aria-label="Valor fixo do alvo" className={cn(fieldClass, "max-w-52")} />
              </span>
            </label>
            <Button type="submit" className="h-9 justify-self-end">Salvar</Button>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle className="font-semibold">Despesa mensal · últimos 12 meses</CardTitle>
            <p className="text-sm text-muted-foreground">Base da média. Exclui transferências e transações ignoradas.</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-4 border-t-2 border-dashed border-primary" />
            Média <span className="tabular-nums sensitive">{brl(r.avgMonthlyExpense)}</span>
          </span>
        </CardHeader>
        <CardContent>
          <MonthlyExpenseChart data={r.expenseByMonth} average={r.avgMonthlyExpense} />
        </CardContent>
      </Card>
    </div>
  )
}
