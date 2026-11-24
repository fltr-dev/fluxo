"use client"

import { DateInput } from "@/components/date-input"
import { Lock, Plus, X } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Field, fieldClass, FormActions, hide } from "@/components/bits"
import { FormSelect } from "@/components/form-select"
import { Button, buttonVariants } from "@/components/ui/button"
import { addDays, daysBetween, today } from "@/lib/domain/dates"
import { occurrences, splitAmount, stepDate, type Recurrence } from "@/lib/domain/debts"
import { brl, dateBR, parseMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { RELATIONS } from "./shared"

// Formulário de nova dívida / edição (abre em modal pela URL). Itens e regra de vencimento são dinâmicos, então
// tudo vai num JSON em `payload`; quem valida de verdade é debtInput na Server Action.

type Item = { description: string; quantity: number; unitAmount: number; date?: string }

export type DebtFormValue = {
  id?: number
  creditor: string
  relation: string
  description: string
  items: Item[]
  mode: "LUMP" | "INSTALLMENTS" | "FLEX" | "RECUR"
  installments: number
  kind: "FIXED_DAY" | "AFTER_SALARY" | "DATE" | "NONE"
  day: number
  offsetDays: number
  date: string
  remindDaysBefore: number | null
  /** RECUR: `start` só na criação (gera os itens até hoje); `next` é a próxima a entrar sozinha; `end` "" = sem fim. */
  recur: Recurrence & { label: string; amount: number; start: string; next: string | null; end: string }
  /** Datas das parcelas já pagas (recorrente): esses itens ficam travados no formulário. */
  paidDates?: string[]
}

export const EMPTY_DEBT: DebtFormValue = {
  creditor: "",
  relation: "",
  description: "",
  items: [{ description: "", quantity: 1, unitAmount: 0 }],
  mode: "INSTALLMENTS",
  installments: 1,
  kind: "FIXED_DAY",
  day: 5,
  offsetDays: 1,
  date: "",
  remindDaysBefore: 1,
  recur: { every: 1, unit: "MONTH", label: "", amount: 0, start: "", next: null, end: "" },
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-lg bg-muted p-[3px]" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={cn("h-8 flex-1 rounded-md px-1 text-[13px] font-semibold text-muted-foreground transition-colors sm:text-sm", value === o.value && "bg-card text-foreground shadow-sm")}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const REMIND = [
  { value: 0, label: "No dia" },
  { value: 1, label: "1 dia antes" },
  { value: 3, label: "3 dias antes" },
  { value: -1, label: "Sem aviso" },
]
const num = (v: string) => Number(v.replace(",", ".")) || 0
const toText = (n: number) => (n ? n.toFixed(2).replace(".", ",") : "")

/** Valor em reais: aceita só números e uma vírgula (até 2 casas); colar "R$ 1.234,56" vira 1234,56. */
function MoneyInput({ value, onChange, label, disabled, className }: { value: number; onChange: (n: number) => void; label: string; disabled?: boolean; className?: string }) {
  const [text, setText] = useState(() => toText(value))
  // o valor pode mudar por fora (item removido acima, valor da recorrência aplicado): o texto acompanha
  if (parseMoney(text) !== value) setText(toText(value))
  const set = (t: string) => {
    setText(t)
    onChange(parseMoney(t))
  }
  return (
    <span className={cn(fieldClass, "flex items-center gap-1 px-2 text-base md:text-sm", disabled && "opacity-60", className)}>
      <span className="text-muted-foreground">R$</span>
      <input
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        required
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const [int, ...dec] = e.target.value.replace(/\./g, ",").replace(/[^\d,]/g, "").split(",")
          set(dec.length ? `${int},${dec.join("").slice(0, 2)}` : int)
        }}
        onPaste={(e) => {
          e.preventDefault()
          const n = parseMoney(e.clipboardData.getData("text"))
          set(n ? n.toFixed(2).replace(".", ",") : "")
        }}
        className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none"
        placeholder="0,00"
      />
    </span>
  )
}

/** Itens da recorrência de `start` até hoje (ou o fim, se vier antes) e a próxima data depois deles. */
function generate(r: DebtFormValue["recur"]) {
  if (!r.start) return { items: [] as Item[], next: null }
  const now = today()
  const { dates, next } = occurrences(r.start, r, r.end && r.end < now ? r.end : now)
  return { items: dates.map((date) => ({ description: r.label, quantity: 1, unitAmount: r.amount, date })), next: r.end && next > r.end ? null : next }
}

