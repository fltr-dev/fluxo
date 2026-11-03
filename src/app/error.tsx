"use client"

import { RotateCw, TriangleAlert } from "lucide-react"
import { Logo } from "@/components/logo"
import { Button, buttonVariants } from "@/components/ui/button"

// Erro inesperado em qualquer tela (inclusive no layout do app). Em produção a mensagem real fica só no
// servidor; o código (digest) é o que liga esta tela ao log da Vercel.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted px-4 py-10 dark:bg-background">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2.5">
          <Logo className="size-10" />
          <span className="text-2xl font-extrabold tracking-[-0.03em]">fluxo</span>
        </div>

        <div className="grid gap-5 rounded-2xl border bg-card p-6 text-center shadow-sm">
          <TriangleAlert className="mx-auto size-8 text-amber-500" />
          <div className="grid gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight">Não foi possível abrir esta tela</h1>
            <p className="text-sm text-muted-foreground">
              Algo falhou do nosso lado, não no seu login. Seus dados não foram alterados. Tente de novo em alguns instantes.
            </p>
          </div>
          <div className="grid gap-2">
            <Button onClick={() => retry()} className="h-11 w-full text-sm">
              <RotateCw />
              Tentar de novo
            </Button>
            <a href="/login" className={buttonVariants({ variant: "outline", className: "h-11 w-full text-sm" })}>
              Voltar ao login
            </a>
          </div>
          {error.digest && <p className="font-mono text-xs text-muted-foreground">Código do erro: {error.digest}</p>}
        </div>
      </div>
    </main>
  )
}
