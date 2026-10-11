import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import { ACCOUNT_TERMS_2026_09_21 } from "../../packages/core/src/schemas/account-consent";
import { legalPage } from "./scripts/legal-document.mjs";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import {
  browserBoundary,
  publicEnvironment,
} from "./scripts/browser-boundary.mjs";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  publicEnvironment(env);
  const target = env.ASISTEAM_VITE_API_TARGET ?? "http://127.0.0.1:3001";
  const url = new URL(target);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Destino Nest inválido");
  const proxy: ProxyOptions = {
    target,
    changeOrigin: false,
    configure(server) {
      server.on("proxyReq", (outgoing, incoming) => {
        for (const name of Object.keys(incoming.headers))
          if (
            name === "authorization" ||
            name.startsWith("x-asisteam-") ||
            name.startsWith("x-forwarded-")
          )
            outgoing.removeHeader(name);
        outgoing.setHeader(
          "x-forwarded-for",
          incoming.socket.remoteAddress ?? "127.0.0.1",
        );
      });
    },
  };
  return {
    plugins: [browserBoundary(), legalPage(ACCOUNT_TERMS_2026_09_21), react()],
    resolve: {
      alias: {
        "@/lib/utils": fileURLToPath(
          new URL("../web/src/lib/utils.ts", import.meta.url),
        ),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 3130,
      strictPort: true,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex,nofollow",
      },
      proxy: {
        "/web-api/v1": proxy,
        "/auth/callback": proxy,
        "/profile/avatar/": proxy,
      },
    },
    preview: { host: "127.0.0.1", port: 3131, strictPort: true },
    build: { sourcemap: false, manifest: true },
  };
});
