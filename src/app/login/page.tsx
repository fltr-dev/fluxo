import { CircleAlert, CircleCheck, Lock } from "lucide-react"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { signIn } from "@/auth"
import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/shell-client"
import { APP } from "@/lib/app-info"
import { LoginIllustration, WaveEdge } from "./login-art"
import { LoginFields } from "./login-fields"

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, alterado } = await searchParams
  return (
    <main className="relative flex min-h-svh flex-col overflow-x-hidden bg-background lg:grid lg:grid-cols-[1fr_minmax(30rem,46%)]">
      {/* no celular fica sobre o fundo claro; no desktop, sobre o painel verde */}
      <ThemeToggle className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 lg:text-primary-foreground lg:hover:bg-primary-foreground/15 lg:hover:text-primary-foreground lg:dark:text-foreground lg:dark:hover:bg-foreground/10 lg:dark:hover:text-foreground" />

      {/* lado da marca: logo, a moeda do fluxo enchendo e o que o fluxo é */}
      <section className="flex flex-col items-center gap-3 px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-10 lg:items-stretch lg:gap-0 lg:px-12 lg:py-10 xl:px-16">
        <div className="flex items-center gap-3">
          <Logo className="size-10 lg:size-11" />
          <span className="text-2xl font-extrabold tracking-[-0.03em] lg:text-[28px]">fluxo</span>
        </div>
        <div className="grid flex-1 place-items-center lg:py-8">
          <LoginIllustration />
        </div>
        <div className="grid max-w-md gap-2 text-center lg:text-left">
          <p className="text-[15px] font-semibold text-balance lg:text-[28px] lg:leading-[34px] lg:font-bold lg:tracking-[-0.02em]">Contas, cartões, investimentos e dívidas num lugar só.</p>
          <p className="text-sm text-muted-foreground max-lg:hidden">Seu controle financeiro pessoal, por {APP.company}.</p>
        </div>
      </section>

      {/* painel do login: verde no claro, verde 950 no escuro; as ondas fazem a divisa */}
      <section className="relative flex flex-1 flex-col bg-primary dark:bg-sidebar-accent">
        <WaveEdge />

        <div className="flex flex-1 items-center justify-center px-4 pt-6 pb-8 lg:px-10">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border bg-card shadow-[0_24px_48px_-12px_rgb(0_0_0/.28)]">
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

        <footer className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs font-medium text-primary-foreground dark:text-muted-foreground">
          © {new Date().getFullYear()} {APP.company}. Todos os direitos reservados.
        </footer>
      </section>
    </main>
  )
}
