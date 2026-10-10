# API · MIG-02/MIG-05/MIG-07/MIG-08/MIG-09 (#146, #149, #151, #152, #153)

[Seguro] MIG-24 (#168): runtime JWT nativo únicamente, configuración Auth propia completa obligatoria en producción, sin GoTrue/JWKS ni puente de invitaciones. [Inventario y evidencia](../../docs/migration/issue-168/README.md). Los fixtures `test/legacy-src` no entran en dist ni Docker. Producción continúa NO-GO.

[Seguro] Runtime independiente NestJS **12.1.2**, adaptador Express **12.1.2**, Node **24.16.0 LTS**, TypeScript 5.9.3 y pg 8.23.1. La API expone sondas operativas y `GET /api/v1/auth/session` con sesión/RLS temporal de [MIG-05](../../docs/migration/issue-149/README.md); grupos/perfil tienen handlers reales en [MIG-07](../../docs/migration/issue-151/README.md); integrantes/apoderados/consentimientos tienen handlers reales en [MIG-08](../../docs/migration/issue-152/README.md); invitaciones/activación tienen handlers reales en [MIG-09](../../docs/migration/issue-153/README.md); otros dominios siguen #154–#160. [OpenAPI/cliente #148](../../packages/api-client/README.md) y [CI/staging #147](../../docs/migration/issue-147/README.md) tienen infraestructura entregada y evidencia separada; no acreditan migración de tráfico.

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
| `SUPABASE_AUTH_URL` | Opcional junto a la clave pública; emisor HTTPS terminado en `/auth/v1` (HTTP solo localhost no productivo) |
| `SUPABASE_AUTH_PUBLIC_KEY` | Clave publishable o JWT legacy con role anon; service_role rechazado |
| `AUTH_TIMEOUT_MS` | 2000; verificación online y JWKS |
| `PG_POOL_MAX` | 10; 1–50 por proceso |
| `PG_CONNECT_TIMEOUT_MS` | 2000 |
| `PG_STATEMENT_TIMEOUT_MS` | 3000; timeout PostgreSQL y cliente pg |
| `HTTP_TIMEOUT_MS` | 5000; respuesta HTTP, headers y recepción de petición |
| `SHUTDOWN_TIMEOUT_MS` | 10000; deadline de SIGINT/SIGTERM |

[Seguro] Todos los tiempos aceptan 100–120000 ms. Config inválida: exit 1 y evento `configuration_invalid` con nombres de campos; nunca valores, stack ni errores de Zod. Pool limitado y perezoso: el proceso puede iniciar con PostgreSQL indisponible. En despliegue, inyectar credencial del rol mínimo, URL TLS con verificación de certificado y configuración por entorno; no usar el superusuario del fixture como rol de producto.

[Seguro] El timeout HTTP limita la respuesta; no cancela efectos de un futuro servicio. Las sondas tienen además límites de conexión/statement pg. Los repositorios de dominio deben usar `Database.authenticated()`; el timeout HTTP no equivale a rollback de una operación todavía activa. SIGINT/SIGTERM cierran HTTP y pool, drenan solicitudes y conexiones y terminan con 0; al exceder el deadline se emite `shutdown_timeout` y exit 1.

## HTTP y privacidad

| Ruta | Contrato |
| --- | --- |
| `GET /health` | 200 `{ "status": "ok" }`; vida del proceso independientemente de DB |
| `GET /ready` | 200 `{ "status": "ready" }` tras conexión; con Auth configurado exige rol/grants seguros de MIG-05; 503 `service_unavailable` si PostgreSQL no responde |
| `GET /api/v1/health`, `GET /api/v1/ready` | Aliases de las mismas sondas, validados con schemas HTTP core y consumidos por el SDK de #148 |

[Seguro] Errores: `{ "error": { "code": "...", "message": "texto en español", "details": {} } }`. Rutas inexistentes: 404 `resource_not_found`; JSON inválido: 400 `invalid_request`; body >64 KiB: 413 `payload_too_large`; plazo agotado: 504 `request_timeout`; excepción inesperada: 500 `internal_error`. El filtro no serializa mensajes/stack/SQL internos.

[Seguro] Cada respuesta lleva UUID local en `x-request-id` y `cache-control: no-store`; el header de entrada no se reutiliza. Logs JSON por allowlist: fecha, nivel, evento, request_id, status y duración; no registran URL/query, headers, body, identidad, configuración ni excepción. Los mensajes libres del framework se sustituyen por eventos fijos. CORS permanece deshabilitado; los handlers de dominio reciben llamadas del adaptador servidor Next. La sesión se recibe como Bearer desde el adaptador servidor Next, conservando cookies SSR fuera de esta API.

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

## Sesión temporal y rol PostgreSQL · MIG-05

[Seguro] Aplicar `pnpm exec supabase migration up --local` y regenerar tipos. La migración crea `asisteam_api`, `asisteam_jobs` y `asisteam_webhook` **NOLOGIN**, sin passwords. Un administrador provisiona LOGIN y credenciales externas del rol API, TLS y límites del pool en el entorno; nunca usar `postgres`, un propietario de tablas ni `service_role` como `DATABASE_URL` de producto. Los roles jobs/webhook quedan separados y sin grants de dominio: sus capacidades se implementarán con sus entregables, no mediante este runtime. El migrador conserva su conexión administrativa separada.

[Seguro] Configurar `SUPABASE_AUTH_URL=https://<proyecto>.supabase.co/auth/v1` y su clave **pública** del mismo proyecto junto a la URL PostgreSQL. No se configura JWT secret compartido. Sin esas dos variables, sesión devuelve 401 y las sondas siguen operativas. Con ellas, readiness falla con 503 ante rol incorrecto, BYPASSRLS, ownership propio/heredado, acceso a service_role, CREATE en schemas o adaptador no instalado. La relación física Auth/base se comprueba por sesión y perfil existentes en esa base; la declaración del emisor no la demuestra por sí sola.

[Seguro] El verificador admite ES256/RS256 mediante JWKS del origen configurado y HS256 legacy mediante GoTrue `/user`. Siempre verifica `/user`, issuer, audience authenticated, tiempos, sub y session_id UUID; nunca sigue jku/issuer del token ni redirects. GoTrue indisponible falla cerrado; `/user` 429/5xx o timeout devuelve 503. No cachea decisiones de sesión; JWKS tiene caché de 60 segundos. El contexto solo contiene sub, session_id y el rol SQL constante authenticated; descarta roles/tenant/actor de cliente.

[Seguro] `Database.authenticated(identity, callback)` reserva una sola conexión, abre BEGIN, instala GUCs **LOCAL** y valida sesión/perfil ACTIVE mediante el adaptador privado; ejecuta todas las consultas del callback y revalida antes de COMMIT. La sesión se bloquea KEY SHARE hasta terminar, serializando eliminación/logout con writes en curso. No prebloquea el perfil: las RPC pueden adquirir sus propios locks sin upgrades concurrentes. ROLLBACK limpia contexto; si falla, destruye la conexión. Un objeto de transacción usado después del callback se rechaza.

[Seguro] Dentro del callback, usar `requireMembership(tx, groupId, allowedRoles)` antes del servicio de grupo y sus vistas/RPC existentes: membership ACTIVE se obtiene de SQL, grupo ajeno/ausente 404 y acción no permitida 403. `projectGroupDetail()` proyecta columnas explícitas con schemas core y unión de roles ADMIN. Estas funciones reutilizables no publican handlers de dominio. El endpoint de sesión retorna solo `{user_id}` de public.users; nunca tokens ni datos de terceros.

```sh
pnpm ci:checks
pnpm ci:backend
# Repetición específica (requiere build y Supabase local):
API_RLS_TEST=1 pnpm --filter @asisteam/api exec node --test --test-reporter=tap test/session-rls.integration.mjs
pnpm exec supabase test db supabase/tests/api_session_rls.test.sql
```

[Seguro] Las integraciones admiten exclusivamente Supabase loopback, crean fixtures sintéticos y restauran LOGIN/password del rol después de la prueba. La segunda usa GoTrue real (registro/logout); la primera usa un emisor sintético y SQL real, incluidas rutas de fixture que no forman parte de la app publicada. [Evidencia, auditoría y fallo pgTAP de base](../../docs/migration/issue-149/README.md).

## Grupos y perfil · MIG-07

[Seguro] [Contrato y runbook](../../docs/migration/issue-151/README.md) especifican los handlers reales bajo `/api/v1`, sesión/aviso, RLS, DTO por rol, código, revisión de edad y permisos de imagen. La implementación reutiliza SQL canónico y la conexión mínima de MIG-05; no permite elegir actor/role/function SQL desde HTTP. El runtime sigue usando PostgreSQL/Auth del mismo proyecto Supabase. Nest no sirve bytes de Storage todavía.

[Seguro] Backend CI exige `API_RLS_TEST=1` para las suites de sesión y grupos/perfil, sin omisiones. QA extendida ejecuta Next con GROUPS/PROFILE=nest a375px. Para activar las banderas de producto, configurar el origen API y el mismo proyecto según el [runbook de cliente](../../packages/api-client/README.md); retornar a supabase conserva datos y nunca dispara fallback ante errores.

## Integrantes, apoderados y consentimiento · MIG-08 (#152)

[Seguro] [MIG-08](../../docs/migration/issue-152/README.md) documenta 17 operaciones HTTP/SDK sobre las mismas RPC/vistas autorizadas: nómina ADMIN/búsqueda, MANAGED, revisión de pendientes, bajas/reactivaciones, COACH, vínculo, onboarding, consentimiento de datos, pupilos y aceptación vigente de cuenta. El actor siempre procede de SessionGuard; schemas estrictos rechazan campos extra. `asisteam_api` ejecuta SQL parametrizado con RLS. No se copian R1, cupos ni locks a Nest.

[Seguro] `GET /account-consents/current` y `POST /account-consents` bajo `/api/v1` permiten completar la aceptación previa; conservan sesión vigente, perfil ACTIVE y contexto RLS, y omiten únicamente el gate que permitirían satisfacer. El resto exige consentimiento vigente. Invitaciones, activación de credenciales y jobs de mayoría/revocación conservan su adaptador temporal (#153/#160).

## Invitaciones y activación · MIG-09 (#153)

[Seguro] [Contrato, runbook y evidencia](../../docs/migration/issue-153/README.md) registran nueve operaciones HTTP/SDK de INVITATIONS: envío/reenvío/activación, preview, aceptación existente, registro dirigido, claim MANAGED, lista y solicitud/revisión/lista de activación. Nest reutiliza RPC/locks/triggers canónicos; no recibe actor desde HTTP.

[Seguro] Configurar INVITATION_DATABASE_URL del rol asisteam_invitation en el mismo host/puerto/base que DATABASE_URL; la migración lo crea NOLOGIN, sin password ni tablas/ownership/BYPASSRLS, con cinco RPC de registro/ratelimit. Provisionar LOGIN/password externos. INVITATION_PROXY_SECRET (≥32 caracteres) se comparte exclusivamente con Next; INVITATION_AUTH_BRIDGE_SECRET independiente (≥32) se comparte exclusivamente con la Edge invitation-auth. RESEND_API_KEY, INVITATION_EMAIL_FROM e INVITATION_WEB_URL configuran envío. HTTP_TIMEOUT_MS=30000 y ASISTEAM_API_TIMEOUT_MS=30000 permiten los deadlines externos de 10 s; un timeout no revierte efectos confirmados.

[Seguro] La service_role sigue exclusivamente en Edge/CI, conforme AGENTS/doc07. El bridge temporal ejecuta solo createUser con secreto y nonce reservado por Nest; el trigger Auth consume la reserva y enlaza/acepta atómicamente. Su retirada corresponde a #162/#164: esta entrega no elimina Supabase Auth ni acredita envío externo Resend. Ausencia de configuración falla cerrado, sin fallback.


## Historial/reportes · MIG-12 (#156)

[Seguro] [Contrato, activación y evidencia](../../docs/migration/issue-156/README.md): cuatro GET de historial propio/pupilos, reporte ADMIN/COACH y stats del grupo con toggles. Usan Database.authenticated, sesión/consentimiento y membership ACTIVE, más RPC canónicas por operación. El rol asisteam_api ya dispone de grants: no se añade SQL/migración. API_RLS_TEST=1 habilita reports.integration.mjs; CI backend exige su ejecución sin omisiones. La medición p95 compara HTTP local con SQL autenticado sobre500 deportistas sintéticos.


## Billing y webhook · MIG-14 (#158)

[Seguro] [Contrato y runbook](../../docs/migration/issue-158/README.md) describen GET billing ADMIN, POST checkout/sync/cancel y webhook firmado. BILLING_DATABASE_URL usa asisteam_billing mínimo sobre la misma base; secretos MP y URLs HTTPS pertenecen al proceso Nest, sin service_role. Adaptadores SQL LEGACY/NEST impiden efectos por ambos transportes; handoff requiere quiescencia externa. Timeouts60s y recuperación de referencia para creación incierta; no repetir POST a ciegas. El antiguo webhook puede reenviar body/firma y esperar acuse persistido Nest. Sandbox real/corte externo siguen pendientes.

## QR y llegada propia · MIG-16 (#160)

[Seguro] [Contrato, compatibilidad y evidencia](../../docs/migration/issue-160/README.md) implementa getQrSettings/setQrSettings/issueCheckinQr/selfCheckin. QR=nest selecciona las cuatro acciones web sobre la misma DB. Sesión/consentimiento vigentes y permisos SQL canónicos; HMAC-SHA256, claves privadas, reloj, ventana y locks permanecen en PostgreSQL. Token solo en body HTTP y fragmento web retirado; errores/logs sin payloads reutilizables. Códigos emitidos por el transporte anterior siguen válidos hasta su límite original sobre la misma base; no hay rotación/retirada de claves en este entregable.
