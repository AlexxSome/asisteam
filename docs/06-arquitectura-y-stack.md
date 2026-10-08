# Arquitectura y stack tecnológico

**Proyecto:** Asisteam · **Fecha:** 2026-07-03 · **Documentos relacionados:** 04-modelo-de-datos.md, 07-api-y-backend.md, 08-reportes-y-estadisticas.md, 09-roadmap.md, 11-legal-seguridad-privacidad.md

[Seguro] **MIG-01 (#145, 2026-10-06):** [inventario, ADR e infraestructura propuestos](migration/issue-145/README.md) para la épica #144. Producción, usuarios, capacidad del equipo, proveedor, presupuesto y continuidad siguen PENDIENTES de confirmación o aceptación. La arquitectura de producto sigue en Supabase; MIG-02 añade solo su runtime de transición.

[Seguro] **MIG-02 (#146, 2026-10-07):** [base ejecutable Nest/Node](migration/issue-146/README.md) con `apps/api`, sondas `/health` y `/ready`, pool pg, errores/logs seguros y contenedor probado localmente. Solo la infraestructura HTTP está implementada; las operaciones de producto siguen en Supabase. CI/staging, OpenAPI y sesión/RLS corresponden a #147–#149.

[Seguro] **MIG-03 (#147, 2026-10-07):** [CI y staging Docker sintético](migration/issue-147/README.md), gates con omisiones explícitas, roles separados, secretos externos y rollback por artefacto inmutable. Provisión externa pendiente según elección del usuario; las operaciones de producto continúan en Supabase.


[Seguro] **MIG-06 (#150, 2026-10-07):** [ensayo de portabilidad](migration/issue-150/README.md) a PostgreSQL17.9 independiente con fixtures sintéticos, RLS/constraints/grants reconciliados, bcrypt GoTrue y transferencia HTTP local de avatares con SHA-256. Conserva esquemas auth/storage de compatibilidad; login/OAuth/worker/S3 y retiro completo continúan en sus hitos. No modifica el backend productivo.

---

## 1. Decisión de arquitectura (resumen ejecutivo)

Se adopta Supabase (PostgreSQL 17 + Auth + RLS + Edge Functions) como backend gestionado, Next.js 16 para el MVP Web [P0] y **desarrollo nativo para móvil [P1]: Java en Android y Swift en iOS**. El cambio de Expo a nativo fue decidido el 2026-10-05. Se mantienen pnpm + Turborepo para el monorepo; los proyectos Android/iOS vivirán bajo `apps/mobile/` y tendrán builds propios de Gradle y Xcode.

Razones dominantes (detalle comparativo en la sección 4):

1. **Tiempo a MVP Web [P0]:** ~9 semanas vs ~12 de las alternativas; auth, CRUD, storage y email de invitación vienen resueltos por la plataforma.
2. **Calce con el modelo canónico:** el dominio de Asisteam es fuertemente relacional (únicos compuestos en `attendance_records`, `memberships`, `guardianships`; enums; JSONB en `groups.settings`). Postgres lo expresa 1:1 y la métrica canónica de asistencia es una vista SQL testeable.
3. **Seguridad multi-tenant en la base:** las 6 reglas de visibilidad del canon se implementan con RLS + vistas/RPC de columnas explícitas; el aislamiento por grupo queda en la base de datos y no depende de la disciplina del frontend.
4. **Talento y mantenibilidad:** TypeScript + React + SQL es el pool full-stack más grande de Chile/Latam; cero servidores que administrar para un equipo de 2-3 devs.

Injertos adoptados de las propuestas descartadas: monorepo con `packages/core` (métrica canónica + schemas Zod compartidos) de la Propuesta B; testing de políticas RLS con pgTAP + seeds por rol en CI, y la convención "lectura = RLS + vistas/RPC; escritura con efectos = Edge Function/RPC" de la Propuesta C.

## 2. Arquitectura elegida

```mermaid
flowchart LR
    subgraph Clientes
        WEB["Web app Next.js 16<br/>responsive, navegador móvil [P0]"]
        MOB["Apps nativas<br/>Android: Java · iOS: Swift [P1]"]
    end

    subgraph Vercel["Vercel Pro (CDN, presencia GRU)"]
        NEXT["Next.js App Router<br/>SSR + assets estáticos"]
    end

    subgraph SB["Supabase Cloud · AWS sa-east-1 (~35-60 ms desde Santiago)"]
        AUTH["Supabase Auth<br/>email + contraseña [P0]<br/>Google/Apple [P2]"]
        REST["PostgREST<br/>lecturas y CRUD simple<br/>protegido por RLS"]
        EDGE["Edge Functions (Deno/TS)<br/>writes no triviales:<br/>invitaciones, MANAGED→ACTIVE,<br/>menor-requiere-apoderado,<br/>expansión de recurrencia"]
        PG[("PostgreSQL 17<br/>esquema multi-tenant con group_id<br/>RLS + vistas + RPC + triggers")]
        STORE["Storage<br/>logos y avatares [P0]"]
        CRON["pg_cron<br/>recordatorios [P1],<br/>expiración de invitaciones,<br/>pupilos que cumplen 18"]
    end

    RESEND["Resend<br/>email transaccional [P0]"]
    PUSH["Push nativo<br/>FCM / APNs [P1]<br/>migración desde Expo pendiente"]
    SENTRY["Sentry<br/>errores web/móvil/Edge"]

    WEB --> NEXT
    NEXT -->|"supabase-js"| AUTH
    NEXT -->|"supabase-js"| REST
    NEXT --> EDGE
    MOB -->|"supabase-js"| AUTH
    MOB -->|"supabase-js"| REST
    MOB --> EDGE
    REST --> PG
    EDGE --> PG
    AUTH --> PG
    CRON --> PG
    CRON --> EDGE
    EDGE --> RESEND
    EDGE --> PUSH
    WEB -.-> SENTRY
    MOB -.-> SENTRY
    EDGE -.-> SENTRY
    NEXT --> STORE
    MOB --> STORE
```

### 2.1 Convención obligatoria de acceso a datos (regla de equipo desde el día 1)

| Operación | Camino | Ejemplos |
|---|---|---|
| Lectura y CRUD trivial | PostgREST + RLS, o vistas/RPC con **columnas explícitas** (nunca `SELECT *` sobre `users` hacia no-ADMIN) | listar actividades del grupo, ver historial propio, editar título de actividad |
| Escritura con efectos o invariantes | Edge Function o RPC (PL/pgSQL transaccional) | invitación por email/código, creación de cuenta MANAGED, conversión MANAGED→ACTIVE con consentimiento, validación "menor requiere apoderado", expansión de `recurrence_rule` semanal, toma de asistencia en lote |
| Invariantes de datos | Constraints + triggers como red de seguridad | únicos compuestos del canon, FK, checks de enums |
| Tareas programadas | pg_cron → Edge Function idempotente | recordatorio de actividad [P1], aviso de ausencia al apoderado [P1], invitaciones EXPIRED, guardianships inactivas al cumplir 18 el pupilo |

La métrica canónica de asistencia `(PRESENT + LATE) / (convocadas − EXCUSED) × 100` (redondeo a 1 decimal) vive en **dos capas con una sola fuente por capa**: vistas SQL para reportes servidos por la base, y `packages/core` para cálculo en cliente; ambas se testean contra el mismo set de casos canónicos (ver 08-reportes-y-estadisticas.md).

## 3. Stack por capa y justificación

| Capa | Elección | Justificación |
|---|---|---|
| **Web [P0]** | Next.js 16 (App Router, React 19, TypeScript 5) + Tailwind CSS 4 + shadcn/ui; supabase-js 2 + TanStack Query 5; react-hook-form + Zod (schemas desde `packages/core`); tipos generados con `supabase gen types` | HTML nativo con SSR: tablas de reportes con copiar/pegar y Ctrl+F, carga <1 s, accesibilidad estándar. El requisito [P0] explícito es web responsive usable en navegador móvil; React + TS es el perfil de contratación más abundante en Chile/Latam. |
| **Móvil [P1]** | App Android nativa en Java (Android Studio/Gradle) y app iOS nativa en Swift (Xcode); distribución por Google Play y App Store. Push nativo con FCM/APNs, sujeto a migrar el transporte/token Expo existente. | Dos clientes y ciclos de build/release independientes. Consumen el contrato Supabase existente; no comparten UI ni ejecutan directamente `packages/core`/schemas Zod TypeScript. Requieren contrato DTO estable y pruebas de paridad con casos canónicos. |
| **Backend** | Supabase: PostgREST + RLS para lecturas [P0]; Edge Functions (Deno/TS) y RPC (PL/pgSQL) para writes no triviales; triggers + constraints; pg_cron | Cero servidores; el aislamiento multi-tenant vive en la base. Los 3 flujos complejos del canon (menor-requiere-apoderado, MANAGED→ACTIVE, recurrencia semanal) se concentran en Edge Functions/RPC testeables. |
| **Base de datos** | PostgreSQL 17 (Supabase Cloud, AWS sa-east-1); esquema único multi-tenant con `group_id`; enums nativos; JSONB para `groups.settings`; `timestamptz` en UTC con presentación America/Santiago; vistas SQL para la métrica canónica | Calce 1:1 con el modelo canónico de 04-modelo-de-datos.md. sa-east-1 da ~35-60 ms desde Santiago. Datos en Postgres estándar: `pg_dump` portable (salida de emergencia del lock-in). |
| **Autenticación** | Supabase Auth: email+contraseña y recuperación [P0]; `inviteUserByEmail` para invitaciones dirigidas (estado INVITED); `public.users` desacoplada de `auth.users` (FK opcional) para cuentas MANAGED sin credenciales; Google/Apple [P2] sin cambiar de proveedor | Resuelve registro, login, recuperación y verificación de email sin código propio. El desacople `public.users` ↔ `auth.users` es la pieza a medida que habilita cuentas gestionadas para menores y el flujo de claim con consentimiento del apoderado (ver 11-legal-seguridad-privacidad.md). RLS consume `auth.uid()` vía helpers SECURITY DEFINER: `is_member(group_id)`, `is_group_admin(group_id)`, `is_guardian_of(athlete_user_id)`. |
| **Hosting / infra** | Vercel Pro (web) + Supabase Cloud Pro + Resend + Sentry + GitHub Actions; builds nativos Gradle/Xcode y distribución en tiendas [P1] | Todo gestionado; ~USD 45-70/mes estimados en [P0]. Los costos de CI nativo/firma/distribución móvil quedan por estimar. GitHub Actions corre los tests de RLS contra Supabase local en Docker. |
| **Monorepo** | pnpm + Turborepo: `apps/web` [P0], `apps/mobile` [P1], `packages/core`, `packages/db` (tipos generados), `supabase/` (migraciones, funciones, seeds, tests pgTAP) | Una sola fuente para la métrica canónica, los schemas Zod y los tipos de dominio, consumida por web, móvil y Edge Functions. |

Estructura del repositorio:

```
asisteam/
├── apps/
│   ├── web/          # Next.js 16 [P0]
│   └── mobile/       # Android nativo (Java) e iOS nativo (Swift) [P1]
├── packages/
│   ├── core/         # métrica canónica, schemas Zod, tipos de dominio, constantes de enums
│   └── db/           # tipos generados con `supabase gen types typescript`
├── supabase/
│   ├── migrations/   # SQL versionado (tablas, enums, RLS, vistas, triggers, RPC)
│   ├── functions/    # Edge Functions (Deno)
│   ├── seeds/        # seeds por rol para pgTAP y entornos de prueba
│   └── tests/        # pgTAP: políticas RLS y vistas de métrica
└── turbo.json / pnpm-workspace.yaml
```

## 4. Alternativas evaluadas

| Criterio | **A. BaaS: Supabase + Next.js + móvil nativo (vigente)** | B. Backend propio: NestJS + Next.js + móvil nativo | C. UI unificada: Flutter + Supabase |
|---|---|---|---|
| **Tiempo a MVP Web [P0]** | **~9 semanas** — auth, CRUD, storage y email resueltos por la plataforma | ~12 semanas — 1,5-2,5 semanas de plumbing (auth, CI/CD, staging) antes de la primera feature | ~12 semanas — y el P0 sale sobre Flutter web, la plataforma más débil del framework |
| **Mantenibilidad (2-3 devs)** | **Alta** — cero servidores; foco en dominio, RLS y UI | Media — upgrades, backups, parches e incidentes recaen en el equipo sin plataforma | Media — sin servidores, pero UI canvas + lógica en 3 capas (RLS, PL/pgSQL, Deno) |
| **Talento en Chile/Latam** | **Máximo** — TypeScript + React + SQL, el pool full-stack más grande | Máximo — mismo perfil, con curva NestJS (~1 semana) | Limitado — pool Flutter 3-5x menor; Dart backend inexistente (igual se trabaja en 2 lenguajes) |
| **Costo infra** | **USD 45-70/mes estimados en [P0]**; costo móvil [P1] por recalcular para builds nativos | USD 60-120/mes; costo móvil [P1] por recalcular | USD 40-55/mes; con [P1] ~80-150 según estimación original |
| **Escalabilidad a cientos de grupos** | **Sí** — esquema compartido + `group_id` + RLS; escala con compute add-on sin rediseño | Sí — pool model equivalente; escala en contenedores | Sí — mismo patrón de datos que A |
| **Reutilización web↔móvil** | Baja para UI y lógica cliente: Java/Swift son implementaciones separadas; sí se comparte backend/contrato y casos de aceptación | Media-alta — misma API REST + api-client OpenAPI + lógica de dominio compartible | **Máxima (~90%)** — una sola base Dart; [P1] en 3-4 semanas |
| **Riesgo de lock-in** | Medio — PostgREST/Auth/Edge Functions propietarios, pero datos en Postgres estándar (`pg_dump` → RDS/Neon); `packages/core` portable | **Mínimo** — contenedores y Postgres estándar, auth self-hosted | Medio — mismo lock-in Supabase que A, más riesgo de plataforma Flutter web |
| **Reglas de negocio del canon (permisos por membership, visibilidad, menor-requiere-apoderado)** | **Muy buen calce** — constraints + RLS declarativa + vistas SQL para la métrica; MANAGED exige desacoplar `public.users` (patrón conocido) | Muy buen calce — dominio tipado y testeable en NestJS, pero el aislamiento multi-tenant depende de disciplina de guards (RLS termina siendo necesaria igual) | Buen calce en datos, pero lógica repartida en RLS + PL/pgSQL + Edge Functions, más difícil de testear |
| **Calidad UX del MVP Web [P0]** | **Excelente** — HTML nativo, tablas de reportes con copiar/pegar, SSR, carga <1 s | Excelente — mismo frontend Next.js | Débil — payload 2-6 MB, arranque 3-8 s en 4G, tablas canvas sin Ctrl+F ni copiar a Excel, accesibilidad frágil |
| **Veredicto** | **Elegida: gana en los criterios de mayor peso (tiempo, talento, calce del canon, UX del P0) con lock-in aceptable** | Descartada como inicio; es la ruta de evolución si se supera el BaaS | Descartada: optimiza [P1] sacrificando el [P0], que es lo que valida el negocio |

**Por qué se descartó Flutter para el P0:** su fortaleza de compartir UI web/móvil beneficiaría al [P1], pero degradaría el [P0] web responsive con reportes tabulares. La decisión vigente de nativo prioriza experiencia e integración de cada sistema operativo; el costo es mantener dos clientes y duplicar parte de la lógica de presentación/validación. La Propuesta B sigue siendo ruta de salida si se supera el BaaS.

## 5. Web + móvil: código compartido, paridad y orden de construcción

### 5.1 Código compartido

| Compartido (una sola fuente) | Específico por plataforma |
|---|---|
| Backend Supabase: Auth, PostgREST/RLS, vistas, RPC y Edge Functions | UI y navegación: web Next.js vs Android Java vs iOS Swift |
| Contratos de datos estables y casos de aceptación compartidos como fixtures | Clientes HTTP, modelos DTO, manejo de sesión y formularios se implementan por plataforma |
| SQL/RPC conserva la fuente canónica de métricas y reglas sensibles | Push móvil [P1]: migrar el transporte y tokens Expo a FCM/APNs |
| `packages/core` y `packages/db` continúan sirviendo a web/Edge/CI TypeScript | Apps nativas no consumen directamente paquetes TypeScript/Zod |

### 5.2 Paridad funcional entre plataformas

- **Web [P0]:** funcionalidad completa — administración de grupos, integrantes, apoderados, actividades, toma y edición de asistencia, reportes, configuración de visibilidad.
- **Móvil [P1]:** funciones núcleo — consulta para todos los roles (actividades, historial propio o de pupilos, reportes según toggles) + toma de asistencia para ADMIN + notificaciones push (recordatorio de actividad; aviso de ausencia al apoderado).
- Regla de paridad: la administración avanzada (configuración de grupo, gestión de invitaciones, edición de tipos de actividad) permanece solo-web en [P1]; la web es responsive, así que nada queda inaccesible desde un teléfono. Ampliar paridad móvil es decisión de roadmap post-v1.0 (ver 09-roadmap.md).

### 5.3 Orden de construcción

1. **[P0] Semanas 1-9:** esquema SQL + RLS + pgTAP primero (contrato de datos estable), luego web Next.js consumiendo PostgREST/Edge Functions. La "API" queda definida por el esquema, las vistas/RPC y las Edge Functions — no hay una capa API separada que versionar (ver 07-api-y-backend.md).
2. **[P1]:** los clientes Java/Swift consumirán los mismos endpoints PostgREST, vistas, RPC y Edge Functions. El esfuerzo incluye dos UIs nativas, clientes de red/sesión, pruebas de contrato y migración del push. La integración actual de anuncios #57 guarda tokens Expo y envía por Expo Push; esa infraestructura debe convivir durante la transición y luego migrarse a tokens/transporte nativos. Definir proveedor, esquema de tokens y despliegue forma parte de la Fase 2. No replicar en clientes reglas de permisos, visibilidad o cálculo que ya pertenecen a RLS/vistas/RPC.
3. **[P2]:** login social, modo offline con sincronización, QR/geocerca, etc., se montan sobre la misma base sin rediseño.

## 6. Multi-tenancy y escalamiento a múltiples clubes

### 6.1 Aislamiento lógico

- **Esquema único compartido** con discriminador `group_id` en `memberships`, `activities`, `activity_types` (nullable para tipos de sistema), `attendance_records` (vía `activity_id`) e `invitations`.
- **Autorización por membership:** toda política RLS resuelve pertenencia con los helpers `is_member(group_id)`, `is_group_admin(group_id)` e `is_guardian_of(athlete_user_id)` (SECURITY DEFINER, `STABLE`, cacheables por statement). Nadie ve nada de grupos donde no es miembro (regla de visibilidad 6).
- **Regla de visibilidad 5 en la base:** los no-ADMIN solo acceden a `users` de terceros a través de vistas con columnas explícitas (`id`, `full_name`, `avatar_url` + métricas agregadas); `email`, `phone`, `birthdate`, notas de asistencia de terceros y datos de apoderados de terceros jamás se proyectan. Prohibición de `SELECT *` sobre `users` hacia no-ADMIN, verificada con pgTAP en CI.

### 6.2 Índices (mínimos comprometidos en [P0], además de los únicos del canon)

| Tabla | Índice | Uso |
|---|---|---|
| `memberships` | `(group_id, role, status)` | lista de deportistas para toma de asistencia; conteos por rol |
| `memberships` | `(user_id)` | "mis grupos" multi-grupo |
| `activities` | `(group_id, starts_at DESC)` | calendario y listados por período |
| `attendance_records` | `(membership_id, recorded_at)` | historial individual y métrica por período |
| `attendance_records` | único `(activity_id, membership_id)` (canon) | también cubre la lectura por actividad |
| `invitations` | único `(token)`; `(group_id, status)` | aceptación de invitación; panel del ADMIN |
| `guardianships` | `(athlete_user_id)` y único `(guardian_user_id, athlete_user_id)` (canon) | validación "menor requiere apoderado"; vistas del apoderado |

### 6.3 Paginación, cache de reportes y límites

- **Paginación [P0]:** PostgREST con `limit`/`offset` y `Prefer: count=estimated`; página por defecto 50, máximo 100. Listados de alto crecimiento (actividades, historial de asistencia) migran a keyset por `(starts_at, id)` cuando un grupo supere ~1.000 actividades.
- **Cache de reportes [P0]:** las vistas de métrica se calculan en vivo (el volumen del MVP lo permite: un grupo típico genera <5.000 `attendance_records`/año) + cache de cliente con TanStack Query (`staleTime` 60 s). **Criterio verificable de escalado:** si el p95 de la vista de reportes del grupo supera 500 ms, se introduce una vista materializada por grupo refrescada por pg_cron cada hora y tras cada cierre de toma de asistencia. No se agrega Redis ni capa de cache externa en [P0]/[P1].
- **Límites razonables (validados en Edge Functions/RPC y declarados en 07-api-y-backend.md):** capacidad por suscripción (doc 12): 50/200/1.000 ATHLETE ACTIVE, máximo operativo de 5.000 memberships; grupos históricos sin plan conservan 500 memberships ACTIVE; máx. 30 grupos por usuario; expansión de `recurrence_rule` semanal limitada a 6 meses o 150 instancias por regla (lo que ocurra primero); toma de asistencia en lote máx. 500 registros por llamada (Academia divide la acción en lotes secuenciales con éxitos parciales conservados, ver doc 12); rate limit de invitaciones: 50 por grupo por día (mismo valor que 07-api-y-backend.md §7.2).

### 6.4 Cómo crecer (sin rediseño)

| Escala | Acción |
|---|---|
| ~200 grupos activos (~6.000 usuarios, ~60.000 `attendance_records`/mes) | Compute add-on de Supabase (Small/Medium); vistas materializadas para reportes si se cruza el umbral p95 |
| Miles de grupos | Read replica de Supabase para vistas de reportes y exportaciones CSV [P1]; pooling con Supavisor en modo transacción |
| Notificaciones masivas [P1] | pg_cron encola trabajos idempotentes; una Edge Function consume el lote y envía por el transporte nativo FCM/APNs (migración pendiente desde Expo Push) / Resend — nunca envío síncrono dentro de la petición del usuario |
| Cliente institucional que exija residencia en Chile o aislamiento fuerte | Salida documentada: `pg_dump` a Postgres autogestionado + capa API propia (Propuesta B); el esquema y `packages/core` se llevan sin cambios |

## 7. Entornos, CI/CD, observabilidad y costos

### 7.1 Entornos

| Entorno | Frontend | Backend/DB | Datos |
|---|---|---|---|
| **dev (local)** | `next dev` | Supabase CLI sobre Docker (Postgres + Auth + PostgREST + Edge Functions locales) | seeds sintéticos por rol (los mismos de pgTAP) |
| **staging** | Vercel Preview (una URL por PR) + rama `staging` | Proyecto Supabase separado (plan Free), mismo esquema vía migraciones | datos sintéticos; **prohibido** copiar datos reales (datos de menores, ver 11-legal-seguridad-privacidad.md) |
| **prod** | Vercel Pro, dominio propio | Proyecto Supabase Pro en sa-east-1 | reales; backups diarios de Supabase + `pg_dump` semanal automatizado (GitHub Actions) hacia storage externo cifrado, fuera de Supabase |

Secretos por entorno en Vercel/Supabase/GitHub Actions; nunca en el repositorio. La `service_role key` solo existe en Edge Functions y CI, jamás en clientes.

### 7.2 CI/CD básico (GitHub Actions)

1. **En cada PR:** lint + typecheck (Turborepo, con cache remoto), tests unitarios de `packages/core` (Vitest, incluye los casos canónicos de la métrica), `supabase start` en Docker → aplica migraciones → corre **pgTAP** (políticas RLS con seeds por rol, vistas de métrica contra los mismos casos que Vitest) → tests de integración de Edge Functions.
2. **Merge a `main`:** deploy automático de frontend a staging (Vercel) + `supabase db push` y deploy de Edge Functions al proyecto staging.
3. **Release (tag `vX.Y.Z`):** mismos pasos contra producción, con aprobación manual (environment protegido de GitHub).
4. **[P1]:** builds nativos Android con Gradle y iOS con Xcode; distribución interna por Play Console/TestFlight y publicación por las tiendas. Definir estrategia de firma, secretos y versionado por plataforma.

El hardening de este pipeline (Supabase CLI sobre Docker es más lento y frágil que un backend con DI) está presupuestado dentro de las 9 semanas de [P0], como señaló el panel.

### 7.3 Observabilidad mínima

- **Errores:** Sentry en web [P0], Edge Functions [P0] y móvil [P1]; release tracking por deploy; alertas a Slack/email en errores nuevos.
- **Logs estructurados:** Edge Functions loguean JSON (`{level, fn, group_id, user_id, event, duration_ms}`) — sin datos personales sensibles en logs (nunca email/phone/birthdate); consulta vía Supabase Logs.
- **Uptime:** monitor externo gratuito (Better Stack o UptimeRobot) sobre `https://app.../api/health` (verifica render + conexión a DB) y sobre el endpoint REST de Supabase; alerta si hay 2 fallos consecutivos.
- **Jobs programados:** cada ejecución de pg_cron escribe en una tabla `job_runs` (`job_name, started_at, finished_at, status, error`); una Edge Function diaria alerta si un job no corrió o falló — mitiga los fallos silenciosos señalados por el panel.
- **Métricas de negocio mínimas:** panel simple (SQL sobre la propia DB) con grupos activos, tomas de asistencia por semana y usuarios activos — suficiente para validar mercado en [P0], sin herramienta de producto adicional.

### 7.4 Costos estimados mensuales (USD)

| Ítem | MVP [P0] | v1.0 con [P1] | ~200 grupos activos |
|---|---|---|---|
| Vercel Pro | 20 | 20 | 20-40 (uso) |
| Supabase Pro (+ compute add-on en escala) | 25 | 25 | 85-135 (Small/Medium add-on) |
| Resend (email transaccional) | 0 (free, 3k/mes) | 20 | 20 |
| Sentry | 0 (free/dev) | 0-26 | 26 (Team) |
| Builds nativos, firma y publicación Android/iOS [P1] | — | **Pendiente de cotización** | **Pendiente de cotización** |
| Monitor de uptime | 0 | 0 | 0-10 |
| Backups externos (storage cifrado) | 1-5 | 1-5 | 5-10 |
| **Total** | **~46-70** | **No recalculado** (la estimación anterior incluía EAS) | **No recalculado** |

Supuestos de la columna de escala: 200 grupos × ~30 miembros ≈ 6.000 usuarios, ~2.000 actividades/mes, ~60.000 `attendance_records`/mes (~720k/año) — volumen holgado para un Postgres con compute Small/Medium, sin rediseño.

## 8. Riesgos técnicos y mitigaciones (del panel, con dueño en este plan)

| Riesgo | Mitigación | Dónde se detalla |
|---|---|---|
| Dispersión de lógica entre SQL y TypeScript | Convención "lectura = RLS+vistas/RPC; write no trivial = Edge Function/RPC" desde el día 1; métrica testeada contra ambas capas con los mismos casos | Sección 2.1; 07-api-y-backend.md |
| RLS mal refactorizada filtra datos entre grupos o expone contacto/birthdate/notas (regla 5) | pgTAP + seeds por rol en CI bloqueando el merge; prohibición de `SELECT *` sobre `users` hacia no-ADMIN | Sección 6.1; 07-api-y-backend.md |
| Cuentas MANAGED no mapean a `auth.users` out-of-the-box | Desacople `public.users` ↔ `auth.users` diseñado y revisado temprano (semanas 1-2), con flujo de claim y consentimiento del apoderado | 04-modelo-de-datos.md; 11-legal-seguridad-privacidad.md |
| Dependencia de un único proveedor (Supabase) | Esquema SQL y `packages/core` portables; `pg_dump` semanal fuera de Supabase; Propuesta B documentada como ruta de salida | Secciones 4 y 7.1 |
| Edge Functions: cold starts, límites, observabilidad pobre en flujos programados | Sentry + pg_cron con colas idempotentes (`notification_jobs`, `job_runs`) y alerta diaria de jobs fallidos | Secciones 6.4 y 7.3 |
| Residencia de datos en sa-east-1 (Brasil), no en Chile | Declarado en política de privacidad; aceptable bajo Ley 19.628/21.719 con cláusulas adecuadas; evaluar residencia local solo si un cliente institucional la exige | 11-legal-seguridad-privacidad.md |
| CI sobre Supabase CLI/Docker lento o frágil | Hardening del pipeline presupuestado dentro de las 9 semanas de [P0]; cache de imágenes Docker en Actions | Sección 7.2; 09-roadmap.md |
| Deslizamiento de las 9 semanas por los 3 flujos no-CRUD complejos | Corte de alcance estricto a etiquetas [P0]; los flujos complejos se diseñan primero (semanas 1-3) | 09-roadmap.md |


[Seguro] **MIG-12 (#156, 2026-10-07):** [historial/reportes por Nest](migration/issue-156/README.md) con cuatro lecturas HTTP/SDK y consumidores Next por REPORTS, sobre las mismas RPC/RLS canónicas. Mantiene permisos, filtros, métrica y cortes Chile sin caché adicional; evidencia de paridad y p95 exclusivamente local sintética.

[Seguro] **MIG-13 (#157, 2026-10-07):** [worker Nest y transición de mayoría](migration/issue-157/README.md), cola PostgreSQL con leases, ledger canónico y correo independiente con payload/clave estables. Instalación mantiene LEGACY; activar requiere handoff, retirada/drenaje de Edge y constancia del operador. Reintentos inciertos de correo se bloquean a las 23 h; corte y proveedores externos siguen pendientes.


## Almacenamiento independiente · MIG-17 (#161)

[Seguro] [MIG-17](migration/issue-161/README.md) implementa adaptador privado S3 en Nest y transporte de avatar compatible con la URL web, herramientas de copia/checksum/delta/reversión y ensayo S3 real local. Storage deja de ser dependencia de avatar al activar STORAGE=nest tras conciliación; Auth/DB siguen temporales. Provisión/corte cloud pendientes; MinIO se usa únicamente como fixture.
