import { CircleAlert, CircleCheck, Lock } from "lucide-react"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { signIn } from "@/auth"
import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/shell-client"
import { APP } from "@/lib/app-info"
import { LoginFields } from "./login-fields"

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, alterado } = await searchParams
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center bg-muted px-4 py-16 dark:bg-background">
      <ThemeToggle className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4" />
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center justify-center gap-2.5">
          <Logo className="size-10" />
          <span className="text-2xl font-extrabold tracking-[-0.03em]">fluxo</span>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid gap-1.5 px-5 pt-7 text-center sm:px-6">
            <h1 className="text-xl font-bold tracking-[-0.015em]">Entrar</h1>
            <p className="text-sm text-muted-foreground">Acesso restrito. Informe usuário e senha.</p>
          </div>
          <form
            className="grid gap-4 px-5 pt-6 pb-6 sm:px-6"
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
            {/* no claro, o texto puxa para o foreground: o token puro sobre o fundo 10% fica abaixo de 4,5:1 */}
            {error && (
              <div role="alert" className="flex gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))] dark:text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {error === "expired" ? (
                    <span className="font-semibold">O login foi alterado. Entre novamente.</span>
                  ) : (
                    <>
                      <span className="font-semibold">Usuário ou senha incorretos.</span> Confira e tente de novo.
                    </>
                  )}
                </span>
              </div>
            )}
            {alterado && !error && (
              <div role="status" className="flex gap-2.5 rounded-lg border border-income/25 bg-income/10 p-3 text-sm text-[color-mix(in_oklab,var(--income)_75%,var(--foreground))] dark:text-income">
                <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="font-semibold">Login atualizado. Entre com o novo usuário e a nova senha.</span>
              </div>
            )}
            <LoginFields invalid={!!error && error !== "expired"} />
          </form>
          <div className="flex items-center justify-center gap-1.5 border-t bg-muted/40 px-6 py-3 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden />
            Sessão criptografada
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">por {APP.company}</p>
      </div>
    </main>
  )
}
