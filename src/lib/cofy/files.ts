import "server-only"
import { MAX_FILE_BYTES } from "./types"

// Anexos do chat: valida o arquivo e transforma em blocos que o modelo lê (imagem, PDF ou texto).

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  csv: "text/csv",
  txt: "text/plain",
  ofx: "application/x-ofx",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_TEXT_CHARS = 400_000

export class UploadError extends Error {}

export const mediaTypeOf = (name: string) => TYPES[name.split(".").pop()?.toLowerCase() ?? ""]

export function checkUpload(name: string, size: number) {
  const mediaType = mediaTypeOf(name)
  if (!mediaType) throw new UploadError(`"${name}": tipo não aceito. Envie PDF, imagem, CSV, Excel (.xlsx), OFX ou TXT.`)
  if (size === 0) throw new UploadError(`"${name}" está vazio.`)
  if (size > MAX_FILE_BYTES) throw new UploadError(`"${name}" passa de 10 MB.`)
  if (mediaType.startsWith("image/") && size > MAX_IMAGE_BYTES) throw new UploadError(`"${name}": imagens podem ter até 5 MB.`)
  return mediaType
}

/** Bancos brasileiros exportam OFX/CSV em Windows-1252 com frequência; tenta UTF-8 e cai para ele. */
function decode(bytes: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("windows-1252").decode(bytes)
  }
}

async function sheetText(bytes: Buffer) {
  const { default: readXlsxFile } = await import("read-excel-file/node")
  const sheets = await readXlsxFile(bytes)
  return sheets
    .map(({ sheet, data }) => `# Planilha: ${sheet}\n${data.map((row) => row.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c == null ? "" : String(c).replace(/[\t\n]/g, " "))).join("\t")).join("\n")}`)
    .join("\n\n")
}

type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string } } | { type: "document"; title: string; source: { type: "base64"; media_type: "application/pdf"; data: string } }

/** Blocos da API para um anexo salvo (dados em base64). Sempre os mesmos bytes → mesmo prefixo da conversa. */
export async function attachmentBlocks(a: { name: string; mediaType: string; data: string }): Promise<Block[]> {
  const head: Block = { type: "text", text: `[Arquivo anexado: ${a.name}]` }
  if (a.mediaType.startsWith("image/")) return [head, { type: "image", source: { type: "base64", media_type: a.mediaType as "image/png", data: a.data } }]
  if (a.mediaType === "application/pdf") return [head, { type: "document", title: a.name, source: { type: "base64", media_type: "application/pdf", data: a.data } }]
  const bytes = Buffer.from(a.data, "base64")
  const text = a.mediaType.includes("spreadsheetml") ? await sheetText(bytes) : decode(bytes)
  if (text.length > MAX_TEXT_CHARS) throw new UploadError(`"${a.name}" é grande demais para eu ler inteiro (${Math.round(text.length / 1000)} mil caracteres). Envie em partes menores.`)
  return [head, { type: "text", text }]
}
