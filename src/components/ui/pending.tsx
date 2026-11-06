"use client"

import { Loader2 } from "lucide-react"
import { useEffect } from "react"
import { useFormStatus } from "react-dom"

// Atualização em andamento (DESIGN.md › Carregamento): enquanto uma ação grava, o <html> leva data-busy e o
// globals.css apaga e bloqueia a tela. Contador porque duas ações podem rodar juntas.
let busy = 0

export function useBusy(on: boolean) {
  useEffect(() => {
    if (!on) return
    const root = document.documentElement
    busy++
    root.dataset.busy = ""
    return () => {
      if (--busy === 0) delete root.dataset.busy
    }
  }, [on])
}

/** Ícone girando no lugar do ícone do botão. */
export const Spinner = () => <Loader2 data-pending className="animate-spin" aria-hidden />

/** Dentro de um botão de envio: mostra o spinner enquanto o formulário pai grava e bloqueia a tela. */
export function FormPending() {
  const { pending } = useFormStatus()
  useBusy(pending)
  return pending ? <Spinner /> : null
}

/** Para formulários sem botão (seletor que envia ao escolher): só bloqueia a tela enquanto grava. */
export function FormBusy() {
  useBusy(useFormStatus().pending)
  return null
}
