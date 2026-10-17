import { requireUser } from "@/auth"
import { csvNum, csvResponse } from "@/lib/csv"
import { exportTransactions, parseFilters } from "@/lib/queries"

export async function GET(request: Request) {
  await requireUser({ allowDemo: true })
  const f = parseFilters(Object.fromEntries(new URL(request.url).searchParams))
  const rows = await exportTransactions(f)
  return csvResponse(
    ["data", "descricao", "valor", "tipo", "status", "conta", "categoria", "subcategoria", "nota", "ignorada"],
    rows.map((r) => [r.date, r.description, csvNum(r.amount), r.kind, r.status, r.account, r.category, r.subcategory, r.note, r.ignored ? "sim" : "nao"]),
    `transacoes_${f.from}_${f.to}.csv`,
  )
}
