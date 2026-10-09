import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@legacy": fileURLToPath(new URL("./test/legacy/src", import.meta.url)), "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: process.env.RUN_SUPABASE_INTEGRATION === "1"
      ? ["tests/**/*.integration.ts"]
      : ["src/**/*.test.{ts,tsx}", "test/legacy/tests/**/*.test.{ts,tsx}"],
  },
});
