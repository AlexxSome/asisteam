# WEB-03 — Base React/Vite paralela (#215)

[Seguro] `apps/web-vite` entrega la base temporal React19/TypeScript/Vite/React Router Data Mode del [ADR WEB-01](../issue-213/ADR.md), con la [sesión cookie Nest WEB-02](../issue-214/README.md). Base: `75bed49d0eb205b4f930c5dd34a22d9fef6ee72c`. Next continúa en `apps/web`; los módulos completos corresponden a #216–220 y la selección/proxy productivos a #221–222. Producción continúa NO-GO.

## Alcance entregado

| URL estable | Base Vite | Límite |
| --- | --- | --- |
| `/`, `/welcome` | Redirección a `/groups` | No reemplaza onboarding completo ONB-01 |
| `/login` (AUT-01) | Login email/contraseña real en Nest; carga/error/retorno seguro | Registro/recovery/social/invitaciones completos: WEB-04 |
| `/accept-terms` (AUT-08) | Lectura de consentimiento de sesión y aceptación explícita canónica | No autoriza membresías/menores |
| `/legal/2026-09-21` (LEG-01) | Aviso canónico; HTML estático sin JS al acceso directo y componente SPA | Misma versión y texto, sin aceptación al consultar |
| `/groups` (GRP-01) | Lista autorizada y roles por grupo | Sin creación/ingreso ni funcionalidades dashboard completas |
| `/groups/:groupId` (GRP-02) | Contexto mínimo autorizado; cambio de grupo y recarga | Agenda/gestión/asistencia/reportes se migran en sus issues |
| `/logout` | POST explícito, familia revocada y navegación de documento a login | GET no modifica sesión; no promete cerrar otras sesiones |
| Otras rutas | Estado seguro «Página no disponible» | Las 39 páginas siguen operativas en Next; no se declara paridad SPA |

[Seguro] Layouts root/privado y módulos lazy usan `createBrowserRouter`. Loaders son dueños de DTOs; actions ejecutan writes una sola vez y React Router revalida sus lecturas. No hay TanStack Query, almacén de DTOs, local/sessionStorage, service worker ni cola offline. El grupo es parte de la URL; navegación pendiente oculta el Outlet anterior y el destino desmonta su estado local. Login/logout navegan el documento y destruyen el router; BroadcastChannel comunica solo invalidación, sin identidad/tokens/PII. BFCache/restauración de pestaña destruye el router antes de validar de nuevo la sesión. Loaders hijos verifican sesión/consentimiento independientemente del padre porque Router los ejecuta en paralelo. Nest/RLS mantienen la autorización efectiva y el 404 para grupo ajeno.

[Seguro] `browserApi(request.signal)` usa el SDK generado con cookies `same-origin`, `no-store` y CSRF solicitado antes de cada write; compone AbortSignal de navegación y timeout del SDK. No reintenta mutaciones. Los errores conservan mensajes uniformes seguros; un fallo de red nunca se presenta como grupo vacío. HTTP de APIs permanece real; el shell SPA puede responder200 antes de un error de loader según la diferencia aceptada en el ADR.

## Configuración y scripts

