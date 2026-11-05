import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Suítes com PGlite rodam todas as migrations no beforeAll; com vários workers passa de 10 s
  // .claude/ guarda worktrees de outras sessões (cópias antigas do src): fora da suíte
  test: { hookTimeout: 60_000, exclude: [...configDefaults.exclude, ".claude/**"] },
})
