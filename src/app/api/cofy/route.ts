import { requireUser } from "@/auth"
import { asOwner } from "@/db"
import { runChat } from "@/lib/cofy/chat"
import { COFY_ENABLED, MAX_FILE_BYTES, MAX_FILES, type StreamEvent } from "@/lib/cofy/types"

export const maxDuration = 60

/**
 * Uma rodada do chat do Cofy. Recebe multipart (texto, conversa, tela atual, arquivos) e responde em NDJSON:
 * uma linha por evento (ver StreamEvent). A rodada termina no servidor mesmo que a tela feche a conexão.
 */
export async function POST(request: Request) {
  if (!COFY_ENABLED) return Response.json({ error: "O Cofy está desativado" }, { status: 404 })
  let user
  try {
    user = await requireUser({ allowDemo: true })
  } catch {
    return Response.json({ error: "Não autorizado" }, { status: 401 })
  }
  const form = await request.formData().catch(() => null)
  if (!form) return Response.json({ error: "Pedido inválido" }, { status: 400 })

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > MAX_FILES) return Response.json({ error: `No máximo ${MAX_FILES} arquivos por mensagem` }, { status: 400 })
  if (files.some((f) => f.size > MAX_FILE_BYTES)) return Response.json({ error: "Cada arquivo pode ter até 10 MB" }, { status: 413 })
  const id = Number(form.get("conversationId"))
  const input = {
    conversationId: Number.isInteger(id) && id > 0 ? id : undefined,
    text: String(form.get("text") ?? ""),
    page: String(form.get("page") ?? "").slice(0, 200) || undefined,
    user: user.role === "owner" ? user.name : "Demonstração",
    files: await Promise.all(files.map(async (f) => ({ name: f.name, size: f.size, bytes: Buffer.from(await f.arrayBuffer()) }))),
  }

  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => {
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`))
        } catch {
          // a tela fechou a conexão: a rodada continua e fica salva no histórico
        }
      }
      // O banco real só é alcançado por `asOwner` aqui: dentro do stream a sessão já não é lida do cookie
      if (user.role !== "owner") send({ t: "error", message: "Na demonstração o Cofy só mostra conversas de exemplo. Entre com a sua conta para conversar de verdade." })
      else await asOwner(() => runChat(input, send))
      try {
        controller.close()
      } catch {}
    },
  })
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } })
}
