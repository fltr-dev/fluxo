import { redirect } from "next/navigation"
import { AccountFields } from "@/components/account-fields"
import { Field, Money } from "@/components/bits"
import { FormSelect } from "@/components/form-select"
import { RouteSheet } from "@/components/route-overlay"
import { Button } from "@/components/ui/button"
import { ACCOUNT_TYPES } from "@/lib/account-types"
import type { listAccounts } from "@/lib/queries"
import { updateAccount } from "./actions"

type Account = Awaited<ReturnType<typeof listAccounts>>[number]

/** Volta para a tela de origem só se for desta seção (evita redirecionamento aberto). */
export const backToContas = (form: FormData, fallback = "/contas") => {
  const next = String(form.get("next") ?? "")
  return next === "/contas" || next.startsWith("/contas/") || next.startsWith("/contas?") ? next : fallback
}

async function updateAndClose(form: FormData) {
  "use server"
  await updateAccount(form)
  redirect(backToContas(form))
}

/** Painel lateral "Editar conta": apelido, banco (logo + cor), cor própria, tipo, reserva e arquivamento. */
export function AccountEditSheet({ account, closeHref }: { account: Account; closeHref: string }) {
  return (
    <RouteSheet closeHref={closeHref} title="Editar conta" description={account.source === "PLUGGY" ? `Importada · ${account.institution ?? "Pluggy"}` : "Conta manual"}>
      <form action={updateAndClose} className="grid gap-4">
        <input type="hidden" name="id" value={account.id} />
        <input type="hidden" name="next" value={closeHref} />
        <AccountFields key={account.id} defaultName={account.name} defaultBank={account.bank} defaultColor={account.color} institution={account.institution} />
        <Field label="Tipo">
          <FormSelect name="type" defaultValue={account.type} options={Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }))} />
        </Field>
        {account.source === "MANUAL" ? (
          <Field label="Saldo inicial (R$)" hint={`Saldo atual: ${account.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}>
            <input type="number" name="openingBalance" step="0.01" defaultValue={account.openingBalance} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30" />
          </Field>
        ) : (
          <div className="flex justify-between rounded-xl bg-muted p-3 text-sm">
            <span className="text-muted-foreground">Saldo (vem do banco)</span>
            <Money value={account.balance} className="font-medium" />
          </div>
        )}
        <label className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
          <span className="grid">
            <span className="text-sm font-medium">Compõe a reserva de emergência</span>
            <span className="text-xs text-muted-foreground">O saldo entra no cálculo da reserva.</span>
          </span>
          <input type="checkbox" name="isEmergencyReserve" defaultChecked={account.isEmergencyReserve} className="size-4 accent-primary" />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
          <span className="grid">
            <span className="text-sm font-medium">Arquivada</span>
            <span className="text-xs text-muted-foreground">Some do patrimônio, da sidebar e dos seletores; o histórico fica.</span>
          </span>
          <input type="checkbox" name="archived" defaultChecked={account.archived} className="size-4 accent-primary" />
        </label>
        <Button type="submit" className="h-9">Salvar</Button>
      </form>
    </RouteSheet>
  )
}