[Seguro] Versiones exactas: React/react-dom19.2.7, Vite7.3.7, plugin-react5.2.0, Router7.18.4, TS5.9.3; Node24.16/pnpm10.33.2. Lockfile versionado. Tailwind4 importa la fuente canónica de tokens `apps/web/src/app/globals.css`; Field/Input/Alert/Card/LoadingState puros se reutilizan. El botón y los enlaces usan un adaptador Router mínimo con el contrato visual44px; el shell completo #170/UI-02 se adopta en WEB-05.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec turbo run build --filter @asisteam/api --filter @asisteam/api-client
corepack pnpm --filter @asisteam/web-vite dev
corepack pnpm --filter @asisteam/web-vite typecheck
corepack pnpm --filter @asisteam/web-vite test
corepack pnpm --filter @asisteam/web-vite build
corepack pnpm --filter @asisteam/web-vite test:e2e
```

[Seguro] Dev usa127.0.0.1:3130 con `strictPort`; preview3131, Next QA3120. `.qa/results`, `.qa/report`, `.ci-vite.json` y `dist/` pertenecen al nuevo paquete y están aislados de Next. Playwright exige API compilada y Docker; crea un PostgreSQL17 propio, migra con el ledger existente, siembra identidades/grupos/suscripción/consentimiento sintéticos, arranca Nest+Vite y destruye sus recursos al terminar. No lee credenciales de staging/producción ni usa datos reales. `test:e2e` acredita transporte HTTP y autorización reales del entorno sintético; no proveedores externos.

[Seguro] Desarrollo manual requiere Nest `WEB_AUTH_ENABLED=1`, `NATIVE_AUTH_WEB_URL=http://127.0.0.1:3130` y `ASISTEAM_VITE_API_TARGET` como origen Nest **solo de configuración del servidor Vite**; nunca variable `VITE_*`. Única variable pública permitida: `VITE_APP_NAME` (etiqueta opcional). API/core SDK siempre usan `window.location.origin`; no hay destinos elegidos por el browser. El proxy preserva Host externo, elimina Authorization/headers `x-asisteam-*`/Forwarded recibidos y escribe una sola IP del socket; Nest decide si confía en el peer según su configuración. Cookies loopback comparten host entre puertos: elegir conscientemente un frontend para la prueba y usar contextos de navegador separados al probar Next/Vite. El runner Vite usa una base/sesión propia.

## Límites navegador/servidor y artefacto

[Seguro] `@asisteam/core/browser` reexporta schemas/contratos/etiquetas puros y la condición `browser` de `core/runtime` hace que el SDK excluya handlers billing/jobs. Node conserva su export runtime anterior. Un plugin Vite falla al importar Next, server-only, DB, builtins Node, Nest/pg/argon2, rutas de API/Worker o Server Actions/handlers Next. El build inspecciona todos los módulos transitivos y publica su inventario `browser-modules.json`; `check-bundle.mjs` comprueba el artefacto completo, ausencia de sourcemaps/Next/DB, URLs PostgreSQL, claves privadas y canary de secretos. Variables `VITE_*` desconocidas fallan antes del build. Secrets y credenciales permanecen exclusivamente en Nest.

[Seguro] `ci:checks` incluye typecheck/build de ambos paquetes, gate del bundle y unitarios Vite sin omisiones. `ci:extended` conserva toda la matriz Next y agrega la vertical Vite sin omisiones. `ci:backend`/`ci:staging` y calificación mantienen dominio, RLS, menores, métricas y ensayos existentes. No hay migración SQL ni cambio de contrato HTTP en este issue.

## Verificación y pendientes

[Seguro] [verification.json](verification.json) registra SHA, entorno, gates y resultado final. Auto-revisión restringida al diff del issue; incidencias de configuración PostCSS, tipado del plugin y fixture de cupos se corrigieron antes de entrega. El primer caso E2E esperaba H2 de tarjeta y podía recargar antes de navegar: ahora espera H1 de destino. Se mantienen esas incidencias sin declararlas fallos del producto anterior.

[Seguro] Evidencia automática: sesión/login/consentimiento/grupos/cambio/logout, acceso directo/recarga, familia expirada, Atrás, logout en otra pestaña/cambio de cuenta, 404 ajeno, error de transporte/reintento, un único login POST, cookies HttpOnly/almacenamiento vacío, reflow320/375/768/1024/1440 y axe acotado. No acredita lector humano, zoom nativo, teléfono a una mano ni paridad de39 rutas. Esos gates y #170/#209 siguen pendientes de sus responsables. Preview Vite no es servidor productivo: cabeceras/cache/allowlist HTTP definitivas y selección del artefacto pertenecen a WEB-09/10.
