import "server-only"
import type { JevResult } from "./domain/categorize"

// Contrato da API: https://docs.typesafe.ai/api. O AI Gateway da Vercel expõe a mesma API (corpo e
// resposta idênticos) — muda só URL, id do modelo e chave. Sem nenhuma das duas chaves, fica desligado.
const provider = () => {
  const gateway = process.env.AI_GATEWAY_API_KEY
  if (gateway) return { url: "https://ai-gateway.vercel.sh/typesafe/v1/systemone", model: "typesafe-ai/jev", key: gateway }
  const direct = process.env.TYPESAFE_API_KEY
  if (direct) return { url: "https://api.typesafe.ai/v1/systemone", model: "jev-latest", key: direct }
  return null
}

export const jevEnabled = () => provider() !== null

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

type ChoiceAnswer = { type?: string; choice?: string; confidence?: number; probabilities?: Record<string, number> }

/** Nunca lança: erro, timeout (> 3s) ou resposta fora das opções viram null e o pipeline segue sem o Jev. */
export async function classifyWithJev(input: JevInput): Promise<JevResult> {
  const p = provider()
  if (!p || input.options.length === 0) return null
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model,
        state: {
          description: input.description,
          amount: input.amount,
          account: input.account,
          bank_category: input.pluggyCategory,
          // correções anteriores do usuário, como contexto
          examples: input.examples.map((e) => ({ description: e.description, category: e.label })),
        },
        questions: {
          category: {
            type: "choice",
            instructions:
              "Which category does the bank transaction described in `state` belong to? `examples` are past transactions the user categorized by hand.",
            criteria: Object.fromEntries(input.options.map((o) => [o.label, `The transaction belongs to the category "${o.label}".`])),
          },
        },
      }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { answers?: { category?: ChoiceAnswer } }
    const answer = body.answers?.category
    if (answer?.type !== "choice" || !answer.choice) return null
    const option = input.options.find((o) => o.label === answer.choice)
    const confidence = Number(answer.probabilities?.[answer.choice] ?? answer.confidence)
    return option && Number.isFinite(confidence) ? { subcategoryId: option.id, confidence } : null
  } catch {
    return null
  }
}
