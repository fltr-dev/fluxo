import type { MetadataRoute } from "next"

// PWA: instalável na tela inicial (Android/iOS/desktop). Sem modo offline: os dados vêm sempre do servidor.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FLTR Financeiro",
    short_name: "Financeiro",
    description: "Controle financeiro pessoal",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#047857",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Nova transação", short_name: "Nova", url: "/transacoes?nova=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Calendário", url: "/calendario", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  }
}
