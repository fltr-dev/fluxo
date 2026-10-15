export { auth as proxy } from "@/auth"

export const config = {
  // Tudo exige sessão, exceto login, rotas do Auth.js, cron (usa CRON_SECRET), robots e arquivos estáticos
  matcher: ["/((?!login|api/auth|api/cron|robots.txt|_next/static|_next/image|favicon.ico).*)"],
}
