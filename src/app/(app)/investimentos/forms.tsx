"use client"

import { useState } from "react"
import { CancelLink, Field, fieldClass, FormActions } from "@/components/bits"
import { FormSelect } from "@/components/form-select"
import { Button } from "@/components/ui/button"
import { CLASS_INFO, CLASS_ORDER, classFromCode, isIncome, isVariable, TRADE_LABEL, type AssetClass, type TradeType } from "@/lib/domain/investments"
import { brl } from "@/lib/format"
import { cn } from "@/lib/utils"

// Formulários da tela de Investimentos (abertos em modal pela URL). Mostram só os campos que a categoria
// ou o tipo de operação pedem; a validação de verdade fica nas Server Actions.

type Action = (form: FormData) => Promise<void>

const classOptions = CLASS_ORDER.map((c) => ({ value: c, label: CLASS_INFO[c].label, color: CLASS_INFO[c].color }))
const num = (v: string) => Number(v.replace(",", ".")) || 0
const Money = ({ name, label, hint, defaultValue, onChange, required }: { name: string; label: string; hint?: string; defaultValue?: number | null; onChange?: (v: string) => void; required?: boolean }) => (
  <Field label={label} hint={hint}>
    <span className={cn(fieldClass, "flex items-center gap-2 text-base md:text-sm")}>
      <span className="font-semibold text-muted-foreground">R$</span>
      <input name={name} type="number" step="0.01" min="0" inputMode="decimal" required={required} defaultValue={defaultValue ?? undefined} onChange={(e) => onChange?.(e.target.value)} className="min-w-0 flex-1 bg-transparent text-right font-semibold tabular-nums outline-none" placeholder="0,00" />
    </span>
  </Field>
)

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-lg bg-muted p-[3px]" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={cn("h-8 flex-1 rounded-md text-sm font-semibold text-muted-foreground", value === o.value && "bg-card text-foreground shadow-sm")}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Novo ativo manual: categoria, identificação e a primeira compra/aplicação. */
export function NewInvestmentForm({ action, back, today }: { action: Action; back: string; today: string }) {
  const [cls, setCls] = useState<AssetClass>("CRIPTO")
  const [code, setCode] = useState("")
  const [qty, setQty] = useState("")
  const [price, setPrice] = useState("")
  const variable = isVariable(cls)
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="assetClass" value={cls} />
      <Field label="Categoria">
        <FormSelect value={cls} onValueChange={(v) => setCls(v as AssetClass)} options={classOptions} aria-label="Categoria" />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3">
        <Field label={variable ? "Ticker" : "Código (opcional)"} hint={cls === "CRIPTO" ? "BTC, ETH, SOL…" : variable ? "Como na B3: PETR4, MXRF11" : undefined}>
          <input
            name="code"
            value={code}
            onChange={(e) => {
              const v = e.target.value.toUpperCase()
              setCode(v)
              const guess = classFromCode(v)
              if (guess && cls !== "CRIPTO") setCls(guess)
            }}
            required={variable}
            maxLength={20}
            autoComplete="off"
            className={cn(fieldClass, "font-semibold uppercase")}
          />
        </Field>
        <Field label="Nome">
          <input name="name" required maxLength={200} placeholder={variable ? "Bitcoin" : "CDB Banco X 110% CDI"} className={fieldClass} />
        </Field>
      </div>
      <Field label="Onde está" hint="Corretora ou carteira que não conecta pelo Open Finance">
        <input name="broker" maxLength={200} placeholder={cls === "CRIPTO" ? "Binance" : "Corretora"} className={fieldClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={variable ? "Data da compra" : "Data da aplicação"}>
          <input type="date" name="date" required defaultValue={today} max={today} className={fieldClass} />
        </Field>
        {variable ? (
          <Field label="Quantidade">
            <input name="quantity" type="number" step="any" min="0" inputMode="decimal" required value={qty} onChange={(e) => setQty(e.target.value)} className={cn(fieldClass, "text-right tabular-nums")} />
          </Field>
        ) : (
          <Money name="amount" label="Valor aplicado" required />
        )}
      </div>
      {variable ? (
        <div className="grid grid-cols-2 gap-3">
          <Money name="price" label="Preço unitário" required onChange={setPrice} />
          <Money name="fees" label="Taxas" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Taxa" hint="Ex.: 110% CDI, IPCA + 6%">
            <input name="rateLabel" maxLength={60} className={fieldClass} />
          </Field>
          <Field label="Vencimento">
            <input type="date" name="dueDate" className={fieldClass} />
          </Field>
        </div>
      )}
      {variable && (
        <div className="flex items-baseline justify-between rounded-lg bg-muted px-3 py-2.5">
          <span className="text-sm font-medium text-muted-foreground">Total investido</span>
          <span className="text-lg font-bold tabular-nums sensitive">{brl(num(qty) * num(price))}</span>
        </div>
      )}
      <FormActions>
        <CancelLink href={back} />
        <Button type="submit" size="lg">Salvar ativo</Button>
      </FormActions>
    </form>
  )
}

