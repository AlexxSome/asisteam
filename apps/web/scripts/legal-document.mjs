import { readFileSync } from "node:fs";
import { SUPPORT_REQUEST_URLS } from "../src/lib/support.ts";
// The no-JavaScript notice uses the same color tokens as the React pages.
const tokens = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8").match(/:root \{[\s\S]*?\n\}/)?.[0];
if (!tokens) throw new Error("Tokens visuales no disponibles");
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function legalDocument(notice) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Condiciones de uso y privacidad · Asisteam</title><style>${tokens}
*{box-sizing:border-box}body{font:16px/1.5 system-ui;background:var(--background);color:var(--foreground);margin:0}main{max-width:42rem;margin:auto;padding:2rem 1rem;overflow-wrap:anywhere}header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:24px}a{display:inline-flex;min-height:44px;align-items:center;color:var(--primary);text-underline-offset:4px}a:focus-visible{outline:2px solid var(--focus);outline-offset:2px}.brand{font-size:20px;font-weight:600;text-decoration:none}.card{border:1px solid var(--border);border-radius:8px;background:var(--surface);padding:16px}.card section{margin-top:24px}h1{font-size:24px;line-height:32px;margin:0;font-weight:600}h2{font-size:20px;line-height:28px;font-weight:600}p{margin:12px 0}.version{color:var(--neutral)}.skip{position:absolute;left:-10000px}.skip:focus{left:16px;top:8px;background:var(--surface);padding:12px}@media(min-width:768px){main{padding:2rem 24px}.card{padding:24px}h1{font-size:28px;line-height:36px}}</style></head><body><a class="skip" href="#main">Saltar al contenido</a><main id="main" tabindex="-1"><header><a class="brand" href="/login">Asisteam</a><a href="${escape(SUPPORT_REQUEST_URLS.help)}">Ayuda y soporte</a></header><section class="card"><h1>Condiciones de uso y privacidad</h1><p class="version">Versión ${escape(notice.version)}</p><section id="condiciones"><h2>Condiciones de uso</h2><p>${escape(notice.purpose)}</p><p>${escape(notice.minors)}</p></section><section id="privacidad"><h2>Privacidad de tus datos</h2><p>${escape(notice.visibility)}</p><p>${escape(notice.rights)}</p></section><p>Consultar este aviso no registra una aceptación.</p></section></main></body></html>`;
}
/** @returns {import('vite').Plugin} */
export function legalPage(notice) {
  const html = legalDocument(notice);
  const serve = (server) => {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] === "/legal/" + notice.version) {
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
          response.setHeader("Referrer-Policy", "no-referrer");
          response.setHeader("X-Content-Type-Options", "nosniff");
          response.end(html);
        } else next();
      });
    };
  return {
    name: "asisteam-legal-static",
    configureServer: serve,
    configurePreviewServer: serve,
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "legal/" + notice.version + "/index.html",
        source: html,
      });
    },
  };
}
