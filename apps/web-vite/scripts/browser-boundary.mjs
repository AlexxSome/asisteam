import { builtinModules } from "node:module";
const builtins = new Set(
  builtinModules.map((name) => name.replace(/^node:/, "")),
);
export function forbiddenImport(id) {
  return (
    ["pg", "argon2", "jose", "@nestjs/common", "@nestjs/core"].includes(id) ||
    id.startsWith("@nestjs/") ||
    id === "next" ||
    id.startsWith("next/") ||
    id === "server-only" ||
    id === "@asisteam/db" ||
    id.startsWith("@asisteam/db/") ||
    id.startsWith("node:") ||
    builtins.has(id) ||
    /(?:^|\/)packages\/db(?:\/|$)/.test(id) ||
    /(?:^|\/)(?:apps\/(?:api|worker)|[^/]+\.server\.[cm]?[jt]sx?)(?:\/|$)/.test(
      id,
    ) ||
    /packages\/core\/src\/(?:billing\/handler|announcement-push)\.ts$/.test(
      id,
    ) ||
    /(?:^|\/)web\/src\/(?:lib\/api|app\/.*(?:actions|route)\.[jt]s)/.test(id)
  );
}
/** @returns {import('vite').Plugin} */
export function browserBoundary() {
  return {
    name: "asisteam-browser-boundary",
    enforce: "pre",
    resolveId(id, importer) {
      if (importer && forbiddenImport(id))
        throw new Error("Import de servidor prohibido en navegador: " + id);
    },
    generateBundle(_options, bundle) {
      const ids = [...this.getModuleIds()];
      for (const id of ids)
        if (forbiddenImport(id))
          throw new Error("Módulo de servidor en bundle");
      this.emitFile({
        type: "asset",
        fileName: "browser-modules.json",
        source: JSON.stringify(
          ids
            .map((id) => id.replaceAll("\\", "/").split("/asisteam/").at(-1))
            .filter((id) => !id.startsWith("\u0000")),
          null,
          2,
        ),
      });
    },
  };
}
export function publicEnvironment(env) {
  for (const key of Object.keys(env))
    if (key.startsWith("VITE_") && key !== "VITE_APP_NAME")
      throw new Error("Variable pública no autorizada: " + key);
  return env.VITE_APP_NAME ?? "Asisteam";
}
