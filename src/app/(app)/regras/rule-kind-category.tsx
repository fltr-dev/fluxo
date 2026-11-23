"use client"

import { Eye, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { accountGroups } from "@/components/account-avatar"
import { Field, fieldClass, Money } from "@/components/bits"
import { FormSelect, SubcategorySelect } from "@/components/form-select"
import { dateBR } from "@/lib/format"
import { cn } from "@/lib/utils"
import { previewRule, saveRule, type RuleDraft } from "./actions"

type Kind = "" | "EXPENSE" | "INCOME"
type MatchType = RuleDraft["matchType"]
type SubOption = Parameters<typeof SubcategorySelect>[0]["options"][number]
type Preview = Awaited<ReturnType<typeof previewRule>>

const MATCH_SHORT: Record<MatchType, string> = { CONTAINS: "Contém", STARTS_WITH: "Começa com", EQUALS: "Igual a", REGEX: "Regex" }
const MATCH_HINT: Record<MatchType, string> = {
  CONTAINS: "Não diferencia maiúsculas, minúsculas nem acentos.",
  STARTS_WITH: "Não diferencia maiúsculas, minúsculas nem acentos.",
  EQUALS: "A descrição inteira igual ao texto, sem diferenciar maiúsculas, acentos nem espaços extras.",
  REGEX: "Não diferencia maiúsculas de minúsculas.",
}
const STATUS = { change: "será recategorizada", user: "categorizada por você (mantida)", same: "sem mudança" }

type Props = {
  rule: Partial<Omit<RuleDraft, "subcategoryId">> & { subcategoryId?: number | null }
  accounts: Parameters<typeof accountGroups>[0]
  options: SubOption[]
}

const num = (s: string) => (s.trim() === "" ? null : Number(s))

/**
 * Formulário da regra com prévia ao vivo: a cada mudança (pausa de 300 ms) conta quantas transações existentes a
 * regra recategorizaria. Tipo e categoria andam juntos: com Despesa só aparecem categorias de despesa (e vice-versa);
 * trocar o tipo limpa a categoria que deixou de servir.
 */
export function RuleForm({ rule, accounts, options }: Props) {
  const [matchType, setMatchType] = useState<MatchType>(rule.matchType ?? "CONTAINS")
  const [pattern, setPattern] = useState(rule.pattern ?? "")
  const [accountId, setAccountId] = useState(String(rule.accountId ?? ""))
  const [kind, setKind] = useState<Kind>((rule.kind ?? "") as Kind)
  const [min, setMin] = useState(rule.minAmount != null ? String(rule.minAmount) : "")
  const [max, setMax] = useState(rule.maxAmount != null ? String(rule.maxAmount) : "")
  const [sub, setSub] = useState<string | null>(rule.subcategoryId ? String(rule.subcategoryId) : null)
  const [priority, setPriority] = useState(String(rule.priority ?? 100))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const visible = kind ? options.filter((o) => o.kind === kind) : options

  useEffect(() => {
    let stale = false
    const t = window.setTimeout(() => {
      setLoading(true)
      previewRule({
        id: rule.id,
        matchType,
        pattern,
        accountId: accountId ? Number(accountId) : null,
        kind: kind || null,
        minAmount: num(min),
        maxAmount: num(max),
        priority: Number(priority) || 0,
        subcategoryId: sub ? Number(sub) : null,
      })
        .then((p) => !stale && setPreview(p))
        .catch(() => !stale && setPreview(null))
        .finally(() => !stale && setLoading(false))
    }, 300)
    return () => {
      stale = true
      window.clearTimeout(t)
    }
  }, [rule.id, matchType, pattern, accountId, kind, min, max, priority, sub])

  function changeKind(next: Kind) {
    setKind(next)
    const chosen = options.find((o) => String(o.id) === sub)
    if (next && chosen && chosen.kind !== next) setSub(null)
  }

  return (
    <form id="rule-form" action={saveRule} className="grid gap-4">
      {rule.id && <input type="hidden" name="id" value={rule.id} />}
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Descrição da transação</legend>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-[3px]">
          {(Object.keys(MATCH_SHORT) as MatchType[]).map((v) => (
            <label key={v} className="flex h-8 cursor-pointer items-center justify-center rounded-md px-1 text-center text-sm font-medium text-muted-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm">
              <input type="radio" name="matchType" value={v} checked={matchType === v} onChange={() => setMatchType(v)} className="sr-only" />
              {MATCH_SHORT[v]}
            </label>
          ))}
        </div>
        <input name="pattern" required maxLength={200} value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Padrão" placeholder="Ex.: UBER" className={cn(fieldClass, "mt-1 font-mono")} />
        <span className="text-xs text-muted-foreground">{MATCH_HINT[matchType]}</span>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Conta">
          <FormSelect name="accountId" value={accountId} onValueChange={setAccountId} emptyLabel="Qualquer conta" groups={accountGroups(accounts)} />
        </Field>
        <Field label="Tipo">
          <FormSelect
            name="kind"
            value={kind}
            onValueChange={(v) => changeKind(v as Kind)}
            emptyLabel="Qualquer"
            options={[
              { value: "EXPENSE", label: "Despesa" },
              { value: "INCOME", label: "Receita" },
            ]}
          />
        </Field>
        <Field label="Valor mínimo (R$)">
          <input type="number" name="minAmount" min={0} step="0.01" value={min} onChange={(e) => setMin(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Valor máximo (R$)">
          <input type="number" name="maxAmount" min={0} step="0.01" value={max} onChange={(e) => setMax(e.target.value)} className={fieldClass} />
        </Field>
      </div>
      <Field label="Categorizar como">
        <SubcategorySelect name="subcategoryId" options={visible} required value={sub} onValueChange={(v) => setSub(v || null)} placeholder="Escolha…" />
      </Field>
      <Field label="Prioridade" hint="Menor número vence quando duas regras casam.">
        <input type="number" name="priority" min={0} max={10000} value={priority} onChange={(e) => setPriority(e.target.value)} className={cn(fieldClass, "w-28")} />
      </Field>

      <section className="grid gap-3 rounded-xl border bg-muted/40 p-4" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Eye className="size-4" />
            Prévia
            {loading && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" aria-label="Calculando" />}
          </span>
          <span className="rounded-full bg-income/10 px-2 py-0.5 text-xs font-medium text-income tabular-nums">{preview?.total ?? 0} transações</span>
        </div>
        {preview && preview.total > 0 ? (
          <>
            <p className="text-sm">
              <span className="font-medium tabular-nums">{preview.change}</span> serão recategorizadas
              {preview.user > 0 && (
                <span className="text-muted-foreground"> · <span className="tabular-nums">{preview.user}</span> categorizadas por você (mantidas)</span>
              )}
            </p>
            <ul className="grid text-sm">
              {preview.sample.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 border-b py-1.5 last:border-0">
                  <span className="grid min-w-0">
                    <span className="truncate font-mono text-xs">{t.description}</span>
                    <span className="text-xs text-muted-foreground">{dateBR(t.date)} · {STATUS[t.status]}</span>
                  </span>
                  <Money value={t.amount} className="shrink-0 font-medium" />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{pattern.trim() ? "Nenhuma transação existente casa com esta regra." : "Digite o texto da descrição para ver quais transações a regra pega."}</p>
        )}
      </section>

      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="apply" defaultChecked className="mt-0.5 size-4 accent-primary" />
        <span className="grid">
          <span className="font-medium">
            Aplicar às {preview?.change ? <span className="tabular-nums">{preview.change} </span> : ""}transações existentes
          </span>
          <span className="text-xs text-muted-foreground">Sem marcar, a regra vale só para as transações novas. As categorizadas por você nunca mudam.</span>
        </span>
      </label>
    </form>
  )
}
