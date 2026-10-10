# Asisteam

[Seguro] Candidato MIG-24 (#168): web/API/worker y tooling nativos, sin SDK/CLI/fixtures Supabase. [Arquitectura vigente, pruebas, inventario y handoff](docs/migration/issue-168/README.md). Producción continúa NO-GO; este retiro técnico no ejecuta corte real ni apaga receptores Mercado Pago.

Aplicación web responsive para gestionar la asistencia de deportistas en clubes y equipos. Un usuario puede pertenecer a varios grupos con roles distintos; los datos y permisos se resuelven por grupo.

## Estado y arquitectura vigente

Retiro de repositorio MIG-24 (#168), actualizado el **10-10-2026**, sobre `develop@13a0a643431f480e1ddf4c83022c8083c31beb68` (merge PR206). Las **39 páginas App Router** y capacidades autorizadas conservan sus contratos. El [inventario de pantallas](docs/05-pantallas.md) diferencia implementación, rutas lógicas y pendientes; código o CI verde no acreditan despliegue ni aceptación operacional.

| Ubicación | Contenido actual |
|---|---|
| `apps/api/` | NestJS/Node 24, HTTP de producto, Auth nativo, JWT, roles PostgreSQL mínimos y S3 privado |
| `apps/web/` | Next.js 16/React 19, sesión nativa del servidor, DTO HTTP, Vitest y Playwright/axe |
| `apps/worker/` | Jobs idempotentes, mayoría de edad y cola duradera de anuncios/recibos |
| `packages/core/` | Métrica canónica, schemas Zod, enums, etiquetas y contrato HTTP |
| `packages/api-client/` | Cliente y OpenAPI generados del contrato de core |
| `packages/db/` | Migraciones PostgreSQL propias, RLS/RPC, catálogo, tipos, fixtures sintéticos y pgTAP |
| `docs/` | Contratos de producto, cobertura y evidencia histórica fechada |

pnpm **10.33.2**, Turborepo y Node **24.16.0 LTS** coordinan el monorepo. Next consume Nest; Nest instala la identidad verificada dentro de la transacción SQL. Las invariantes permanecen en PostgreSQL 17 con RLS. SDK, CLI, configuración y fixtures Supabase se retiraron; el historial versionado se conserva como antecedente, sin runtime del proveedor. La app móvil sigue planificada en Java/Android y Swift/iOS.

## Módulos y alcance existente

- Acceso por email, recuperación, invitaciones, activación de cuentas gestionadas y aceptación informada de condiciones. Google/Apple tiene implementación autorizada; su disponibilidad depende de la configuración del proveedor.
- Grupos y onboarding, integrantes por rol, apoderados, consentimientos y aprobaciones de menores.
- Agenda, actividades simples/recurrentes y tipos de actividad; toma y edición de asistencia.
- Historial propio y de pupilos por grupo, reportes, estadísticas agregadas condicionadas por visibilidad.
- Perfil, imagen, correcciones de fecha de nacimiento, cuenta y solicitudes de privacidad vía soporte.
- Extensiones **P2 ya autorizadas**: COACH ([#55](https://github.com/AlexxSome/asisteam/issues/55)), suscripciones del club a Asisteam ([#56](https://github.com/AlexxSome/asisteam/issues/56)), anuncios ([#57](https://github.com/AlexxSome/asisteam/issues/57)), QR web ([#58](https://github.com/AlexxSome/asisteam/issues/58)) y login social ([#59](https://github.com/AlexxSome/asisteam/issues/59)). Mantienen su prioridad original; su existencia no autoriza otras funciones P2.

La [referencia de permisos](docs/02-roles-y-permisos.md) manda: ADMIN gestiona el grupo; COACH toma/corrige estados sin acceder a notas privadas ni gestión; ATHLETE consulta lo propio y GUARDIAN lo de sus pupilos vigentes. Los toggles no abren datos privados de terceros. Un menor no se activa sin apoderado y consentimiento vigente. La métrica conserva `(PRESENT + LATE) / (convocadas − EXCUSED) × 100`, un decimal y «Sin datos» cuando no hay denominador.

**Límites reconciliados:** billing cobra al club, no cuotas de deportistas; QR no incluye geocerca; anuncios tiene backend de push pero requiere cliente compatible y credenciales; la migración móvil a FCM/APNs continúa pendiente. CSV, recordatorios, avisos de ausencia y justificaciones tienen historias cerradas sin UI verificada en este corte. Offline fue pospuesto expresamente en #54; no se reactiva la planificación móvil con esta auditoría. El [registro de decisiones y discrepancias](docs/05-pantallas.md#7-reconciliación-de-historias-y-alcance) conserva responsable, historial y siguiente decisión, sin cerrar ni reabrir issues automáticamente.

## Desarrollo y validación

Desde la raíz, con Node/pnpm y Docker disponibles:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm ci:checks
corepack pnpm ci:backend
corepack pnpm ci:staging
corepack pnpm ci:extended
corepack pnpm ci:qualification
```

Los runners de integración crean PostgreSQL/Auth/S3 sintéticos propios y los eliminan al terminar. `ci:backend` exige 40 suites SQL/1646 aserciones, 50 guards nativas, las 80 integraciones originales/628 aserciones y cuatro casos de recuperación; ninguna omisión acredita PASS. `ci:checks` inspecciona también los artefactos productivos para impedir el retorno del proveedor o fixtures a runtime. [API](apps/api/README.md) y [DB](packages/db/README.md) documentan configuración y comandos individuales.

[QA #120](docs/qa/issue-120/README.md) conserva el método y sus evidencias históricas. La [aceptación operacional](docs/migration/issue-168/operational-acceptance.md) registra inputs externos que aún impiden el corte real. No se despliega ni se apagan recursos remotos con estos comandos.

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
