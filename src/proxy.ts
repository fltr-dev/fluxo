export { auth as proxy } from "@/auth"

export const config = {
  // Tudo exige sessão, exceto login, rotas do Auth.js, cron (usa CRON_SECRET) e arquivos estáticos
  matcher: ["/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico).*)"],
}
