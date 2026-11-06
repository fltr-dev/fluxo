import pkg from "../../package.json"

// Identidade do sistema, exibida na sidebar e em Configurações › Sobre. Só o servidor importa este módulo
// (e repassa os valores por props): importar o package.json inteiro num componente de cliente o levaria ao bundle.

export const APP = {
  name: "fluxo",
  version: pkg.version,
  company: "FLTR Systems",
  // Fora da produção (local ou preview da Vercel) a versão leva o selo "dev", para não confundir com o app real
  dev: process.env.VERCEL_ENV ? process.env.VERCEL_ENV !== "production" : process.env.NODE_ENV !== "production",
  // Na Vercel, identifica o deploy ("a1b2c3d"); localmente fica vazio
  commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
}

export type AppInfo = typeof APP
