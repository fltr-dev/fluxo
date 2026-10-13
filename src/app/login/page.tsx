import { CircleAlert, Lock } from "lucide-react"
import { devLoginEnabled, signIn } from "@/auth"
import { Logo, ThemeToggle } from "@/components/shell-client"
import { Button } from "@/components/ui/button"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center bg-muted px-4 py-10 dark:bg-background">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2.5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">Finanças</span>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="grid gap-1.5 px-6 pt-7 text-center">
            <h1 className="text-xl font-semibold tracking-tight">Bem-vindo de volta</h1>
            <p className="text-sm text-muted-foreground">Entre com a conta Google autorizada para acessar suas finanças.</p>
          </div>
          <div className="grid gap-4 p-6">
            {error && (
              <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <div className="grid gap-0.5">
                  <span className="font-semibold">Acesso negado</span>
                  <span>Esta conta Google não tem permissão para entrar. Use o e-mail autorizado.</span>
                </div>
              </div>
            )}
            <form
              action={async () => {
                "use server"
                await signIn("google", { redirectTo: "/" })
              }}
            >
              <Button type="submit" variant="outline" className="h-11 w-full gap-2.5 text-sm">
                <GoogleIcon />
                Entrar com Google
              </Button>
            </form>
            {devLoginEnabled && (
              <form
                action={async () => {
                  "use server"
                  await signIn("dev", { redirectTo: "/" })
                }}
              >
                <Button type="submit" variant="ghost" className="h-9 w-full text-muted-foreground">
                  Entrar (dev)
                </Button>
              </form>
            )}
          </div>
          <div className="flex items-center justify-center gap-1.5 border-t bg-muted/40 px-6 py-3 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Acesso restrito ao dono da conta
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">Sessão criptografada · Dados bancários via Open Finance (Pluggy)</p>
      </div>
    </main>
  )
}
