# API · MIG-02 (#146)

[Seguro] Runtime independiente NestJS **12.1.2**, adaptador Express **12.1.2**, Node **24.16.0 LTS**, TypeScript 5.9.3 y pg 8.23.1. La API expone únicamente sondas operativas; los módulos de producto, la sesión/RLS (#149), OpenAPI (#148) y CI/staging (#147) siguen sus entregables.

## Build y arranque

[Seguro] Desde la raíz, con Node 24.16.0 y pnpm 10.33.2:

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build typecheck test --filter @asisteam/api
DATABASE_URL=postgresql://asisteam_runtime:synthetic-only@127.0.0.1:55466/asisteam_test pnpm --filter @asisteam/api start
```

[Seguro] El arranque recibe variables del proceso; no carga archivos `.env` automáticamente. `.env.example` contiene solo un fixture local. `pnpm --filter @asisteam/api dev` compila y observa el JavaScript de `dist`; después de editar TypeScript, ejecutar el build o `pnpm --filter @asisteam/api exec tsc --watch` en otra terminal.

[Seguro] `@asisteam/core/runtime` exporta JavaScript ESM y declaraciones compiladas. Los consumidores existentes de `@asisteam/core` conservan su entrada fuente. El filtro HTTP valida su respuesta mediante `apiErrorResponseSchema` de core; no duplica el contrato de error. El bundle core conserva sus dependencias externas y no usa rutas `.ts` en ejecución. Las declaraciones convierten specifiers relativos a `.js` para NodeNext.

## Configuración validada e inyectada

| Variable | Default / límite |
| --- | --- |
| `DATABASE_URL` | Obligatoria, URL postgres/postgresql con host y base; valor nunca se imprime |
| `NODE_ENV` | development; development/test/production |
| `HOST`, `PORT` | 0.0.0.0, 3001; puerto 0 permite fixture efímero |
| `PG_POOL_MAX` | 10; 1–50 por proceso |
| `PG_CONNECT_TIMEOUT_MS` | 2000 |
| `PG_STATEMENT_TIMEOUT_MS` | 3000; timeout PostgreSQL y cliente pg |
| `HTTP_TIMEOUT_MS` | 5000; respuesta HTTP, headers y recepción de petición |
| `SHUTDOWN_TIMEOUT_MS` | 10000; deadline de SIGINT/SIGTERM |

[Seguro] Todos los tiempos aceptan 100–120000 ms. Config inválida: exit 1 y evento `configuration_invalid` con nombres de campos; nunca valores, stack ni errores de Zod. Pool limitado y perezoso: el proceso puede iniciar con PostgreSQL indisponible. En despliegue, inyectar credencial del rol mínimo, URL TLS con verificación de certificado y configuración por entorno; no usar el superusuario del fixture como rol de producto.

[Seguro] El timeout HTTP limita la respuesta; no cancela efectos de un futuro servicio. Las sondas tienen además límites de conexión/statement pg. Los futuros repositorios deben mantener transacciones y cancelación coherentes con #149. SIGINT/SIGTERM cierran HTTP y pool, drenan solicitudes y conexiones y terminan con 0; al exceder el deadline se emite `shutdown_timeout` y exit 1.

## HTTP y privacidad

| Ruta | Contrato |
| --- | --- |
| `GET /health` | 200 `{ "status": "ok" }`; vida del proceso independientemente de DB |
| `GET /ready` | 200 `{ "status": "ready" }` tras `SELECT 1`; 503 `service_unavailable` si PostgreSQL no responde |

[Seguro] Errores: `{ "error": { "code": "...", "message": "texto en español", "details": {} } }`. Rutas inexistentes: 404 `resource_not_found`; JSON inválido: 400 `invalid_request`; body >64 KiB: 413 `payload_too_large`; plazo agotado: 504 `request_timeout`; excepción inesperada: 500 `internal_error`. El filtro no serializa mensajes/stack/SQL internos.

[Seguro] Cada respuesta lleva UUID local en `x-request-id` y `cache-control: no-store`; el header de entrada no se reutiliza. Logs JSON por allowlist: fecha, nivel, evento, request_id, status y duración; no registran URL/query, headers, body, identidad, configuración ni excepción. Los mensajes libres del framework se sustituyen por eventos fijos. No existe CORS habilitado ni endpoint de escritura de producto en este entregable.

## Contenedor y PostgreSQL sintético

```sh
docker compose -p asisteam-issue146 -f apps/api/compose.smoke.yml up --build -d --wait
node apps/api/test/container-smoke.mjs
API_TEST_DATABASE_URL=postgresql://asisteam_runtime:synthetic-only@127.0.0.1:55466/asisteam_test pnpm --filter @asisteam/api test:integration
docker compose -p asisteam-issue146 -f apps/api/compose.smoke.yml down -v
```

[Seguro] El smoke detiene y recupera solo los servicios del proyecto Docker `asisteam-issue146`. Usa puertos loopback 30466/55466 y credenciales sintéticas públicas; no usarlo sobre un despliegue. PostgreSQL 17.9 es un fixture vacío, sin datos reales ni tablas de negocio. El usuario creado por la imagen es superusuario: esta prueba valida conectividad, no permisos/RLS.

[Seguro] Docker construye desde fuentes con lockfile congelado, compila core y API y usa `pnpm deploy --legacy --prod`. La etapa final ejecuta `node dist/main.js` como usuario node (UID 1000), sin TypeScript/esbuild/Vitest/CLI Nest ni fuentes TS de core/API. HEALTHCHECK mide liveness; el balanceador debe usar `/ready` para admisión. El build puede ejecutarse con `docker build -f apps/api/Dockerfile .` desde un checkout limpio.

[Seguro] Evidencia y límites: [MIG-02](../../docs/migration/issue-146/README.md). Compatibilidad consultada: [Nest 12](https://docs.nestjs.com/migration-guide), [Node LTS](https://nodejs.org/en/about/previous-releases), [pool pg](https://node-postgres.com/apis/pool). Las versiones concretas y peers se contrastaron además con el registro npm.
