import { requireUser } from "@/auth"
import { exportTransactions, parseFilters } from "@/lib/queries"

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v)
  // aspas sempre; prefixo ' evita fórmula ao abrir no Excel (=, +, -, @), exceto em números ("-32,40")
  const formula = /^[=+\-@]/.test(s) && Number.isNaN(Number(s.replace(",", ".")))
  return `"${(formula ? `'${s}` : s).replace(/"/g, '""')}"`
}

export async function GET(request: Request) {
  await requireUser()
  const f = parseFilters(Object.fromEntries(new URL(request.url).searchParams))
  const rows = await exportTransactions(f)
  const header = ["data", "descricao", "valor", "tipo", "status", "conta", "categoria", "subcategoria", "nota", "ignorada"]
  const lines = rows.map((r) =>
    [r.date, r.description, r.amount.toFixed(2).replace(".", ","), r.kind, r.status, r.account, r.category, r.subcategory, r.note, r.ignored ? "sim" : "nao"]
      .map(cell)
      .join(";"),
  )
  // BOM + ";" para o Excel em pt-BR abrir com acentos e colunas certas
  return new Response("﻿" + [header.join(";"), ...lines].join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="transacoes_${f.from}_${f.to}.csv"`,
    },
  })
}
