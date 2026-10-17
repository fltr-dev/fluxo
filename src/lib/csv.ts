/** Célula de CSV: aspas sempre; prefixo ' evita fórmula ao abrir no Excel (=, +, -, @), exceto em números ("-32,40"). */
export const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v)
  const formula = /^[=+\-@]/.test(s) && Number.isNaN(Number(s.replace(",", ".")))
  return `"${(formula ? `'${s}` : s).replace(/"/g, '""')}"`
}

/** BOM + ";" para o Excel em pt-BR abrir com acentos e colunas certas. */
export const csvResponse = (header: string[], rows: unknown[][], filename: string) =>
  new Response("﻿" + [header.join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` },
  })

export const csvNum = (n: number | null | undefined, digits = 2) => (n == null ? "" : n.toFixed(digits).replace(".", ","))