type AssetOption = { id: number; label: string; assetClass: AssetClass; manual: boolean; quantity: number | null }

/** Compra, venda, bonificação ou provento de um ativo da carteira. */
export function TradeForm({ action, back, today, assets, defaultId }: { action: Action; back: string; today: string; assets: AssetOption[]; defaultId?: number }) {
  const [id, setId] = useState(String(defaultId ?? assets[0]?.id ?? ""))
  const asset = assets.find((a) => String(a.id) === id)
  const allowed: TradeType[] = asset?.manual ? ["BUY", "SELL", "DIVIDEND", "JCP", "YIELD", "INTEREST", "BONUS"] : ["DIVIDEND", "JCP", "YIELD", "INTEREST"]
  const [type, setType] = useState<TradeType>(allowed[0])
  const t = allowed.includes(type) ? type : allowed[0]
  const variable = asset ? isVariable(asset.assetClass) : false
  const byQty = variable && (t === "BUY" || t === "SELL")
  const [qty, setQty] = useState("")
  const [price, setPrice] = useState("")
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="type" value={t} />
      <Field label="Ativo">
        <FormSelect name="investmentId" value={id} onValueChange={setId} options={assets.map((a) => ({ value: String(a.id), label: a.label, color: CLASS_INFO[a.assetClass].color }))} aria-label="Ativo" />
      </Field>
      {asset?.manual ? (
        <Segmented label="Operação" value={isIncome(t) ? "INCOME" : t} onChange={(v) => setType(v === "INCOME" ? "DIVIDEND" : (v as TradeType))} options={[{ value: "BUY", label: "Compra" }, { value: "SELL", label: "Venda" }, { value: "INCOME", label: "Provento" }, ...(variable ? [{ value: "BONUS", label: "Bonificação" }] : [])]} />
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">A posição deste ativo vem da corretora pela Pluggy. Aqui você lança proventos que não chegaram automaticamente.</p>
      )}
      {isIncome(t) && (
        <Field label="Tipo de provento">
          <FormSelect value={t} onValueChange={(v) => setType(v as TradeType)} options={(["DIVIDEND", "JCP", "YIELD", "INTEREST"] as const).map((x) => ({ value: x, label: TRADE_LABEL[x] }))} aria-label="Tipo de provento" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={isIncome(t) ? "Data do pagamento" : "Data"} hint={isIncome(t) ? "Data futura = provento anunciado" : undefined}>
          <input type="date" name="date" required defaultValue={today} max={isIncome(t) ? undefined : today} className={fieldClass} />
        </Field>
        {byQty || t === "BONUS" || (isIncome(t) && variable) ? (
          <Field label={t === "BONUS" ? "Quantidade recebida" : isIncome(t) ? "Cotas (opcional)" : "Quantidade"} hint={t === "SELL" && asset?.quantity ? `Você tem ${asset.quantity.toLocaleString("pt-BR")}` : undefined}>
            <input name="quantity" type="number" step="any" min="0" inputMode="decimal" required={byQty || t === "BONUS"} value={qty} onChange={(e) => setQty(e.target.value)} className={cn(fieldClass, "text-right tabular-nums")} />
          </Field>
        ) : (
          <Money name="amount" label={t === "SELL" ? "Valor resgatado" : t === "BUY" ? "Valor aplicado" : "Valor recebido"} required />
        )}
      </div>
      {byQty && (
        <div className="grid grid-cols-2 gap-3">
          <Money name="price" label="Preço unitário" required onChange={setPrice} />
          <Money name="fees" label="Taxas" />
        </div>
      )}
      {t === "BONUS" && <Money name="amount" label="Custo atribuído" hint="Valor que a empresa informa por ação × quantidade" />}
      {isIncome(t) && variable && <Money name="amount" label="Valor recebido" required />}
      <Field label="Observação">
        <input name="note" maxLength={200} className={fieldClass} />
      </Field>
      {byQty && (
        <div className="flex items-baseline justify-between rounded-lg bg-muted px-3 py-2.5">
          <span className="text-sm font-medium text-muted-foreground">{t === "SELL" ? "Total recebido" : "Total investido"}</span>
          <span className="text-lg font-bold tabular-nums sensitive">{brl(num(qty) * num(price))}</span>
        </div>
      )}
      <FormActions>
        <CancelLink href={back} />
        <Button type="submit" size="lg" disabled={!asset}>Salvar lançamento</Button>
      </FormActions>
    </form>
  )
}

/** Alocação-alvo: % por categoria; só salva quando a soma fecha em 100. */
export function TargetsForm({ action, back, current, targets }: { action: Action; back: string; current: Record<string, number>; targets: Record<string, number> }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(CLASS_ORDER.map((c) => [c, targets[c] ? String(targets[c]) : ""])))
  const sum = Object.values(values).reduce((s, v) => s + num(v), 0)
  const empty = sum === 0
  const ok = empty || Math.abs(sum - 100) < 0.01
  const shown = CLASS_ORDER.filter((c) => current[c] || targets[c] || !["FUNDOS", "ETF", "OUTROS"].includes(c))
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="back" value={back} />
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {CLASS_ORDER.map((c) => num(values[c]) > 0 && <span key={c} style={{ width: `${num(values[c])}%`, background: CLASS_INFO[c].color }} />)}
      </div>
      <div className="grid">
        <div className="grid grid-cols-[minmax(0,1fr)_64px_112px] gap-3 pb-1 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
          <span>Categoria</span>
          <span className="text-right">Hoje</span>
          <span className="text-right">Alvo</span>
        </div>
        {shown.map((c) => (
          <label key={c} className="grid grid-cols-[minmax(0,1fr)_64px_112px] items-center gap-3 border-t py-1.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="size-2.5 rounded-[3px]" style={{ background: CLASS_INFO[c].color }} />
              {CLASS_INFO[c].label}
            </span>
            <span className="text-right text-sm text-muted-foreground tabular-nums">{((current[c] ?? 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
            <span className={cn(fieldClass, "flex items-center gap-1")}>
              <input name={`t_${c}`} type="number" step="0.5" min="0" max="100" inputMode="decimal" value={values[c]} onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))} aria-label={`Alvo de ${CLASS_INFO[c].label}`} className="min-w-0 flex-1 bg-transparent text-right font-semibold tabular-nums outline-none" placeholder="0" />
              <span className="text-muted-foreground">%</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <span className="flex items-center gap-2 text-sm">
          <span className="font-medium text-muted-foreground">Soma</span>
          <b className="tabular-nums">{sum.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b>
          <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", ok ? "bg-income/10 text-income" : "bg-amber-500/10 text-warning")}>
            {empty ? "Sem alvo" : ok ? "Fecha em 100%" : sum > 100 ? `Passou ${(sum - 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pp` : `Faltam ${(100 - sum).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pp`}
          </span>
        </span>
      </div>
      <FormActions>
        <CancelLink href={back} />
        <Button type="submit" size="lg" disabled={!ok}>Salvar alvo</Button>
      </FormActions>
    </form>
  )
}
