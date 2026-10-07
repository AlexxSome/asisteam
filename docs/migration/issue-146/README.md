# MIG-02 · Base ejecutable de API (#146)

[Seguro] Fecha: 2026-10-07. Base real: `fdb26d6b1649d501d83b6625f32e9df266beabb0` de `origin/develop`, que contiene MIG-01/PR #169. Rama: `codex/146-api-nest-runtime`. Entorno: macOS, Node 24.16.0, pnpm 10.33.2, Docker 29.3.1; contenedor Linux/arm64 y PostgreSQL 17.9 sintético.

[Seguro] Entrega: [API/runbook](../../../apps/api/README.md), config DI validada, Nest 12.1.2 ESM, pool pg, cierre ordenado, health/readiness, errores uniformes españoles, timeout, request ID y logs sin PII. Core incorpora un schema de error compartido y subpath ESM compilado; su entrada fuente y reglas existentes se conservan. No se modifica SQL, permisos de producto ni pantallas.

## Evidencia local

| Check | Resultado |
| --- | --- |
| `pnpm exec turbo run build typecheck test --filter @asisteam/api` | PASS: build/typecheck API/core; 4 pruebas de API y 150 tests core |
| `pnpm --filter @asisteam/web typecheck` | PASS |
| `pnpm --filter @asisteam/web test` | PASS: 821 tests; 81 integraciones opt-in OMITIDAS |
| `pnpm --filter @asisteam/web build` | PASS con URL/key sintéticas; 39 páginas preservadas; aviso preexistente middleware/proxy |
| Docker build frozen + compose `up --build -d --wait` | PASS: compilación y arranque sin fuentes TS ni compiladores en runtime |
| `node apps/api/test/container-smoke.mjs` | PASS: usuario 1000, core compilado, ready 200→503→200 al detener/recuperar DB, health 200 sin DB, SIGTERM exit 0, logs sin credencial/SQL |
| `API_TEST_DATABASE_URL=… pnpm --filter @asisteam/api test:integration` | PASS: pg real con fixture vacío, timeout de query/statement y recuperación, ready 200 y proceso compilado con SIGTERM/cierre exit 0 |
| Config/HTTP/redacción | PASS: configuración inválida sin valores, strict Zod core, IDs generados localmente, 404/400/413/500/503/504 sin mensajes internos ni PII |
| `git diff --check` y auto-revisión | PASS: diff limitado a #146 |
| Lint remoto, CI/staging | PENDIENTE #147; no había lint/workflow versionado |
| pgTAP/RLS, integraciones de producto, Playwright | OMITIDOS: no cambia SQL/RLS ni UI; el fixture no valida autorización |

[Seguro] Comandos reproducibles en el [runbook](../../../apps/api/README.md). El build web usó `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` y `NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-build-fixture`; no se leyó `.env` ni se accedió a datos reales. La integración nueva requiere `API_TEST_DATABASE_URL`; sin esa variable informa SKIP.

## Revisión y alcance

[Seguro] Navegación mediante graphify reconstruido sobre el checkout base: core index/schemas/package, tsconfig y dependencias. Los nuevos archivos siguen los módulos `apps/api`, `packages/core` y docs/migration. Trabajo ajeno del checkout original (next-env.d.ts, .pnpm-store y plan local sin tracking) preservado mediante worktree aislado.

[Seguro] Hallazgos propios corregidos: URL inválida que lanzaba excepción del parser, 413 tratado como 500, declaraciones ESM incompatibles con specifiers TS, dependencia accidental del build web para todas las pruebas Turbo. Las dependencias Nest/adaptador tienen versiones exactas compatibles; esbuild conserva la revisión ya existente del monorepo. Las pruebas se ejecutan sobre JavaScript compilado, no con ts-node/tsx.

[Seguro] El commit de implementación y PR quedan registrados en Git/GitHub. Esta evidencia fija su base y archivos para evitar autorreferencia al hash del mismo documento. #146 se referencia sin cierre automático.

[Seguro] Límites: no deploy, provisión, gasto, migración de tráfico, sesión de usuario, contexto RLS ni lectura/escritura de tablas de negocio. CI/staging #147, contrato/OpenAPI #148 y auth/contexto #149 continúan separados. El ADR/proveedor/presupuesto y acuerdos operativos de MIG-01 siguen pendientes; este runtime local no los acredita ni acepta.
