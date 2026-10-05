# Asisteam

Aplicación web responsive para gestionar la asistencia de deportistas en clubes y equipos. Un usuario puede pertenecer a varios grupos con roles distintos; los datos y permisos se resuelven por grupo.

## Estado verificado

Corte documental: **05-10-2026**, base `48d404ab96cecd1d6ddb109616e91ed0fcabce8b` de `develop`, reconciliación [#121](https://github.com/AlexxSome/asisteam/issues/121). El repositorio ya contiene el monorepo y la aplicación web: **39 páginas App Router**, módulos de dominio compartidos, migraciones/RPC/RLS, Edge Functions y pruebas. El [inventario de pantallas](docs/05-pantallas.md) enlaza cada página y diferencia implementación, rutas lógicas, objetivos UX y pendientes.

Las 37 páginas citadas por la auditoría del 03-10-2026 corresponden a su base `d7dff870f2b2`; el corte actual añade `/accept-terms` y `/legal/2026-09-21` por [#107](https://github.com/AlexxSome/asisteam/issues/107). La existencia de código no acredita despliegue, configuración de proveedores ni cierre de QA de todos los recorridos.

## Monorepo

| Ubicación | Contenido actual |
|---|---|
| `apps/web/` | Next.js 16, React 19 y TypeScript; Tailwind 4, componentes compartidos, Vitest y Playwright/axe |
| `packages/core/` | Métrica canónica, schemas Zod, enums, etiquetas en español y reglas compartidas |
| `packages/db/` | Tipos generados de Supabase |
| `supabase/` | Migraciones, RLS, vistas/RPC, Edge Functions, seeds y pruebas de backend |
| `docs/` | Contratos de producto, inventario y evidencia de QA |

pnpm **10.33.2** y Turborepo coordinan el monorepo; Node **≥20**. El backend usa Supabase/PostgreSQL: PostgREST con RLS para lecturas y RPC/Edge Functions para escrituras con invariantes. La app Expo/React Native sigue planificada: no hay cliente móvil implementado en este corte; web responsive no equivale a app nativa.

## Módulos y alcance existente

- Acceso por email, recuperación, invitaciones, activación de cuentas gestionadas y aceptación informada de condiciones. Google/Apple tiene implementación autorizada; su disponibilidad depende de la configuración del proveedor.
- Grupos y onboarding, integrantes por rol, apoderados, consentimientos y aprobaciones de menores.
- Agenda, actividades simples/recurrentes y tipos de actividad; toma y edición de asistencia.
- Historial propio y de pupilos por grupo, reportes, estadísticas agregadas condicionadas por visibilidad.
- Perfil, imagen, correcciones de fecha de nacimiento, cuenta y solicitudes de privacidad vía soporte.
- Extensiones **P2 ya autorizadas**: COACH ([#55](https://github.com/AlexxSome/asisteam/issues/55)), suscripciones del club a Asisteam ([#56](https://github.com/AlexxSome/asisteam/issues/56)), anuncios ([#57](https://github.com/AlexxSome/asisteam/issues/57)), QR web ([#58](https://github.com/AlexxSome/asisteam/issues/58)) y login social ([#59](https://github.com/AlexxSome/asisteam/issues/59)). Mantienen su prioridad original; su existencia no autoriza otras funciones P2.

La [referencia de permisos](docs/02-roles-y-permisos.md) manda: ADMIN gestiona el grupo; COACH toma/corrige estados sin acceder a notas privadas ni gestión; ATHLETE consulta lo propio y GUARDIAN lo de sus pupilos vigentes. Los toggles no abren datos privados de terceros. Un menor no se activa sin apoderado y consentimiento vigente. La métrica conserva `(PRESENT + LATE) / (convocadas − EXCUSED) × 100`, un decimal y «Sin datos» cuando no hay denominador.

**Límites reconciliados:** billing cobra al club, no cuotas de deportistas; QR no incluye geocerca; anuncios tiene backend de push pero requiere un cliente Expo y credenciales para recibirlos. CSV, recordatorios, avisos de ausencia y justificaciones tienen historias cerradas sin UI verificada en este corte. Offline fue pospuesto expresamente en #54; no se reactiva la planificación móvil con esta auditoría. El [registro de decisiones y discrepancias](docs/05-pantallas.md#7-reconciliación-de-historias-y-alcance) conserva responsable, historial y siguiente decisión, sin cerrar ni reabrir issues automáticamente.

## Desarrollo y validación

Desde la raíz, con dependencias instaladas y Supabase local configurado:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec supabase start
corepack pnpm --filter @asisteam/web dev
corepack pnpm --filter @asisteam/core test
corepack pnpm --filter @asisteam/web test
corepack pnpm --filter @asisteam/core typecheck
corepack pnpm --filter @asisteam/web typecheck
corepack pnpm --filter @asisteam/web build
```

El [método QA de #120](docs/qa/issue-120/README.md) detalla fixtures sintéticos, Playwright, roles, teclado, viewports y límites de la evidencia. Las integraciones de backend son opt-in; una suite unitaria verde no las sustituye. Toda modificación DB/RLS/RPC requiere sus pruebas, pgTAP y regeneración de tipos cuando corresponda. Los gates remotos del roadmap son objetivos: el corte actual no tiene workflow CI ni script `lint` versionados.

## Documentación

Hay **15 documentos principales**: la serie de producto **01–14** y la guía visual, que comparte el prefijo `12` por motivos históricos. Se conservan ambos nombres para no romper referencias.

| Documento | Contenido |
|---|---|
| [01 · Visión y alcance](docs/01-vision-y-alcance.md) | Objetivo, prioridades y límites |
| [02 · Roles y permisos](docs/02-roles-y-permisos.md) | Fuente de verdad de autorización, menores y V1–V6 |
| [03 · Módulos y flujos](docs/03-modulos-y-flujos.md) | Recorridos funcionales |
| [04 · Modelo de datos](docs/04-modelo-de-datos.md) | Modelo y convenciones |
| [05 · Pantallas](docs/05-pantallas.md) | Rutas reales, códigos, estados y alcance reconciliado |
| [06 · Arquitectura y stack](docs/06-arquitectura-y-stack.md) | Decisiones técnicas y entornos |
| [07 · API y backend](docs/07-api-y-backend.md) | Operaciones y reglas de negocio |
| [08 · Reportes](docs/08-reportes-y-estadisticas.md) | Métrica y visibilidad |
| [09 · Roadmap](docs/09-roadmap.md) | Plan original; no es una certificación de entrega |
| [10 · Historias](docs/10-historias-de-usuario.md) | Criterios de producto; consultar reconciliación antes de inferir entrega |
| [11 · Legal, seguridad y privacidad](docs/11-legal-seguridad-privacidad.md) | Consentimiento y protección de datos |
| [12 · Suscripciones SaaS](docs/12-suscripciones-saas.md) | Decisión vigente de billing, capacidad y Mercado Pago |
| [12 · Sistema visual](docs/12-sistema-visual.md) | Tokens y contratos de componentes/estados |
| [13 · Anuncios](docs/13-anuncios.md) | Muro y límites de avisos push |
| [14 · Asistencia QR](docs/14-asistencia-qr.md) | Emisión, llegada propia y recuperación |

[AGENTS.md](AGENTS.md) resume las reglas para agentes. Al cerrar cada cambio de UI, actualizar el inventario y los contratos afectados con evidencia del mismo commit.

Proyecto desarrollado por el equipo de Arc Velion.
