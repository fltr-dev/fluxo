import { LogoLoader } from "@/components/logo"

// Abertura do app (inclusive o PWA) e entrada depois do login: enquanto a moldura do app (sessão, contas, avisos)
// carrega, a tela inteira mostra o logo se formando. Dentro do app, cada tela tem o próprio skeleton.
export default function Loading() {
  return (
    <div className="grid min-h-svh place-items-center bg-background" aria-busy="true">
      <span className="sr-only" role="status">Carregando o fluxo…</span>
      <LogoLoader className="ll-splash size-16" />
    </div>
  )
}
