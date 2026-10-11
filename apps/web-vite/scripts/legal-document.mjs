const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function legalDocument(notice) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Condiciones de uso y privacidad · Asisteam</title><style>html{color-scheme:only light}body{font:16px/1.5 system-ui;background:#f8fafc;color:#0f172a;margin:0}main{max-width:42rem;margin:auto;padding:2rem 1rem}section{margin:2rem 0}h1{font-size:1.5rem}h2{font-size:1.25rem}</style></head><body><main><h1>Condiciones de uso y privacidad</h1><p>Versión ${escape(notice.version)}</p><section id="condiciones"><h2>Condiciones de uso</h2><p>${escape(notice.purpose)}</p><p>${escape(notice.minors)}</p></section><section id="privacidad"><h2>Privacidad de tus datos</h2><p>${escape(notice.visibility)}</p><p>${escape(notice.rights)}</p></section><p>Consultar este aviso no registra una aceptación.</p></main></body></html>`;
}
/** @returns {import('vite').Plugin} */
export function legalPage(notice) {
  const html = legalDocument(notice);
  return {
    name: "asisteam-legal-static",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] === "/legal/" + notice.version) {
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
          response.setHeader("Referrer-Policy", "no-referrer");
          response.setHeader("X-Content-Type-Options", "nosniff");
          response.end(html);
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "legal/" + notice.version + "/index.html",
        source: html,
      });
    },
  };
}
