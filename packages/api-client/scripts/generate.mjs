import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { httpSchemas, httpOperations, HTTP_ERROR_STATUSES } from '@asisteam/core/runtime';

const ref = name => ({ $ref: `#/components/schemas/${name}` });
const json = schema => ({ 'application/json': { schema } });
export function document() {
  const schemas = Object.fromEntries(Object.entries(httpSchemas).map(([name, schema]) => [name, zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' })]));
  const paths = {};
  for (const [operationId, operation] of Object.entries(httpOperations)) {
    const parameters = [];
    for (const [location, name] of [['path', operation.params], ['query', operation.query]]) {
      if (!name) continue;
      for (const [key, schema] of Object.entries(schemas[name].properties)) parameters.push({ name: key, in: location, required: location === 'path' || (schemas[name].required ?? []).includes(key), schema });
    }
    const responses = Object.fromEntries(HTTP_ERROR_STATUSES.map(status => [status, { description: `Error ${status}; sin SQL, tokens ni datos privados`, content: json(ref('ApiError')) }]));
    responses[operation.status] = { description: 'Respuesta válida', content: json(ref(operation.response)) };
    paths[operation.path] ??= {};
    paths[operation.path][operation.method.toLowerCase()] = {
      operationId, summary: operation.summary, tags: [operation.module],
      'x-implementation-status': operation.state, security: operation.authenticated ? [{ bearerAuth: [] }] : [],
      ...(parameters.length ? { parameters } : {}),
      ...(operation.body ? { requestBody: { required: true, content: json(ref(operation.body)) } } : {}), responses,
    };
  }
  return { openapi: '3.0.3', info: { title: 'Asisteam HTTP', version: '1.0.0', description: 'MIG-17. Avatar privado S3 con validación y permisos SQL, URLs firmadas internas. MIG-16. QR/configuración/llegada propia implementados sobre firma, reloj y claves SQL existentes. Anuncios/preferencias/tokens implementados; Expo en worker con handoff SQL. Billing/ledger y checkout implementados con motor compartido y ejecutor SQL único; webhook firmado fuera del SDK autenticado. Historial/reportes y asistencia y actividades/tipos/series e invitaciones/claim e integrantes/apoderados/consentimientos y grupos/perfil implementados con sesión temporal y SQL canónico. Refines Zod (edad/roles/URLs) y reglas SQL no se sustituyen por JSON Schema.' }, paths, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas } };
}

export async function artifacts() {
  const spec = document();
  let sdk = '// Generado desde OpenAPI y core. Ejecuta pnpm api:generate; no editar.\nimport type { operations } from "./openapi.js";\nimport { ApiTransport } from "./transport.js";\nexport class ApiClient extends ApiTransport {\n';
  for (const [id, operation] of Object.entries(httpOperations)) {
    const fields = [];
    if (operation.params) fields.push(`params: operations["${id}"]["parameters"]["path"]`);
    if (operation.query) fields.push(`query?: operations["${id}"]["parameters"]["query"]`);
    if (operation.body) fields.push(`body: operations["${id}"]["requestBody"]["content"]["application/json"]`);
    const optional = !operation.params && !operation.body;
    const argument = fields.length ? `input${optional ? '?' : ''}: { ${fields.join('; ')} }` : '';
    sdk += `  ${id}(${argument}): Promise<operations["${id}"]["responses"][${operation.status}]["content"]["application/json"]> {\n    return this.execute("${id}", ${fields.length ? 'input ?? {}' : '{}'});\n  }\n`;
  }
  sdk += '}\n';
  return { 'openapi.json': JSON.stringify(spec, null, 2) + '\n', 'src/openapi.ts': astToString(await openapiTS(spec)), 'src/generated.ts': sdk };
}

export function staleArtifacts(expected, read) {
  return Object.entries(expected).filter(([name, content]) => read(name) !== content).map(([name]) => name);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const expected = await artifacts();
  if (process.argv.includes('--check')) {
    const stale = staleArtifacts(expected, name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
    for (const name of stale) console.error(`Divergencia del contrato: ${name}`);
    if (stale.length) process.exitCode = 1;
  } else {
    for (const [name, content] of Object.entries(expected)) writeFileSync(new URL(`../${name}`, import.meta.url), content);
  }
}
