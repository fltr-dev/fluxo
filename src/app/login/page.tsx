import { CircleAlert, CircleCheck, Lock } from "lucide-react"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { signIn } from "@/auth"
import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/shell-client"
import { APP } from "@/lib/app-info"
import { LoginFields } from "./login-fields"

/**
 * As duas ondas do símbolo do fluxo, em escala de tela: a de trás (dinheiro que entra) translúcida, a da frente
 * (o que fica guardado) cheia. Mesmas curvas do logo, esticadas; "slice" corta as laterais no celular em vez de
 * espremer a onda.
 */
function Tide() {
  return (
    <svg viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice" aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[clamp(200px,34svh,360px)] w-full">
      <path className="tide fill-primary/40 dark:fill-primary/15" d="M0 80 C 316 32 562 120 878 64 S 1300 16 1440 32 V320 H0Z" />
      <path className="tide tide-2 fill-primary dark:fill-primary/30" d="M0 128 C 316 80 562 176 878 112 S 1300 72 1440 88 V320 H0Z" />
    </svg>
  )
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, alterado } = await searchParams
  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden bg-muted dark:bg-background">
      <Tide />
      <ThemeToggle className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4" />

      <div className="flex flex-1 items-center justify-center px-4 pt-16 pb-8">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="grid justify-items-center gap-3 text-center">
            <div className="flex items-center gap-3">
              <Logo className="size-12" />
              <span className="text-3xl font-extrabold tracking-[-0.03em]">fluxo</span>
            </div>
            <p className="text-sm text-balance text-muted-foreground">Contas, cartões, investimentos e dívidas num lugar só.</p>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card shadow-[0_8px_24px_-8px_rgb(0_0_0/.18)]">
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
        </div>
      </div>

      {/* fica sobre a onda da frente: primary-foreground no claro, foreground no escuro */}
      <footer className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs font-medium text-primary-foreground dark:text-foreground">
        © {new Date().getFullYear()} {APP.company}. Todos os direitos reservados.
      </footer>
    </main>
  )
}
