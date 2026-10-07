# MIG-04 · OpenAPI y cliente web (#148)

[Seguro] Base `c9da1a348a6026c3f8a10c490600b1293aa89ab7` de `origin/develop`; rama `codex/148-openapi-cliente-web`. Fecha 2026-10-07. Worktree aislado: no incluye next-env.d.ts, .pnpm-store ni el plan local sin seguimiento del checkout del usuario. Node24.16.0, pnpm10.33.2, macOS/Docker29.3.1; fixtures sintéticos exclusivamente.

## Contrato concretado

[Seguro] [OpenAPI](../../../packages/api-client/openapi.json), schemas Zod de core y SDK ESM generado especifican el primer recorrido grupos/perfil de la [matriz MIG-01](../issue-145/contracts.md). No se serializan tipos internos de tablas. Cada operación distingue `implemented` y `contract-only` mediante `x-implementation-status`.

| Operación | Request → response | Implementación/evidencia |
| --- | --- | --- |
| `GET /api/v1/health`, `/api/v1/ready` | Sin sesión/body → `{status: ok/ready}` | [Seguro] Nest real; conserva `/health` y `/ready` operativos |
| `GET /api/v1/me/groups` | page/page_size → data[] + pagination | [Seguro] Contract-only; corresponde a v_my_groups, titular ACTIVE, roles locales, orden name/id. #151 |
| `GET /api/v1/groups/{groupId}` | UUID → GroupDetail miembro o ADMIN | [Seguro] Contract-only; v_group_detail; grupo ajeno 404. Código/settings exclusivamente proyección ADMIN. #151 |
| `POST /api/v1/groups` | groupFormSchema estricto → 201 `{group_id}` | [Seguro] Contract-only; create_group transaccional, actor de sesión, límites/cupos existentes. #151 |
| `GET /api/v1/me` | Sesión → OwnProfile | [Seguro] Contract-only; datos propios, no endpoint de terceros. #151 |
| `PATCH /api/v1/me` | profileSchema → profile + birthdate_change_pending | [Seguro] Contract-only; conserva consentimiento y revisión de fecha, sin anunciar aceptación/aplicación inmediata. #151 |

[Seguro] Paginación: page entero ≥1, default1; page_size 1–100, default50; response total entero ≥0. El handler convierte los query strings HTTP a números y valida con core; no aceptar un actor/group_id alternativo del body. Todos los DTO rechazan campos desconocidos; miembro/COACH/GUARDIAN no reciben columnas propias de ADMIN o PII de terceros. Multirol con ADMIN usa su proyección administrativa. La verificación de membership/tenant sigue perteneciendo al servidor, nunca a un rol enviado por el cliente.

[Seguro] Errores JSON comunes: code/message/details, códigos de dominio existentes conservados por sus futuros handlers. OpenAPI describe 400/401/403/404/409/422/429/500/503/504; Nest añade normalización segura de 409 y 422. El SDK conserva estado/código, descarta diagnósticos remotos y presenta mensajes fijos en español. Request inválido se rechaza antes del HTTP; output inválido falla cerrado; timeout de sesión/petición/cuerpo no reintenta writes.

## Cobertura de la matriz y etapas posteriores

[Seguro] MIG-01 contiene 49 RPC y 16 destinos PostgREST, además de Auth/archivos/Edge. **Este contrato inicial no transforma toda la matriz en handlers disponibles.** Los DTO de grupos/perfil anteriores concretan el recorrido pedido por los criterios de #148; las otras variantes/DTO se completan junto a su módulo, contra las firmas y pruebas inventariadas. No se generan clientes de operaciones con request/response todavía sin especificar.

| Matriz/entregable | Estado después de #148 |
| --- | --- |
| Auth temporal, actor/permisos, conexión/RLS/pooling · #149 | [Seguro] Pendiente; dependencia explícita para dominio |
| Grupos/perfil/configuración/selector/birthdate · #151 | [Seguro] Primeros DTO anteriores especificados; handlers, restantes variantes y consumidores UI pendientes |
| Integrantes/apoderados/consentimientos · #152; invitaciones/MANAGED · #153 | [Seguro] Matriz MIG-01 vigente; contratos completos/paridad HTTP pendientes |
| Actividades/tipos/recurrencia · #154; asistencia ADMIN/COACH · #155 | [Seguro] Matriz vigente; permisos, notas/desmarcado y DTO por rol se concretan al migrar |
| Historial/reportes/visibilidad · #156 | [Seguro] Matriz vigente; cortes Chile, métricas y proyecciones V1–V6 pendientes en HTTP |
| Billing · #158; anuncios · #159; QR · #160 | [Seguro] Capacidades autorizadas preservadas; contratos/migración pendientes |
| Storage · #161; identidad/social/corte · #162–#164 | [Seguro] Contratos ejecutables móviles, transporte push y nuevas features fuera de este PR |

