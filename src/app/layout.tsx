import type { Metadata, Viewport } from "next"
import { Geist_Mono, Manrope } from "next/font/google"
import { cookies } from "next/headers"
import { primaryCss, primaryFromCookie, themeFromCookie } from "@/lib/theme"
import "./globals.css"

// Manrope na interface (algarismos tabulares nos valores); Geist Mono para IDs e versão — DESIGN.md
const manrope = Manrope({ variable: "--font-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "fluxo",
  description: "Controle financeiro pessoal",
  applicationName: "fluxo",
  robots: { index: false, follow: false },
  // Instalado na tela inicial (iOS): abre sem a barra do Safari
  appleWebApp: { capable: true, title: "fluxo", statusBarStyle: "default" },
  formatDetection: { telephone: false },
}

// Cor da barra do navegador/PWA acompanha o fundo escolhido em Configurações (sem escolha, o tema do sistema)
const BG = { light: "#fafafa", dark: "#09090b", dim: "#232326" }
export async function generateViewport(): Promise<Viewport> {
  const theme = themeFromCookie((await cookies()).get("theme")?.value)
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: theme === "system" ? [{ media: "(prefers-color-scheme: light)", color: BG.light }, { media: "(prefers-color-scheme: dark)", color: BG.dark }] : BG[theme],
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // theme: "light" | "dark" | "dim" (cinza) escolhido em Configurações; sem cookie o CSS segue o tema do sistema
  const jar = await cookies()
  const theme = themeFromCookie(jar.get("theme")?.value)
  // primary: id da cor de destaque (lista fixa em lib/theme); sem cookie vale o verde do globals.css
  const primary = primaryCss(primaryFromCookie(jar.get("primary")?.value))
  // "privacy=1": PrivacyToggle esconde os valores com blur
  const privacy = jar.get("privacy")?.value === "1"
  // "sidebar=collapsed": sidebar recolhida; o atributo dá a largura (--sidebar-w) a toda a página
  const sidebar = jar.get("sidebar")?.value === "collapsed" ? "collapsed" : "expanded"
  return (
    <html lang="pt-BR" data-sidebar={sidebar} className={`${manrope.variable} ${geistMono.variable} h-full antialiased ${theme === "system" ? "" : theme} ${privacy ? "privacy" : ""}`}>
      <head>
        <style id="app-primary" dangerouslySetInnerHTML={{ __html: primary }} />
      </head>
      <body className="min-h-full">
        {children}
        {/* blur do modo privado para texto SVG (eixos dos gráficos): o Chrome ignora filter: blur() em elementos SVG */}
        <svg aria-hidden className="absolute size-0">
          <filter id="privacy-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </svg>
      </body>
    </html>
  )
}
