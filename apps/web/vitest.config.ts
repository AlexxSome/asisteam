import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: process.env.RUN_SUPABASE_INTEGRATION === "1"
      ? ["tests/**/*.integration.ts"]
      : ["src/**/*.test.{ts,tsx}"],
  },
});
