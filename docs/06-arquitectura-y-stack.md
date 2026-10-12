# Arquitectura y stack tecnológico

[Seguro] Vigencia WEB-10 (#222, 2026-10-12): React19/Vite7/React Router7 Data Mode consume exclusivamente la API Nest/Node24. PostgreSQL17 independiente conserva dominio, RLS, RPC, constraints y triggers; Auth y S3 privados tienen autoridades propias. El repositorio no requiere SDK, CLI, proyecto ni fixtures Supabase. [Inventario y evidencia](migration/issue-168/README.md). El historial del stack anterior permanece en Git y en las evidencias fechadas de `docs/migration/`.

## 1. Arquitectura vigente

| Capa | Implementación |
|---|---|
| Web P0 | React19.2.7, Vite7.3.7, React Router7.18.4 Data Mode, TypeScript5.9.3, Tailwind4, formularios Zod/react-hook-form |
| API | Nest sobre Node24, DTO/schemas compartidos y cliente HTTP generado |
| Persistencia | PostgreSQL17; `packages/db/migrations`, catálogo y tipos propios |
| Auth | JWT HS256 propio de15min, refresh rotatorio hasheado, recuperación de60min, sesiones revocables; Google/Apple PKCE y vinculación explícita |
| Archivos | S3 privado; autorización Nest por propietario/apoderado y consentimiento; sin ACL pública ni URLs firmadas expuestas |
| Jobs | Worker Node con rol SQL mínimo, leases y ledger durables de mayoría/push |
| Integraciones | Resend, Mercado Pago, Expo Push transitorio; APNs/FCM móvil sigue P1 pendiente |
| Móvil P1 | Java/Android y Swift/iOS; no cliente implementado |
| Tooling | pnpm10, Turborepo, Vitest, pgTAP y Playwright/axe |

```mermaid
flowchart LR
  W[React/Vite: proxy mismo origen] -->|HTTPS: cliente generado| A[Nest: sesión y DTO]
  M[Java / Swift: P1 pendiente] -->|HTTPS| A
  A -->|roles mínimos y transacción| P[(PostgreSQL17: RLS + RPC)]
  A --> N[Auth propio: JWT / refresh / OAuth]
  N --> P
  A --> S[S3 privado]
  A --> E[Resend / Mercado Pago]
  J[Worker: leases / ledger] --> P
  J --> X[Resend / Expo Push]
```

## 2. Autorización y escritura

[Seguro] Los roles de negocio pertenecen a memberships por grupo. `asisteam_api`, `asisteam_auth`, `asisteam_invitation`, `asisteam_billing` y `asisteam_jobs` no son propietarios ni BYPASSRLS. `asisteam_member` es un grupo NOLOGIN. El migrador separado instala el esquema y registra hashes; cambios/omisiones de migraciones aplicadas fallan.

[Seguro] Nest verifica sesión viva y fija claims de servidor dentro de la transacción. Las lecturas usan columnas explícitas y las escrituras no triviales delegan a RPC canónicas con autorización repetida. Se mantienen V1–V6, R1, métricas por grupo, consentimiento append-only, historial e idempotencia. La web carece de credenciales PostgreSQL o de almacenamiento.

[Seguro] `0001_baseline.sql` conserva su hash inmutable; `0002_retire_provider_entrypoints.sql` elimina entrypoints inactivos y limita autoridades a NATIVE/NEST/WORKER. FROZEN/DRAINING son mantenimiento, no fallback. El catálogo vigente es `packages/db/catalog.json`; el generador usa catálogos PostgreSQL directamente.

## 3. Entornos y configuración

[Seguro] API y Auth/invitaciones/billing apuntan a la misma base con credenciales distintas; Worker tiene su URL propia. S3 requiere bucket privado, TLS y credenciales separadas. El servidor estático/HMR solo requiere `ASISTEAM_VITE_API_TARGET` hacia Nest, sin secretos. Nest requiere `WEB_AUTH_ENABLED=1` y `NATIVE_AUTH_WEB_URL` del origen externo; `NATIVE_AUTH_PROXY_SECRET`/`INVITATION_PROXY_SECRET` permanecen exclusivamente en API. Browser solo admite `VITE_APP_NAME` público. Secrets se provisionan fuera del repositorio. Los manifiestos, lockfile, bundles y trazas se verifican sin dependencias retiradas.

[Seguro] Desarrollo y CI crean contenedores PostgreSQL/S3 únicos con datos sintéticos y los destruyen al finalizar, también tras fallos controlados. Nunca se copian datos reales de menores a staging. Los proveedores externos son transportes sintéticos en esos ensayos; no acreditan contratos ni aceptación operacional.

## 4. CI y recuperación

[Seguro] `pnpm ci:checks` ejecuta lint, contratos/tipos, build, gate del artefacto y suites unitarias. `pnpm ci:backend` exige1646 assertions SQL de40 suites,50 guards nativas/métrica,80 casos originales y4 de recuperación nativa, APIs/Worker, tipos/catálogo, reconciliación de todas las tablas, backup lógico y PITR. `pnpm ci:extended` ejecuta todos los roles/módulos/responsive/axe sobre el stack nativo y el proxy de fallos. `pnpm ci:staging` ensaya publicación/rollback en infraestructura local propia; no despliega producción.

[Seguro] La recuperación posterior a escrituras usa snapshot completo en una base nueva congelada, reconcilia FKs/R1/filas/archivos y reabre un único escritor. Nunca sobrescribe una base con historia ni admite pérdida de escrituras comprometidas. El ensayo sintético incluye contraseñas, consentimientos, asistencia, pagos y jobs posteriores al snapshot.

## 5. Aceptación externa

[Seguro] Producción sigue NO-GO por entradas operativas pendientes, no por un runtime de coexistencia: entorno/proveedor y permisos, volumen/carga acordada, evidencias reales Google/Apple/Resend/MP/Expo, observabilidad, responsables, ventana y RPO/RTO aprobados. El cierre administrativo de #166/#167 no demuestra esos gates. [Matriz y handoff](migration/issue-168/operational-acceptance.md). No ejecutar corte/deploy real, apagar receptores remotos, destruir recursos/datos ni cerrar #168 sin autorización y evidencia correspondientes.

## 6. Arquitectura web objetivo — WEB-01 (#213)

[Seguro] [ADR e inventario](web-migration/issue-213/README.md) fijan la decisión de #212: React19/TypeScript/Vite + React Router **Data Mode**, build estático sin servidor SSR de Router; Nest sirve sesión web con cookies HttpOnly/Secure/SameSite=Lax y CSRF. Mismo origen vía proxy; `/api/v1` conserva Bearer y `/web-api/v1` reserva el adaptador cookie, con callbacks e imágenes privadas en URLs compatibles. Las versiones y diferencias de SEO/HTTP/caché respecto a SSR están fijadas en el [ADR](web-migration/issue-213/ADR.md).

[Seguro] React Router es el único dueño de lecturas/invalidación de la web objetivo; loaders/actions/fetchers reemplazan Server Components/Actions/revalidatePath. No se añade una segunda caché TanStack Query. WEB-10 promueve la aplicación a `apps/web`, elimina Next y mantiene secretos únicamente en Nest/Worker. PostgreSQL17/RLS/RPC, Worker, S3, dominio y contratos se mantienen. #170/#209 y producción NO-GO conservan sus gates.

[Seguro] WEB-02 (#214) entrega la [fachada Nest opt-in](web-migration/issue-214/README.md): cookie de sesión opaca host-only, credenciales cifradas en PostgreSQL, refresh atómico entre instancias, CSRF/origen y callbacks OAuth compatibles. Access15min/refresh30d y autoridad SQL permanecen. La transición desde cookies Next requiere reautenticación explícita; no acredita migración SPA ni corte productivo.

## Antecedente histórico · Base paralela WEB-03 (#215)

[Seguro] [WEB-03](web-migration/issue-215/README.md) entrega apps/web-vite con versiones fijadas, Data Mode, loaders/actions, SDK cookie Nest, límites de bundle y QA aislada3130. Core añade entrypoint browser sin handlers de servidor; runtime Node se conserva. Next sigue siendo la web completa: la base Vite solo acredita sesión/consentimiento/lista/contexto de grupos/logout sintéticos. No implica corte ni aceptación externa.

## WEB-10 · Entrega estática definitiva

[Seguro] [Runbook](web-migration/issue-222/README.md): build `dist`, servidor Node24 sin dependencias npm en runtime, proxy fijo antes del fallback a40 destinos técnicos (39 páginas+logout), HTML no-store, assets versionados inmutables y legal estático revalidable. La SPA pierde SSR/RSC y formularios privados sin JS; una navegación shell200 conserva el error HTTP real en API/loader. Sesión opaca Nest, CSRF/origen, refresh atómico, SQL/RLS y un único ejecutor de writes siguen vigentes. Las secciones WEB-01…09 y MIG previas son antecedentes de sus commits. Producción NO-GO.
