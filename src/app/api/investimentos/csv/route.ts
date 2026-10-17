import { requireUser } from "@/auth"
import { today } from "@/lib/domain/dates"
import { CLASS_INFO } from "@/lib/domain/investments"
import { csvNum, csvResponse } from "@/lib/csv"
import { activeHoldings } from "@/lib/investments"

export async function GET() {
  await requireUser({ allowDemo: true })
  const rows = await activeHoldings()
  return csvResponse(
    ["categoria", "ticker", "nome", "instituicao", "origem", "quantidade", "preco_medio", "cotacao", "aplicado", "saldo", "resultado", "rentabilidade_pct", "taxa", "vencimento"],
    rows.map((h) => [
      CLASS_INFO[h.assetClass].label,
      h.code,
      h.name,
      h.broker,
      h.manual ? "manual" : "pluggy",
      h.quantity == null ? "" : String(h.quantity).replace(".", ","),
      csvNum(h.avgPrice, 6),
      csvNum(h.unitPrice, 6),
      csvNum(h.invested),
      csvNum(h.value),
      csvNum(h.profit),
      csvNum(h.profitPct == null ? null : h.profitPct * 100),
      h.rateLabel,
      h.dueDate,
    ]),
    `investimentos_${today()}.csv`,
  )
}
