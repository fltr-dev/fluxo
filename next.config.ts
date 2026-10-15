import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // A demonstração roda num Postgres embutido (PGlite): fica fora do bundle para carregar seus arquivos .wasm/.data
  serverExternalPackages: ["@electric-sql/pglite"],
  // ...e aplica as migrations de ./drizzle em tempo de execução, então os arquivos precisam ir no deploy
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  // "Conexões" virou "Contas" (resumo em /contas, detalhe em /contas/[id])
  redirects: async () => [
    { source: "/conexoes", destination: "/contas", permanent: true },
    { source: "/conexoes/:path*", destination: "/contas/:path*", permanent: true },
  ],
}

export default nextConfig
