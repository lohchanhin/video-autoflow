import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@ai-content-factory/config": fileURLToPath(new URL("./packages/config/src/index.ts", import.meta.url)),
      "@ai-content-factory/database": fileURLToPath(new URL("./packages/database/src/index.ts", import.meta.url)),
      "@ai-content-factory/logger": fileURLToPath(new URL("./packages/logger/src/index.ts", import.meta.url)),
      "@ai-content-factory/storage": fileURLToPath(new URL("./packages/storage/src/index.ts", import.meta.url)),
      "@ai-content-factory/shared-types": fileURLToPath(
        new URL("./packages/shared-types/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    passWithNoTests: true
  }
});
