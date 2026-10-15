import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { cookies } from "next/headers"
import "./globals.css"

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "FLTR Financeiro",
  description: "Controle financeiro pessoal",
  robots: { index: false, follow: false },
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // "dark" | "light" escolhido no ThemeToggle; sem cookie o CSS segue o tema do sistema
  const jar = await cookies()
  const theme = jar.get("theme")?.value
  // "privacy=1": PrivacyToggle esconde os valores com blur
  const privacy = jar.get("privacy")?.value === "1"
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${theme === "dark" || theme === "light" ? theme : ""} ${privacy ? "privacy" : ""}`}>
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