## Adaptador, bandera y CI

[Seguro] [Runbook api-client](../../../packages/api-client/README.md) describe generación, configuración y consumo Next. Adaptador `server-only` verifica usuario antes de leer sesión SSR y rechaza IDs diferentes; access token nunca se retorna a UI ni se persiste en localStorage. El selector por módulo tiene un solo ejecutor, sin fallback/retry incluso tras timeout de write. Defaults actuales: Supabase; no hay tráfico de producto cambiado por este PR.

[Seguro] La declaración ASISTEAM_API_SUPABASE_URL debe coincidir con el origen Supabase actual para elegir Nest. Es validación de configuración, **no evidencia física de que Nest use esa base**: se demostrará con roles reales y conexiones en #149/#151. Las pruebas de ambos ejecutores usan el mismo backing store sintético, sin fingir una autorización SQL entregada.

[Seguro] CI obligatorio incorpora regeneración en memoria y comparación de OpenAPI/tipos/SDK, pruebas del cliente y smoke HTTP con Next real. El fixture temporal de ruta Next llama al adaptador/SDK → Nest real `/api/v1/health` y se retira en finally; no publica una ruta diagnóstica de producto. El build final conserva las 39 páginas. API solo incorpora SDK como dependencia de desarrollo para pruebas; Docker copia el workspace requerido y el runtime continúa sin herramientas de generación.

## Validación local

```sh
pnpm ci:checks
pnpm ci:backend
pnpm ci:staging
```

| Check | Resultado |
| --- | --- |
| Lint, typecheck, build, generación sin divergencia | [Seguro] PASS; Node24; CI checks 44 s aprox. |
| Unitarias core/web | [Seguro] PASS: 150/830; 81 integraciones web omitidas aquí y ejecutadas aparte |
| SDK/OpenAPI | [Seguro] PASS: 15, 0 omitidas; tipos/spec/SDK stale, errores 401/403/404/409/422/429, schema/PII, timeout, red y fixture write/read |
| Adaptador/selector Next | [Seguro] PASS: 9; sesión ausente/inválida/mezclada, un ejecutor, rollback, mismatch base, timeout sin fallback |
| API/Nest real | [Seguro] PASS: 6, 0 omitidas; alias health/readiness, error/ID/no-store; readiness 503 con fixture DB inaccesible |
| Next real → SDK → Nest real | [Seguro] PASS; Next dev/webpack, HTTP local, fixture de salud, 9.14 s; no acredita auth/RLS de dominio |
| Docker/staging/PostgreSQL real | [Seguro] PASS; dos artefactos, roles mínimos, restauración y rollback automático; PostgreSQL 17.9 sintético |
| pgTAP local | [Seguro] FAIL preexistente: 2 group_subscriptions + 1 send_invitations, reproducidos también en develop c9da1a3; no cambios SQL en #148 |
| Integraciones de producto HTTP/Edge/Postgres | [Seguro] PASS: 81/81, 0 omitidas, 50.89 s, ejecutadas aparte porque el runner backend se detiene tras pgTAP |
| CI remoto | PENDIENTE publicación/corrida; no inferir PASS |

[Seguro] Auto-revisión limitada al diff #148: contratos/proyecciones, token/caché, no fallback, generación y dependencias Docker/Turbo. No modifica SQL/RLS ni migra UI; regeneración de tipos DB no cambia respecto a base. Playwright/axe y revisión visual OMITIDOS: no cambia rutas/estados/UI de producto; la ruta Next del smoke es temporal. Los archivos de evidencia `.ci-results` contienen solo resultados/tiempos/conteos y base; los commits de entrega se consultan en Git/PR.

[Seguro] Límite de entrega: el gate backend permanece fallido por pgTAP preexistente y debe resolverse antes de aprobar CI. Este PR entrega infraestructura de contrato/cliente; #149/#151 siguen necesarios para el recorrido de **dominio** Next → Nest → PostgreSQL con aislamiento y permisos reales. No provisiona servicios, migra tráfico ni cierra #148 automáticamente.
