import { CircleAlert, Lock } from "lucide-react"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { signIn } from "@/auth"
import { Logo, ThemeToggle } from "@/components/shell-client"
import { Button } from "@/components/ui/button"

const field = "h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center bg-muted px-4 py-10 dark:bg-background">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2.5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">FLTR Financeiro</span>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="grid gap-1.5 px-6 pt-7 text-center">
            <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
            <p className="text-sm text-muted-foreground">Acesso restrito. Informe usuário e senha.</p>
          </div>
          <form
            className="grid gap-4 p-6"
            action={async (form) => {
              "use server"
              try {
                await signIn("credentials", { user: form.get("user"), password: form.get("password"), redirectTo: "/" })
              } catch (e) {
                // credencial errada: volta ao formulário com o aviso; o redirect de sucesso passa adiante
                if (e instanceof AuthError) redirect("/login?error=1")
                throw e
              }
            }}
          >
            {error && (
              <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span className="font-semibold">Usuário ou senha incorretos</span>
              </div>
            )}
            <input name="user" required autoComplete="username" placeholder="Usuário" aria-label="Usuário" className={field} />
            <input name="password" type="password" required autoComplete="current-password" placeholder="Senha" aria-label="Senha" className={field} />
            <Button type="submit" className="h-11 w-full text-sm">
              Entrar
            </Button>
          </form>
          <div className="flex items-center justify-center gap-1.5 border-t bg-muted/40 px-6 py-3 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Sessão criptografada
          </div>
        </div>
      </div>
    </main>
  )
}
