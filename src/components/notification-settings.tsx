"use client"

import { BellRing, Smartphone } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { sendTestPush, updateNotifySettings } from "@/app/(app)/notifications-actions"
import { FormSelect } from "@/components/form-select"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { NotifySettings } from "@/lib/domain/notifications"

export type NotifyProps = { settings: NotifySettings; configured: boolean; publicKey: string; demo: boolean }

const TYPES: { key: keyof Omit<NotifySettings, "pushHour">; label: string; hint: string }[] = [
  { key: "notifyDue", label: "Parcela perto de vencer", hint: "Conforme o lembrete de cada dívida (no dia, 1 ou 3 dias antes)" },
  { key: "notifyOverdue", label: "Dívida atrasada", hint: "Quando uma parcela passa do vencimento sem pagamento" },
  { key: "notifySalary", label: "Salário caiu", hint: "Quando a entrada na categoria Salário aparece, com as parcelas da semana" },
  { key: "notifyLimit", label: "Limite estourado", hint: "Quando uma categoria passa do limite mensal" },
]

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6).map((h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }))

function keyToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const deviceLabel = () => (/iPhone|iPad/.test(navigator.userAgent) ? "iPhone/iPad" : /Android/.test(navigator.userAgent) ? "Android" : /Mac/.test(navigator.userAgent) ? "Mac" : /Windows/.test(navigator.userAgent) ? "Windows" : "Navegador")

type Support = "checking" | "unsupported" | "ready"

/** Configurações › Avisos: push neste aparelho, horário e quais avisos você quer receber. */
export function NotificationSettings({ settings: initial, configured, publicKey, demo }: NotifyProps) {
  const [s, setS] = useState(initial)
  const [support, setSupport] = useState<Support>("checking")
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let alive = true
    void (async () => {
      const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
      if (!alive) return
      if (!ok) return setSupport("unsupported")
      setSupport("ready")
      setPermission(Notification.permission)
      const reg = await navigator.serviceWorker.getRegistration("/sw.js")
      if (alive) setSubscribed(!!(await reg?.pushManager.getSubscription()))
    })()
    return () => {
      alive = false
    }
  }, [])

  const save = (patch: Partial<NotifySettings>) => {
    const prev = s
    setS({ ...s, ...patch })
    start(async () => {
      try {
        await updateNotifySettings(patch)
      } catch {
        setS(prev)
        setMsg({ ok: false, text: "Não foi possível salvar." })
      }
    })
  }

  async function enable() {
    setMsg(null)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== "granted") return setMsg({ ok: false, text: "O navegador bloqueou os avisos. Libere nas configurações do site e tente de novo." })
      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }))
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), label: deviceLabel() }) })
      if (!res.ok) throw new Error()
      setSubscribed(true)
      setMsg({ ok: true, text: "Pronto: este aparelho vai receber os avisos." })
    } catch {
      setMsg({ ok: false, text: "Não foi possível ativar o push neste aparelho." })
    }
  }

  async function disable() {
    setMsg(null)
    const reg = await navigator.serviceWorker.getRegistration("/sw.js")
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
      await sub.unsubscribe()
    }
    setSubscribed(false)
  }

  const pushUnavailable = demo || !configured || support === "unsupported"
  return (
    <div className="grid max-w-xl gap-7">
      <div className="mb-[-0.5rem] grid gap-0.5">
        <h3 className="text-sm font-semibold">Avisos e push</h3>
        <p className="text-sm text-muted-foreground">O sino do topo sempre funciona; o push leva os mesmos avisos para a tela do celular.</p>
      </div>

      <section className="grid gap-3 rounded-xl border p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Smartphone className="size-4" />
          </span>
          <div className="grid flex-1 gap-0.5">
            <span className="text-sm font-medium">Receber push neste aparelho</span>
            <span className="text-xs text-muted-foreground">
              {demo
                ? "Indisponível na demonstração."
                : !configured
                  ? "O servidor ainda não tem as chaves de push (VAPID). Veja o README."
                  : support === "unsupported"
                    ? "Este navegador não recebe push. No iPhone, instale o app na tela inicial (iOS 16.4 ou superior)."
                    : permission === "denied"
                      ? "Bloqueado no navegador: libere as notificações do site."
                      : subscribed
                        ? "Ativo neste aparelho."
                        : "Desativado neste aparelho."}
            </span>
          </div>
          <Switch checked={subscribed} disabled={pushUnavailable || support === "checking"} aria-label="Receber push neste aparelho" onCheckedChange={(on) => void (on ? enable() : disable())} />
        </div>
        {subscribed && !pushUnavailable && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await sendTestPush()
                  setMsg(r.ok ? { ok: true, text: "Aviso de teste enviado." } : { ok: false, text: r.error })
                })
              }
            >
              <BellRing /> Enviar aviso de teste
            </Button>
          </div>
        )}
        {msg && (
          <p role="status" className={msg.ok ? "text-xs text-income" : "text-xs text-destructive"}>
            {msg.text}
          </p>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">Horário do resumo</h3>
        <div className="flex items-center gap-3">
          <div className="w-32">
            <FormSelect value={String(s.pushHour)} onValueChange={(v) => save({ pushHour: Number(v) })} options={HOURS} aria-label="Horário do push" disabled={demo} />
          </div>
          <p className="text-xs text-muted-foreground">O envio acontece uma vez por dia, a partir desse horário (fuso de Brasília), conforme o agendamento do servidor.</p>
        </div>
      </section>

      <section className="grid gap-1">
        <h3 className="mb-1 text-sm font-semibold">Quais avisos</h3>
        {TYPES.map((t) => (
          <label key={t.key} className="flex items-center gap-3 rounded-lg px-1 py-2">
            <span className="grid flex-1 gap-0.5">
              <span className="text-sm font-medium">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </span>
            <Switch checked={s[t.key]} disabled={demo} onCheckedChange={(on) => save({ [t.key]: on })} aria-label={t.label} />
          </label>
        ))}
      </section>
    </div>
  )
}
