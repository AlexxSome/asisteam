/** Public copy only; never include a URL, resource ID, server message or user data. */
export const unavailableResource = {
  title: "Página no disponible",
  description: "No podemos mostrar esta página. Revisa el enlace o vuelve a tus grupos para continuar.",
};

export const forbiddenResource = {
  title: "No tienes permisos",
  description: "Tu rol actual no permite realizar esta acción. Puedes volver a tus grupos y elegir otra tarea.",
};

/** Middleware responses must keep their HTTP status before React starts streaming. */
export function resourceResponseHtml(status: 403 | 404) {
  const { title, description } = status === 403 ? forbiddenResource : unavailableResource;
  return `<!doctype html><html lang="es"><head><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Asisteam</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#172033;font:1rem/1.6 system-ui,sans-serif}main{max-width:42rem;margin:clamp(1rem,8vh,5rem) auto;padding:clamp(1rem,4vw,2rem)}section{padding:clamp(1rem,4vw,2rem);border:1px solid #cbd5e1;border-radius:.75rem;background:white;overflow-wrap:anywhere}h1{font-size:clamp(1.5rem,5vw,2rem);line-height:1.2}p{color:#475569}a{display:inline-flex;min-height:44px;align-items:center;padding:.65rem 1rem;border-radius:.5rem;background:#1d4ed8;color:white;font-weight:600;text-decoration:none}a:focus-visible{outline:3px solid #1d4ed8;outline-offset:4px}
  </style></head><body><main><section><h1>${title}</h1><p>${description}</p><a href="/groups">Volver a mis grupos</a></section></main></body></html>`;
}
