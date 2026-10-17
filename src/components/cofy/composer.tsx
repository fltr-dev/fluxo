"use client"

import { ArrowUp, AtSign, Paperclip, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { loadMentionOptions, type MentionOption } from "@/app/(app)/cofy/actions"
import { Button } from "@/components/ui/button"
import { normalize } from "@/lib/domain/categorize"
import { ACCEPT, MAX_FILE_BYTES, MAX_FILES } from "@/lib/cofy/types"
import { cn } from "@/lib/utils"
import { AttachmentChip } from "./cards"

let optionsCache: Promise<MentionOption[]> | undefined
const options = () => (optionsCache ??= loadMentionOptions().catch(() => (optionsCache = undefined, [])))

const TOKEN = /(^|\s)([@#])([^\s@#[\]]{0,30})$/

type Props = {
  disabled?: boolean
  streaming?: boolean
  compact?: boolean
  placeholder?: string
  /** Texto para preencher o campo (atalhos, "Editar" de uma proposta); `nonce` muda a cada pedido. */
  draft?: { text: string; nonce: number }
  onSend: (text: string, files: File[]) => void
}

export function Composer({ disabled, streaming, compact, placeholder = "Pergunte ao Cofy… use @ para contas e # para categorias", draft, onSend }: Props) {
  const [text, setText] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [all, setAll] = useState<MentionOption[]>([])
  const [token, setToken] = useState<{ sigil: string; q: string; start: number } | null>(null)
  const [active, setActive] = useState(0)
  const area = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  // pedido de preenchimento (atalho, "Editar" de uma proposta): ajusta o estado durante a renderização, sem efeito
  const [seen, setSeen] = useState(draft?.nonce)
  if (draft && draft.nonce !== seen) {
    setSeen(draft.nonce)
    setText(draft.text)
  }
  useEffect(() => {
    if (draft) area.current?.focus()
  }, [draft])
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, compact ? 120 : 176)}px`
  }, [text, compact])

  const matches = token ? all.filter((o) => o.sigil === token.sigil && normalize(o.label).includes(normalize(token.q))).slice(0, 8) : []

  function detect(value: string, caret: number) {
    const m = TOKEN.exec(value.slice(0, caret))
    if (!m) return setToken(null)
    setToken({ sigil: m[2], q: m[3], start: caret - m[3].length - 1 })
    setActive(0)
    if (!all.length) void options().then(setAll)
  }

  function pick(o: MentionOption) {
    if (!token) return
    const el = area.current!
    const caret = el.selectionStart
    const next = `${text.slice(0, token.start)}${o.sigil}[${o.label}] ${text.slice(caret)}`
    setText(next)
    setToken(null)
    const pos = token.start + o.label.length + 4
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function addFiles(list: FileList | File[]) {
    const next = [...files]
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) return setError(`No máximo ${MAX_FILES} arquivos por mensagem.`)
      if (f.size > MAX_FILE_BYTES) return setError(`"${f.name}" passa de 10 MB.`)
      if (!new RegExp(`(${ACCEPT.replaceAll(".", "\\.").replaceAll(",", "|")})$`, "i").test(f.name)) return setError(`"${f.name}": envie PDF, imagem, CSV, Excel (.xlsx), OFX ou TXT.`)
      next.push(f)
    }
    setError(null)
    setFiles(next)
  }

  function submit() {
    if (disabled || streaming || (!text.trim() && !files.length)) return
    onSend(text, files)
    setText("")
    setFiles([])
    setError(null)
    setToken(null)
  }

  return (
    <div
      className="relative"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
      }}
    >
      {token && matches.length > 0 && (
        <ul role="listbox" aria-label="Sugestões" className="absolute right-0 bottom-full left-0 z-20 mb-2 max-h-64 overflow-y-auto rounded-2xl border bg-popover p-1.5 shadow-lg">
          {matches.map((o, i) => (
            <li key={`${o.kind}-${o.label}`} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm", i === active && "bg-muted")}>
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold", o.sigil === "#" ? "bg-amber-500/15 text-warning" : "bg-primary/10 text-primary")}>{o.sigil}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={cn("grid gap-2 rounded-2xl border border-input bg-card p-2.5 pl-3.5 shadow-[0_8px_24px_-16px_rgba(0,0,0,.2)] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30", compact && "rounded-xl p-2 pl-3")}>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1">
                <AttachmentChip a={{ name: f.name, size: f.size, mediaType: f.type }} />
                <button type="button" aria-label={`Remover ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={area}
          value={text}
          rows={compact ? 1 : 2}
          aria-label="Mensagem para o Cofy"
          placeholder={placeholder}
          disabled={disabled}
          maxLength={8000}
          onChange={(e) => {
            setText(e.target.value)
            detect(e.target.value, e.target.selectionStart)
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault()
              addFiles(e.clipboardData.files)
            }
          }}
          onKeyDown={(e) => {
            if (token && matches.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                setActive((a) => (a + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length)
                return
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault()
                pick(matches[active])
                return
              }
              if (e.key === "Escape") return setToken(null)
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          className="max-h-44 min-h-11 resize-none bg-transparent text-[15px] leading-[22px] font-medium outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-1">
          <input ref={picker} type="file" multiple accept={ACCEPT} hidden onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ""))} />
          <Button type="button" variant="ghost" size="icon" aria-label="Anexar arquivo" onClick={() => picker.current?.click()} disabled={disabled}>
            <Paperclip />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Citar conta, dívida ou categoria"
            disabled={disabled}
            onClick={() => {
              const el = area.current!
              const pos = el.selectionStart
              const next = `${text.slice(0, pos)}${pos && !/\s$/.test(text.slice(0, pos)) ? " " : ""}@${text.slice(pos)}`
              setText(next)
              requestAnimationFrame(() => {
                el.focus()
                const caret = pos + (pos && !/\s$/.test(text.slice(0, pos)) ? 2 : 1)
                el.setSelectionRange(caret, caret)
                detect(next, caret)
              })
            }}
          >
            <AtSign />
          </Button>
          {!compact && <span className="ml-1.5 hidden text-xs text-muted-foreground sm:inline">PDF, imagem, CSV, Excel ou OFX · até 10 MB</span>}
          <span className="flex-1" />
          <Button type="button" size="icon" aria-label="Enviar" disabled={disabled || streaming || (!text.trim() && !files.length)} onClick={submit}>
            <ArrowUp />
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  )
}
