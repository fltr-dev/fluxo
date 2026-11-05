"use client"

import { Bell, Cloud, Info, KeyRound, Monitor, Moon, Palette, Sun, type LucideIcon } from "lucide-react"
import { createContext, useActionState, useContext, useMemo, useState } from "react"
import { updateCredentials } from "@/app/(app)/settings-actions"
import { FormActions } from "@/components/bits"
import { Logo } from "@/components/logo"
import { NotificationSettings, type NotifyProps } from "@/components/notification-settings"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { PRIMARIES, THEMES, type PrimaryId, type ThemeId } from "@/lib/theme"
import { applyPrimary, applyTheme } from "@/lib/theme-client"
import { cn } from "@/lib/utils"

export type SettingsSection = "appearance" | "notifications" | "account" | "about"

const SECTIONS: { id: SettingsSection; label: string; icon: LucideIcon }[] = [
  { id: "appearance", label: "Aparência", icon: Palette },
  { id: "notifications", label: "Avisos", icon: Bell },
  { id: "account", label: "Conta", icon: KeyRound },
  { id: "about", label: "Sobre", icon: Info },
]

const THEME_ICON: Record<ThemeId, LucideIcon> = { system: Monitor, light: Sun, dim: Cloud, dark: Moon }

type AppInfo = { name: string; version: string; company: string; commit?: string }
type Props = {
  user: { name: string; email: string; role: "owner" | "demo" }
  app: AppInfo
  theme: ThemeId
  primary: PrimaryId
  notify: NotifyProps
  children: React.ReactNode
}

const Ctx = createContext<{ open: (section?: SettingsSection) => void; demo: boolean }>({ open: () => {}, demo: false })
/** Abre o modal de Configurações de qualquer lugar (menu do perfil, rodapé da sidebar, menu do celular); `demo`: sessão somente leitura. */
export const useSettings = () => useContext(Ctx)

export function SettingsProvider({ children, ...props }: Props) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<SettingsSection>("appearance")
  const api = useMemo(
    () => ({
      open: (s: SettingsSection = "appearance") => {
        setSection(s)
        setOpen(true)
      },
      demo: props.user.role === "demo",
    }),
    [props.user.role],
  )
  return (
    <Ctx.Provider value={api}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <div className="grid min-h-0 md:min-h-[30rem] md:grid-cols-[13.5rem_minmax(0,1fr)]">
            <div className="flex flex-col gap-1 border-b bg-muted/40 p-3 md:border-r md:border-b-0 md:p-4">
              <DialogTitle className="px-2 pt-1 pb-2 text-base font-semibold md:pb-3">Configurações</DialogTitle>
              <DialogDescription className="sr-only">Aparência, avisos, conta e informações do sistema</DialogDescription>
              <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 md:flex-col" aria-label="Seções">
                {SECTIONS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-current={section === id ? "page" : undefined}
                    onClick={() => setSection(id)}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                      section === id && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </nav>
              <p className="mt-auto hidden px-2.5 pt-6 text-xs text-muted-foreground md:block">
                {props.app.company}
                <br />
                <span className="tabular-nums">Versão {props.app.version}</span>
              </p>
            </div>
            <div className="min-h-0 overflow-y-auto p-5 md:max-h-[34rem] md:p-7">
              {section === "appearance" && <Appearance theme={props.theme} primary={props.primary} />}
              {section === "notifications" && <NotificationSettings {...props.notify} />}
              {section === "account" && <Account user={props.user} />}
              {section === "about" && <About app={props.app} />}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  )
}

function Heading({ title, value }: { title: string; value?: string }) {
  return (
    <div className="mb-3 grid gap-0.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {value && <p className="text-sm text-muted-foreground">{value}</p>}
    </div>
  )
}

/** Fundo e cor de destaque: só opções prontas, sem escolha livre de cor. */
function Appearance({ theme: initialTheme, primary: initialPrimary }: { theme: ThemeId; primary: PrimaryId }) {
  const [theme, setTheme] = useState(initialTheme)
  const [primary, setPrimary] = useState(initialPrimary)
  const themeLabel = THEMES.find((t) => t.id === theme)!.label
  const primaryLabel = PRIMARIES.find((p) => p.id === primary)!.label

  return (
    <div className="grid gap-8">
      <section>
        <Heading title="Fundo" value={themeLabel} />
        <div role="radiogroup" aria-label="Fundo" className="flex gap-1">
          {THEMES.map(({ id, label }) => {
            const Icon = THEME_ICON[id]
            const on = theme === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={label}
                title={label}
                onClick={() => {
                  setTheme(id)
                  applyTheme(id)
                }}
                className={cn(
                  "grid size-10 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                  on && "bg-muted text-primary hover:text-primary",
                )}
              >
                <Icon className="size-[18px]" />
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <Heading title="Cor de destaque" value={primaryLabel} />
        <div role="radiogroup" aria-label="Cor de destaque" className="flex flex-wrap gap-1">
          {PRIMARIES.map((p) => {
            const on = primary === p.id
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={p.label}
                title={p.label}
                onClick={() => {
                  setPrimary(p.id)
                  applyPrimary(p.id)
                }}
                className={cn("grid size-10 place-items-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50", on && "bg-muted")}
              >
                <span className="grid size-[18px] place-items-center rounded-full border-2" style={{ borderColor: p.vivid }}>
                  {on && <span className="size-1.5 rounded-full" style={{ background: p.vivid }} />}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">A aparência vale para este aparelho e fica salva neste navegador.</p>
    </div>
  )
}

const input =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"

function Account({ user }: { user: Props["user"] }) {
  const [state, action, pending] = useActionState(updateCredentials, null)
  if (user.role === "demo")
    return (
      <div className="grid gap-3">
        <Heading title="Conta" value="Login e senha" />
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">A demonstração é somente leitura: o login e a senha dela não podem ser alterados.</p>
      </div>
    )
  return (
    <form action={action} className="grid gap-5">
      <div className="grid max-w-md gap-4">
      <Heading title="Conta" value="Altere o usuário de entrada e a senha" />
      <label className="grid gap-1.5 text-sm font-medium">
        Usuário
        <input name="username" required minLength={3} maxLength={64} defaultValue={user.email} autoComplete="username" className={input} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Senha atual
        <input name="currentPassword" type="password" required autoComplete="current-password" className={input} />
        <span className="text-xs font-normal text-muted-foreground">Necessária para confirmar qualquer alteração.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Nova senha
          <input name="newPassword" type="password" minLength={8} maxLength={200} autoComplete="new-password" placeholder="Opcional" className={input} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Confirmar nova senha
          <input name="confirmPassword" type="password" maxLength={200} autoComplete="new-password" className={input} />
        </label>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Ao salvar, você sai de todos os aparelhos e entra de novo com o login novo. A senha fica guardada só como hash (scrypt).</p>
      </div>
      <FormActions plain>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </FormActions>
    </form>
  )
}

function About({ app }: { app: AppInfo }) {
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-4">
        <Logo className="size-14 rounded-2xl [&_svg]:size-7" />
        <div className="grid">
          <span className="text-lg font-semibold tracking-tight">{app.name}</span>
          <span className="text-sm text-muted-foreground">Controle financeiro pessoal</span>
        </div>
      </div>
      <dl className="grid max-w-sm gap-2.5 text-sm">
        {[
          ["Versão", app.version],
          ...(app.commit ? [["Build", app.commit]] : []),
          ["Desenvolvido por", app.company],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b pb-2.5 last:border-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        © {new Date().getFullYear()} {app.company}. Todos os direitos reservados.
      </p>
    </div>
  )
}
