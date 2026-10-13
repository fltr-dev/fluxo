"use client"

/** <select> que envia o formulário ao mudar (edição rápida de categoria). */
export function AutoSubmitSelect(props: React.ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
}
