import "server-only"
import type { JevResult } from "./domain/categorize"

// ponytail: o Jev está em early access e sem API pública documentada. O formato de request/response
// abaixo é provisório e fica todo neste arquivo; ajustar quando houver acesso. Sem JEV_API_KEY, fica desligado.

export const jevEnabled = () => Boolean(process.env.JEV_API_KEY && process.env.JEV_API_URL)

export const jevThresholds = () => ({
  accept: Number(process.env.JEV_ACCEPT_THRESHOLD ?? 0.85),
  suggest: Number(process.env.JEV_SUGGEST_THRESHOLD ?? 0.6),
})

export type JevInput = {
  description: string
  amount: number
  account: string
  pluggyCategory: string | null
  options: { id: number; label: string }[]
  examples: { description: string; label: string }[]
}

/** Nunca lança: erro, timeout (> 2s) ou resposta fora do schema viram null e o pipeline segue sem o Jev. */
export async function classifyWithJev(input: JevInput): Promise<JevResult> {
  if (!jevEnabled() || input.options.length === 0) return null
  try {
    const res = await fetch(process.env.JEV_API_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.JEV_API_KEY}` },
      body: JSON.stringify({
        schema: { type: "enum", values: input.options.map((o) => o.label) },
        input: {
          description: input.description,
          amount: input.amount,
          account: input.account,
          bank_category: input.pluggyCategory,
        },
        examples: input.examples.map((e) => ({ input: { description: e.description }, output: e.label })),
      }),
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { value?: unknown; confidence?: unknown }
    const option = input.options.find((o) => o.label === body.value)
    const confidence = Number(body.confidence)
    return option && Number.isFinite(confidence) ? { subcategoryId: option.id, confidence } : null
  } catch {
    return null
  }
}
