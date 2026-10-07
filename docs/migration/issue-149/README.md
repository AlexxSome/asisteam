# MIG-05 · Sesión temporal y contexto PostgreSQL con RLS (#149)

[Seguro] Base `e7bc9ffdc7853637ff8b6624914402e78c493097` de origin/develop; rama `codex/149-sesion-contexto-rls`. Fecha 2026-10-07; Node24.16.0, pnpm10.33.2, PostgreSQL17 de Supabase local en Docker/macOS. Los JSON registran la base y el diff pendiente validado; el commit de entrega se obtiene de Git/PR. Worktree aislado: conserva fuera de este cambio next-env.d.ts, .pnpm-store y el plan local no seguido del usuario. Dependencias #146–#148 cerradas y presentes en la base.

## Implementación y límites

[Seguro] `apps/api` es NestJS12.1.2/TypeScript con pg8.23.1 y JOSE6.2.2. El backend canónico de dominio sigue siendo Supabase; Java corresponde a Android planificado. Se implementa únicamente `GET /api/v1/auth/session` con DTO estricto `{user_id}`, además de infraestructura reutilizable de sesión, transacción, membership ACTIVE y proyección de grupos. Los handlers de dominio #151–#160 y el corte de tráfico no forman parte de MIG-05. No cambia UI, contratos RPC existentes ni reglas de negocio.

| Frontera | Decisión verificable |
| --- | --- |
| Token | [Seguro] Firma ES256/RS256 por JWKS fijo; HS256 legacy por GoTrue real, sin secreto compartido en Nest. Issuer, audience authenticated, exp/iat/nbf, sub y session_id válidos. Siempre GoTrue `/user`, ID consistente; sin redirects ni origen del token. |
| Revocación/perfil | [Seguro] Cada transacción consulta sesión real, usuario no borrado/baneado y perfil ACTIVE; verifica nuevamente antes de COMMIT. JWT expirado/perfil ausente/MANAGED y logout fallan 401. GoTrue indisponible/timeout/429/5xx falla cerrado con 503. |
| Contexto | [Seguro] Identidad sellada por verificador, GUCs LOCAL en una conexión reservada, rol SQL constante authenticated; no usa role/group_id/actor de cliente. COMMIT/ROLLBACK y destrucción ante rollback fallido; transacción fuera del callback rechazada. |
| Runtime | [Seguro] API exige asisteam_api sin ownership directo/heredado, superusuario, BYPASSRLS, CREATE ni membresía service_role. Hereda permisos authenticated por grant INHERIT true, SET false; mantiene RLS y RPC existentes. |
| Roles separados | [Seguro] Migración con postgres separado; jobs y webhook NOLOGIN sin grants de dominio. No se provisionan passwords/servicios externos ni capacidades futuras por inferencia. |
| Grupo/DTO | [Seguro] Membership ACTIVE SQL en la misma transacción, 404 anti-enumeración y 403 acción prohibida; multirol ADMIN conserva unión. Proyección por columnas explícitas, schemas core estrictos, sin PII de terceros. |

