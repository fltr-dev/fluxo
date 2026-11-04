"use client"

import { ArrowBigUpDash, Eye, EyeOff, LoaderCircle } from "lucide-react"
import { useState, type KeyboardEvent } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"

// 16px no celular (o iOS não dá zoom no foco) e 14px a partir de md, como pede o DESIGN.md
const field =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"
const label = "text-[13px] font-medium"

/** Campos e botão do login: o pai (server component) guarda o <form> e a server action. */
export function LoginFields({ invalid }: { invalid?: boolean }) {
  const { pending } = useFormStatus()
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  const checkCaps = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"))

  return (
    <>
      <div className="grid gap-1.5">
        <label htmlFor="user" className={label}>
          Usuário
        </label>
        <input id="user" name="user" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={invalid || undefined} className={field} />
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="password" className={label}>
            Senha
          </label>
          {/* região viva sempre no DOM: o leitor de tela anuncia quando o texto aparece; fica na linha do rótulo para não empurrar o botão */}
          <p id="caps-lock" role="status" className="flex items-center gap-1 text-xs font-semibold text-warning">
            {caps && (
              <>
                <ArrowBigUpDash className="size-3.5" aria-hidden />
                Caps Lock ativado
              </>
            )}
          </p>
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            aria-invalid={invalid || undefined}
            aria-describedby="caps-lock"
            onKeyDown={checkCaps}
            onKeyUp={checkCaps}
            onBlur={() => setCaps(false)}
            className={`${field} pr-12`}
          />
          <button
            type="button"
            aria-label="Mostrar senha"
            aria-pressed={show}
            aria-controls="password"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      {/* focusableWhenDisabled: o foco não cai no <body> enquanto entra; sem opacidade, porque esperar não é "indisponível" */}
      <Button type="submit" disabled={pending} focusableWhenDisabled className="mt-2 h-11 w-full text-sm font-semibold">
        {pending ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden />
            Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </Button>
    </>
  )
}
