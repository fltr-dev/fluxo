"use client"

import { toast } from "sonner"
import { restoreCategories, type Undo } from "@/app/(app)/transacoes/actions"

/** Toast "Desfazer" depois de categorizar: devolve as transações ao estado anterior. */
export function toastUndo(r: Undo | undefined) {
  if (!r?.undo.length) return
  toast(r.message, {
    action: {
      label: "Desfazer",
      onClick: () => {
        restoreCategories(r.undo).then(
          () => toast("Desfeito"),
          () => toast.error("Não foi possível desfazer. Tente de novo."),
        )
      },
    },
  })
}

/** <form> cuja ação devolve o que desfazer (ex.: categorizar na linha da tabela). */
export function UndoForm({ action, ...props }: Omit<React.ComponentProps<"form">, "action"> & { action: (f: FormData) => Promise<Undo | undefined> }) {
  return <form {...props} action={async (f) => toastUndo(await action(f))} />
}
