import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Suítes com PGlite rodam todas as migrations no beforeAll; com vários workers passa de 10 s
  test: { hookTimeout: 60_000 },
})
