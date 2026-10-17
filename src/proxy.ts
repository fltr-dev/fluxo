export { auth as proxy } from "@/auth"

export const config = {
  // Tudo exige sessão, exceto login, rotas do Auth.js, cron (usa CRON_SECRET), robots, manifest/ícones do PWA
  // (o navegador os busca antes de qualquer login) e arquivos estáticos
  matcher: ["/((?!login|api/auth|api/cron|robots.txt|sw.js|manifest.webmanifest|icon.svg|apple-icon.png|icons/|_next/static|_next/image|favicon.ico).*)"],
}
