import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { forbiddenImport } from "./browser-boundary.mjs";
const modules = JSON.parse(readFileSync("dist/browser-modules.json", "utf8"));
assert.ok(modules.length > 0);
for (const id of modules)
  assert.ok(
    !forbiddenImport(id) &&
      !/(?:node_modules\/(?:\.pnpm\/)?next(?:@|\/)|server-only|packages\/db\/|apps\/(?:api|worker)\/)/.test(
        id,
      ),
    "Dependencia de servidor",
  );
const files = (root) =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(root, entry.name))
      : [join(root, entry.name)],
  );
for (const path of files("dist")) {
  assert.ok(!path.endsWith(".map"), "Sourcemap público");
  const content = readFileSync(path, "utf8");
  assert.ok(
    !/(?:WEB215_PRIVATE_CANARY|postgres(?:ql)?:\/\/|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|process\.env\.(?:NATIVE_|DATABASE_|RESEND_|S3_|INVITATION_))/.test(
      content,
    ),
    "Credencial o configuración privada",
  );
}
console.log(
  JSON.stringify({
    check: "vite-browser-artifact",
    status: "PASS",
    modules: modules.length,
  }),
);
