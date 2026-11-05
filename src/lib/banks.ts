import { HEX_RE, readableOn } from "./color"

// Bancos conhecidos: cor da marca e logo. Os logos são SVGs em public/banks/<key>.svg, do repositório
// github.com/Tgentil/Bancos-em-SVG (só o símbolo, sem o nome; limpos e, quando o símbolo sumiria sobre a cor
// do banco, na versão branca). `full`: o SVG já traz o próprio fundo e ocupa o quadrado inteiro; sem ele, o
// símbolo fica centralizado sobre a cor do banco. Sem SVG (Will), um monograma de até 3 letras em `fg`.
// Marcas e logotipos pertencem aos seus donos; aqui servem só para identificar a conta.

export type BankMark = { src: string; full?: boolean } | { text: string }
export type Bank = { key: string; name: string; color: string; fg: string; mark: BankMark; match: RegExp }

const logo = (key: string, full?: true): BankMark => ({ src: `/banks/${key}.svg`, ...(full && { full }) })

export const BANKS: Bank[] = [
  { key: "nubank", name: "Nubank", color: "#820ad1", fg: "#ffffff", match: /\bnu ?bank\b|\bnu pagamentos\b|\bnu invest\b/, mark: logo("nubank", true) },
  { key: "inter", name: "Inter", color: "#ff7a00", fg: "#ffffff", match: /\bbanco inter\b|\binter\b/, mark: logo("inter") },
  { key: "itau", name: "Itaú", color: "#ec7000", fg: "#ffffff", match: /\bita[uú]/, mark: logo("itau", true) },
  { key: "bradesco", name: "Bradesco", color: "#cc092f", fg: "#ffffff", match: /\bbradesco/, mark: logo("bradesco") },
  { key: "santander", name: "Santander", color: "#ec0000", fg: "#ffffff", match: /\bsantander/, mark: logo("santander", true) },
  { key: "bb", name: "Banco do Brasil", color: "#fae128", fg: "#003882", match: /\bbanco do brasil\b|\bbb\b/, mark: logo("bb", true) },
  // só "Caixa Econômica"/"CEF": uma conta manual chamada "Caixa" (ou "Caixa da loja") não é o banco
  { key: "caixa", name: "Caixa", color: "#0070af", fg: "#ffffff", match: /\bcaixa economica\b|\bcef\b/, mark: logo("caixa") },
  { key: "c6", name: "C6 Bank", color: "#242424", fg: "#ffffff", match: /\bc6\b/, mark: logo("c6") },
  { key: "btg", name: "BTG Pactual", color: "#001e62", fg: "#ffffff", match: /\bbtg\b/, mark: logo("btg") },
  { key: "xp", name: "XP", color: "#111111", fg: "#ffffff", match: /\bxp\b/, mark: logo("xp", true) },
  { key: "mercadopago", name: "Mercado Pago", color: "#00b1ea", fg: "#ffffff", match: /\bmercado ?pago\b/, mark: logo("mercadopago") },
  { key: "picpay", name: "PicPay", color: "#21c25e", fg: "#ffffff", match: /\bpic ?pay\b/, mark: logo("picpay") },
  { key: "pagbank", name: "PagBank", color: "#ffc801", fg: "#1f2937", match: /\bpag ?bank\b|\bpag ?seguro\b/, mark: logo("pagbank") },
  { key: "sicredi", name: "Sicredi", color: "#3fa110", fg: "#ffffff", match: /\bsicredi\b/, mark: logo("sicredi") },
  { key: "sicoob", name: "Sicoob", color: "#003641", fg: "#7db61c", match: /\bsicoob\b/, mark: logo("sicoob") },
  { key: "will", name: "Will Bank", color: "#ffe100", fg: "#111111", match: /\bwill ?bank\b|^will\b/, mark: { text: "W" } },
  { key: "original", name: "Banco Original", color: "#1e9a4a", fg: "#ffffff", match: /\bbanco original\b|^original$/, mark: logo("original") },
]

const FALLBACKS = ["#0ea5e9", "#8b5cf6", "#f97316", "#14b8a6", "#ec4899", "#6366f1", "#eab308", "#64748b"]

/** minúsculas, sem acento e sem pontuação: "Itaú Unibanco S.A." → "itau unibanco s a" */
const plain = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/** Primeiro banco conhecido que casa com algum dos nomes (em ordem: instituição antes do apelido da conta). */
export function detectBank(...names: (string | null | undefined)[]): Bank | undefined {
  for (const n of names) {
    if (!n) continue
    const p = plain(n)
    const hit = BANKS.find((b) => b.match.test(p))
    if (hit) return hit
  }
}

export const bankByKey = (key?: string | null) => BANKS.find((b) => b.key === key)

const initialsOf = (s: string) => s.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Só dados simples (sem RegExp): vai do servidor para componentes de cliente. */
export type AccountLook = { bankKey?: string; bankName?: string; mark?: BankMark; color: string; fg: string; initials: string; custom: boolean }

/**
 * Aparência da conta: cor escolhida pelo usuário > cor do banco > cor estável pelo nome.
 * `bank`: null detecta pelo nome da instituição/conta, "none" não usa banco algum, ou a chave de um banco.
 */
export function accountLook(a: { name: string; bank?: string | null; color?: string | null; institution?: string | null }): AccountLook {
  const bank = a.bank === "none" ? undefined : a.bank ? bankByKey(a.bank) : detectBank(a.institution, a.name)
  const custom = !!a.color && HEX_RE.test(a.color)
  const color = custom ? a.color! : (bank?.color ?? FALLBACKS[hash(a.name) % FALLBACKS.length])
  return { bankKey: bank?.key, bankName: bank?.name, mark: bank?.mark, color, fg: custom || !bank ? readableOn(color) : bank.fg, initials: initialsOf(a.name), custom }
}