export function DebtForm({ action, initial, closeHref, editing, start }: { action: (form: FormData) => Promise<void>; initial: DebtFormValue; closeHref: string; editing?: boolean; start?: React.ReactNode }) {
  const [v, setV] = useState(initial)
  // Data remarcada aguardando "só esta" ou "deslocar as próximas"
  const [shift, setShift] = useState<{ index: number; from: string; to: string } | null>(null)
  const set = <K extends keyof DebtFormValue>(k: K, val: DebtFormValue[K]) => setV((s) => ({ ...s, [k]: val }))
  const recur = v.mode === "RECUR"
  const total = Math.round(v.items.reduce((t, i) => t + i.quantity * Math.round(i.unitAmount * 100), 0)) / 100
  const n = v.mode === "LUMP" ? 1 : v.installments
  const part = n > 0 && total > 0 ? splitAmount(total, n)[0] : 0
  const setItem = (i: number, patch: Partial<Item>) => set("items", v.items.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  // Itens já pagos (recorrente) não mudam: a parcela paga é casada com o item pela data
  const paidLeft = [...(v.paidDates ?? [])]
  const locked = v.items.map((it) => {
    const k = it.date ? paidLeft.indexOf(it.date) : -1
    if (k >= 0) paidLeft.splice(k, 1)
    return k >= 0
  })

  /** Muda a recorrência. Na criação refaz os itens a partir do início; na edição só a próxima data acompanha. */
  function setRecur(patch: Partial<DebtFormValue["recur"]>) {
    setV((s) => {
      const r = { ...s.recur, ...patch }
      if (!editing) {
        const sameRule = r.start === s.recur.start && r.every === s.recur.every && r.unit === s.recur.unit && r.end === s.recur.end
        if (sameRule && s.items.every((it) => it.date))
          // descrição e valor novos valem para os itens que ainda estavam com os antigos
          return { ...s, recur: r, items: s.items.map((it) => ({ ...it, description: it.description === s.recur.label ? r.label : it.description, unitAmount: it.unitAmount === s.recur.amount ? r.amount : it.unitAmount })) }
        const g = generate(r)
        return { ...s, recur: { ...r, next: g.next }, items: g.items }
      }
      if (patch.every === undefined && patch.unit === undefined && patch.end === undefined) return { ...s, recur: r }
      const last = s.items.map((it) => it.date ?? "").sort().at(-1)
      const next = last ? stepDate(last, r) : r.next
      return { ...s, recur: { ...r, next: next && r.end && next > r.end ? null : next } }
    })
  }

  function setMode(m: DebtFormValue["mode"]) {
    setShift(null)
    if (m === "RECUR" && !editing) {
      const r = { ...v.recur, label: v.recur.label || v.items[0]?.description || "", amount: v.recur.amount || v.items[0]?.unitAmount || 0 }
      const g = generate(r)
      setV((s) => ({ ...s, mode: m, recur: { ...r, next: g.next }, items: g.items }))
    } else if (v.mode === "RECUR" && !v.items.length) setV((s) => ({ ...s, mode: m, items: [{ description: s.recur.label, quantity: 1, unitAmount: s.recur.amount }] }))
    else set("mode", m)
  }

  function moveDate(i: number, to: string) {
    const from = v.items[i].date
    setItem(i, { date: to })
    // a pergunta só faz sentido se há algo depois da data antiga para deslocar
    const after = v.items.some((it, j) => j !== i && !locked[j] && it.date && from && it.date > from) || (from && v.recur.next && v.recur.next > from)
    setShift(from && to && after ? { index: i, from, to } : null)
  }

  function shiftFollowing() {
    if (!shift) return
    const delta = daysBetween(shift.from, shift.to)
    setV((s) => ({
      ...s,
      items: s.items.map((it, j) => (j !== shift.index && !locked[j] && it.date && it.date > shift.from ? { ...it, date: addDays(it.date, delta) } : it)),
      recur: { ...s.recur, next: s.recur.next && s.recur.next > shift.from ? addDays(s.recur.next, delta) : s.recur.next },
    }))
    setShift(null)
  }

  const payload = JSON.stringify({
    id: v.id,
    creditor: v.creditor,
    relation: v.relation || null,
    description: v.description || null,
    // recorrente: item sem descrição própria (no celular o campo nem aparece) leva a da recorrência
    items: v.items.map((it) => (recur ? { ...it, description: it.description.trim() || v.recur.label } : { ...it, date: null })),
    mode: v.mode,
    installments: v.mode === "INSTALLMENTS" ? v.installments : 1,
    schedule: { kind: v.mode === "FLEX" || recur ? "NONE" : v.kind, day: v.kind === "FIXED_DAY" ? v.day : null, offsetDays: v.offsetDays, date: v.kind === "DATE" ? v.date : null },
    recur: recur ? { every: v.recur.every, unit: v.recur.unit, label: v.recur.label, amount: v.recur.amount, next: v.recur.next, end: v.recur.end || null } : null,
    remindDaysBefore: v.mode === "FLEX" || (!recur && v.kind === "NONE") || v.remindDaysBefore === -1 ? null : v.remindDaysBefore,
  })

  const reminders = (
    <div className="mt-1 grid gap-1.5">
      <span className="text-sm font-medium">Lembrete</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lembrete">
        {REMIND.map((r) => (
          <button key={r.value} type="button" aria-pressed={(v.remindDaysBefore ?? -1) === r.value} onClick={() => set("remindDaysBefore", r.value)} className={cn("h-8 rounded-full border px-3 text-sm font-medium text-muted-foreground", (v.remindDaysBefore ?? -1) === r.value && "border-primary bg-primary/10 text-primary")}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )

  const items = (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Itens da dívida</legend>
      {recur && !v.items.length && <p className="text-sm text-muted-foreground">Nenhuma ocorrência até hoje: os itens entram sozinhos a partir da data de início.</p>}
      <ul className="grid gap-2">
        {v.items.map((it, i) => (
          <li key={i} className="grid gap-2">
            {recur ? (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)_2rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_8rem_2rem]">
                <input aria-label={`Item ${i + 1}`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} maxLength={200} disabled={locked[i]} placeholder={v.recur.label} className={cn(fieldClass, "max-sm:hidden")} />
                <DateInput aria-label={`Data do item ${i + 1}`} required value={it.date ?? ""} disabled={locked[i]} onValueChange={(d) => moveDate(i, d)} className="px-2 pr-9" />
                <MoneyInput label={`Valor do item ${i + 1}`} value={it.unitAmount} disabled={locked[i]} onChange={(unitAmount) => setItem(i, { unitAmount })} />
                {locked[i] ? (
                  <span title="Já paga" className="grid size-8 place-items-center text-muted-foreground">
                    <Lock className="size-3.5" />
                  </span>
                ) : (
                  <button type="button" aria-label={`Remover item ${i + 1}`} onClick={() => (setShift(null), set("items", v.items.filter((_, j) => j !== i)))} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)_4rem_7rem_2rem] items-center gap-2">
                <input aria-label={`Item ${i + 1}`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} required maxLength={200} placeholder="Descrição" className={fieldClass} />
                <input aria-label="Quantidade" type="number" inputMode="numeric" min="1" step="1" value={it.quantity} onChange={(e) => setItem(i, { quantity: Math.max(1, Math.round(num(e.target.value))) })} className={cn(fieldClass, "px-2 text-center")} />
                <MoneyInput label="Valor unitário" value={it.unitAmount} onChange={(unitAmount) => setItem(i, { unitAmount })} />
                <button type="button" aria-label={`Remover item ${i + 1}`} disabled={v.items.length === 1} onClick={() => set("items", v.items.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <X className="size-4" />
                </button>
              </div>
            )}
            {shift?.index === i && (
              <div role="group" aria-label="Remarcação" className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span className="mr-auto">
                  Remarcado de {dateBR(shift.from)} para {dateBR(shift.to)}. E as próximas?
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => setShift(null)}>
                  Só esta
                </Button>
                <Button type="button" size="sm" onClick={shiftFollowing}>
                  Deslocar as próximas
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => set("items", [...v.items, recur ? { description: v.recur.label, quantity: 1, unitAmount: v.recur.amount, date: today() } : { description: "", quantity: 1, unitAmount: 0 }])}
        >
          <Plus /> Adicionar item
        </Button>
        <span className="text-sm text-muted-foreground">
          Total <b className="ml-1 text-base text-foreground tabular-nums">{brl(total)}</b>
        </span>
      </div>
    </fieldset>
  )

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="payload" value={payload} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Para quem você deve">
          <input value={v.creditor} onChange={(e) => set("creditor", e.target.value)} required maxLength={120} placeholder="Ex.: João, Dr. Paulo" className={fieldClass} />
        </Field>
        <Field label="Relação">
          <FormSelect value={v.relation} onValueChange={(x) => set("relation", x)} emptyLabel="Sem relação" options={RELATIONS.map((r) => ({ value: r, label: r }))} aria-label="Relação" />
        </Field>
      </div>
      <Field label="Descrição" hint="Opcional. Ex.: passagens de Salvador, sessões de outubro.">
        <input value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={500} className={fieldClass} />
      </Field>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Como vai pagar</span>
        <Segmented
          label="Como vai pagar"
          value={v.mode}
          onChange={setMode}
          options={[
            { value: "LUMP", label: "De uma vez" },
            { value: "INSTALLMENTS", label: "Parcelado" },
            { value: "FLEX", label: "Quando der" },
            { value: "RECUR", label: "Recorrente" },
          ]}
        />
        {v.mode === "INSTALLMENTS" && (
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              {editing ? "Parcelas restantes" : "Número de parcelas"}
              <input type="number" min="1" max="120" value={v.installments} onChange={(e) => set("installments", Math.min(120, Math.max(1, Math.round(num(e.target.value)))))} className={cn(fieldClass, "w-20 text-center")} />
            </label>
            {part > 0 && <span className="text-muted-foreground">de ~{hide(brl(part))}</span>}
          </div>
        )}
        {v.mode === "FLEX" && <p className="text-xs text-muted-foreground">Sem data nem parcelas: você registra cada pagamento quando fizer.</p>}
        {recur && (
          <div className="grid gap-3">
            <p className="text-xs text-muted-foreground">Cada ocorrência vira um item e uma parcela vencendo na data dela. As próximas entram sozinhas quando a data chega.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cada item é">
                <input value={v.recur.label} onChange={(e) => setRecur({ label: e.target.value })} required maxLength={200} placeholder="Ex.: Sessão" className={fieldClass} />
              </Field>
              <Field label="Valor de cada item">
                <MoneyInput label="Valor de cada item" value={v.recur.amount} onChange={(amount) => setRecur({ amount })} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              A cada
              <input type="number" aria-label="Intervalo" min="1" max="52" value={v.recur.every} onChange={(e) => setRecur({ every: Math.min(52, Math.max(1, Math.round(num(e.target.value)))) })} className={cn(fieldClass, "w-20 text-center")} />
              <div className="w-44">
                <Segmented
                  label="Unidade"
                  value={v.recur.unit}
                  onChange={(unit) => setRecur({ unit })}
                  options={[
                    { value: "WEEK", label: v.recur.every === 1 ? "semana" : "semanas" },
                    { value: "MONTH", label: v.recur.every === 1 ? "mês" : "meses" },
                  ]}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {editing ? (
                <Field label="Próxima ocorrência" hint={v.recur.next ? "Entra sozinha nesta data." : "Encerrada: nenhuma nova ocorrência."}>
                  <DateInput value={v.recur.next ?? ""} onValueChange={(d) => setRecur({ next: d || null })} />
                </Field>
              ) : (
                <Field label="Começa em" hint="Pode ser no passado: os itens até hoje já aparecem abaixo para conferir.">
                  <DateInput required value={v.recur.start} onValueChange={(d) => setRecur({ start: d })} />
                </Field>
              )}
              <Field label="Termina em" hint="Opcional. Sem data, continua até você encerrar.">
                <DateInput value={v.recur.end} min={v.recur.start || undefined} onValueChange={(d) => setRecur({ end: d })} />
              </Field>
            </div>
            {reminders}
          </div>
        )}
      </div>

      {/* itens depois de "Como vai pagar": na recorrente eles saem da regra escolhida acima */}
      {items}

      {v.mode !== "FLEX" && !recur && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">Quando pagar</span>
          <Segmented
            label="Quando pagar"
            value={v.kind}
            onChange={(k) => set("kind", k)}
            options={[
              { value: "FIXED_DAY", label: "Dia fixo" },
              { value: "AFTER_SALARY", label: "Após o salário" },
              { value: "DATE", label: "Data" },
              { value: "NONE", label: "Sem data" },
            ]}
          />
          {v.kind === "FIXED_DAY" && (
            <label className="flex items-center gap-2 text-sm">
              Todo dia
              <input type="number" min="1" max="31" required value={v.day} onChange={(e) => set("day", Math.min(31, Math.max(1, Math.round(num(e.target.value)))))} className={cn(fieldClass, "w-20 text-center")} />
              <span className="text-muted-foreground">do mês</span>
            </label>
          )}
          {v.kind === "AFTER_SALARY" && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input type="number" min="0" max="30" value={v.offsetDays} onChange={(e) => set("offsetDays", Math.min(30, Math.max(0, Math.round(num(e.target.value)))))} className={cn(fieldClass, "w-20 text-center")} />
              dia(s) depois que o salário cair
              <span className="w-full text-xs text-muted-foreground">Usa a entrada na categoria Salário; antes de cair, estima pelo dia dos últimos meses.</span>
            </label>
          )}
          {v.kind === "DATE" && (
            <label className="flex items-center gap-2 text-sm">
              Vence em
              <span className="w-44"><DateInput required value={v.date} onValueChange={(d) => set("date", d)} /></span>
              {v.mode === "INSTALLMENTS" && v.installments > 1 && <span className="text-muted-foreground">e nos meses seguintes</span>}
            </label>
          )}
          {v.kind !== "NONE" && reminders}
        </div>
      )}

      <FormActions start={start}>
        <Link href={closeHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancelar
        </Link>
        <Button type="submit" size="lg" disabled={!v.creditor.trim() || (recur ? !(v.recur.amount > 0) || !v.recur.label.trim() : total <= 0)}>
          {editing ? "Salvar alterações" : "Salvar dívida"}
        </Button>
      </FormActions>
    </form>
  )
}