[Seguro] El [runbook API](../../../apps/api/README.md#sesión-temporal-y-rol-postgresql--mig-05) documenta variables, rol LOGIN provisionado externamente, TLS, conexión del mismo proyecto Auth/base, pooling y fallos. Configuración Auth ausente devuelve 401 en sesión; sondas siguen disponibles. Con Auth configurado, readiness también verifica rol/adaptador seguro. Los timeouts HTTP no prometen cancelar efectos en curso; el callback debe conservar la transacción y RPC canónica.

[Seguro] La sesión usa KEY SHARE de auth.sessions para serializar su eliminación con una operación en curso. No prebloquea public.users: evita deadlock al convertir locks de perfil en RPC concurrentes. Revalidación antes del COMMIT rechaza sesión expirada durante el callback y revierte writes. La misma conexión con pool max1 alterna actores/grupos; no retiene claims tras commit/rollback. Dos conexiones pueden bloquear su propio perfil FOR UPDATE sin ciclo de locks introducido por el adaptador.

## Auditoría SECURITY DEFINER

[Seguro] [Inventario de catálogo](security-definer-audit.json): 110 funciones public/app_private, propietario postgres, todas con search_path fijo. 65 ejecutables por API: 64 permisos compatibles con authenticated ya existentes más el adaptador privado de sesión; 45 funciones de servicios/internas quedan excluidas. API no es propietario ni puede crear objetos en esos schemas. El adaptador nuevo usa search_path vacío, referencias calificadas y grant exclusivo asisteam_api; authenticated/anon/service_role/jobs/webhook no pueden ejecutarlo.

[Seguro] La frontera del actor está registrada por función: el adaptador liga auth.uid a session_id y perfil; las firmas compatibles con authenticated no aceptan un actor autenticado alternativo (los IDs de grupo/pupilo/membership son destinos que mantienen su validación SQL). Funciones de servicios con actor explícito no reciben grant API. `handle_new_user` es trigger, no invocable como función ordinaria; API no puede crear un trigger para reutilizarlo. Helpers/RPC existentes conservan sus checks internos; suites pgTAP y las negativas runtime comprueban contexto, permisos y COACH. El inventario no sustituye una auditoría manual exhaustiva futura de cada cuerpo ni habilita ejecución genérica de funciones desde HTTP.

[Seguro] Auto-revisión limitada al diff #149: firma y origen fijo, roles no confiables, separación de privilegios, revocación, LOCAL/pooling/rollback, DTOs y gates CI. Correcciones comprobadas: ciclo de imports/decoradores separado en identity.ts, bloqueo previo de perfil eliminado para evitar deadlocks, ownership heredado también rechazado y revalidación antes de COMMIT. No modifica el fallo preexistente de invitaciones ni capacidades fuera del issue.

## Verificación local

| Check | Resultado y evidencia |
| --- | --- |
| `pnpm ci:checks` | [Seguro] PASS: lint, generación contrato sin divergencia, typecheck, build y Next real→SDK→Nest; [checks.json](checks.json). |
| Unitarias | [Seguro] Core150, web830 (81 omitidas en unitarias y ejecutadas aparte), API10, cliente15 PASS; sin omisiones en API/cliente. |
| Migración y tipos | [Seguro] PASS `migration up --local`; `supabase gen types typescript --local` coincide con packages/db (sin cambio semántico: función app_private no se publica). [backend.json](backend.json). |
| pgTAP afectado | [Seguro] PASS 16/16 en api_session_rls.test.sql: rol real, ownership/grants, contexto ausente, sesiones no legibles, aislamiento jobs/webhook y search_path. |
| Integración Nest/SQL y GoTrue | [Seguro] PASS 2/2, 0 omitidas ([session-checks.json](session-checks.json)): firma/issuer/audience/exp, claims manipulados, perfil/membresía ACTIVE, revocación, pool sin contaminación y negativos entre roles/tenants. Emisor sintético + DB real en primer caso; GoTrue real con registro/token/logout en segundo. |
| V1–V6 y roles | [Seguro] PASS SQL bajo login asisteam_api: ADMIN, ATHLETE, GUARDIAN, COACH y multirol; propio/pupilo, mayoría de edad, toggles independientes, no PII/notas de terceros, grupo ajeno y PENDING rechazados. COACH modifica estado sin notas/desmarcado y conserva nota privada. |
| Concurrencia/rollback | [Seguro] PASS dos conexiones, perfil FOR UPDATE sin deadlock; rol postgres rechazado/readiness false, fake identity 401, write revertido al invalidar sesión antes de COMMIT, callback cerrado rechazado. |
| pgTAP completo requerido | [Seguro] **FAIL preexistente**: send_invitations.test.sql caso15 «rechazos no consumen cuota», have1/want0. El mismo archivo sin cambios en checkout develop e7bc9ff reproduce 1/51 fallos; [baseline-pgtap.json](baseline-pgtap.json). El gate backend sigue rojo, no declarar aprobación RLS global. |
| Integraciones de producto | [Seguro] PASS81/81, 0 omitidas, 52.5s; ejecutadas aparte con el runner/Edge existente porque backend se detiene después del pgTAP fallido. [issue149-product.json](issue149-product.json). |
| Playwright/axe/visual | [Seguro] OMITIDO: no hay cambio de UI/rutas/estados de producto; build conserva39 páginas. |
| Cloud/staging y CI remoto | [Seguro] No se provisionan credenciales externas ni se ejecuta este nuevo recorrido contra cloud/staging. CI remoto se registra en PR tras publicar; resultados locales no demuestran deploy. |

```sh
pnpm ci:checks
pnpm ci:backend
# Suites del cambio, después de build API y migración local:
API_RLS_TEST=1 pnpm --filter @asisteam/api exec node --test --test-reporter=tap test/session-rls.integration.mjs
pnpm exec supabase test db supabase/tests/api_session_rls.test.sql
# Reproducción del fallo ajeno sobre el checkout base:
pnpm exec supabase test db supabase/tests/send_invitations.test.sql
```

[Seguro] CI backend aplica migraciones y exige las pruebas API RLS antes de tipos/pgTAP/integraciones; el reporter TAP permite al runner rechazar omisiones. Fixtures sintéticos con cleanup por IDs y restauración de credenciales del rol; nunca datos reales, tokens ni secretos adjuntos. El gate pgTAP global debe corregirse fuera del diff antes de aprobar CI. El PR se entrega revisable sin merge ni cierre de #149.

[Seguro] Descubrimiento exclusivamente graphify: grafo TS actualizado y grafos SQL/PostgreSQL extraídos temporalmente. Dependencias opcionales psycopg/tree-sitter-sql aisladas en /private/tmp; no cambios de instalación global ni navegación alternativa. Documentación canónica 02/04/07/08/11 prevalece; [doc07](../../07-api-y-backend.md) enlaza el estado temporal y conserva el contrato de dominio Supabase.
