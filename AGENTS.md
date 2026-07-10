# AGENTS.md — Asisteam

Guía para agentes de IA (Claude Code, Cursor, Copilot, Codex, Windsurf, etc.) que trabajen en este repositorio. Sintetiza la documentación canónica de `docs/`; ante cualquier conflicto, **los documentos de `docs/` mandan**.

## 1. Qué es Asisteam

Aplicación **web [P0] y móvil [P1]** para el control de asistencia de deportistas/integrantes a entrenamientos y actividades de clubes o equipos deportivos. **Multi-tenant**: múltiples grupos independientes; un mismo usuario puede pertenecer a varios grupos con roles distintos. Mercado inicial: Chile/Latam (UI en español, zona horaria `America/Santiago`).

**Roles por membresía (nunca globales):** `ADMIN` (gestiona el grupo, único que toma/edita asistencia en MVP), `ATHLETE` (deportista), `GUARDIAN` (apoderado de menores de edad). `COACH` es [P2].

**Estado actual del repo:** solo documentación (`docs/01`–`11` + `README.md`). No hay código todavía; la Fase 0 (setup del monorepo) es el siguiente paso según el roadmap.

### Etiquetas de prioridad

- **[P0]** — MVP Web (~9 semanas): el corazón del producto.
- **[P1]** — MVP Móvil + push + export CSV (completa la v1.0, meta 2026-11-13).
- **[P2]** — Post-MVP por olas (offline, COACH, pagos, QR, etc.). **Nunca implementar features [P2] sin decisión explícita.**

## 2. Stack tecnológico (decisión cerrada, doc 06)

| Capa | Elección |
|---|---|
| Web [P0] | **Next.js 16** (App Router, React 19, TypeScript 5) + Tailwind CSS 4 + shadcn/ui + supabase-js 2 + TanStack Query 5 + react-hook-form + Zod |
| Móvil [P1] | **Expo SDK 54+** (React Native, TypeScript) + expo-router + EAS Build/Submit + Expo Notifications |
| Backend | **Supabase**: PostgREST + RLS (lecturas), Edge Functions Deno/TS + RPC PL/pgSQL (escrituras con reglas de negocio), pg_cron (jobs) |
| Base de datos | **PostgreSQL 17** (Supabase Cloud, AWS `sa-east-1`), esquema único multi-tenant discriminado por `group_id` |
| Auth | Supabase Auth (email+contraseña [P0]; Google/Apple [P2]); `public.users` **desacoplada** de `auth.users` (FK opcional) para cuentas MANAGED sin credenciales |
| Hosting/infra | Vercel Pro + Supabase Pro + Resend (email transaccional) + Sentry (errores) + GitHub Actions (CI) |
| Monorepo | **pnpm + Turborepo** |

Alternativas descartadas (comparativa en doc 06 §4): backend propio NestJS (ruta de salida documentada si se supera el BaaS) y Flutter (degradaba el P0 web).

### Estructura del repositorio (objetivo)

```
asisteam/
├── apps/
│   ├── web/          # Next.js 16 [P0]
│   └── mobile/       # Expo [P1]
├── packages/
│   ├── core/         # métrica canónica, schemas Zod, tipos de dominio, constantes de enums y etiquetas en español
│   └── db/           # tipos generados con `supabase gen types typescript`
├── supabase/
│   ├── migrations/   # SQL versionado (tablas, enums, RLS, vistas, triggers, RPC)
│   ├── functions/    # Edge Functions (Deno)
│   ├── seeds/        # seeds por rol para pgTAP y entornos de prueba
│   └── tests/        # pgTAP: políticas RLS y vistas de métrica
└── turbo.json / pnpm-workspace.yaml
```

## 3. Convención obligatoria de acceso a datos (regla de equipo desde el día 1)

| Operación | Camino |
|---|---|
| Lectura y CRUD trivial | PostgREST + RLS, o vistas/RPC con **columnas explícitas**. **Prohibido `SELECT *` sobre `users` hacia no-ADMIN** (verificado con pgTAP en CI) |
| Escritura con efectos o invariantes | Edge Function o RPC PL/pgSQL transaccional (invitaciones, MANAGED→ACTIVE, menor-requiere-apoderado, expansión de recurrencia, asistencia en lote) |
| Invariantes de datos | Constraints + triggers como red de seguridad |
| Tareas programadas | pg_cron → Edge Function **idempotente**, con registro en tabla `job_runs` |

La autorización vive en la base: helpers `SECURITY DEFINER` (con `search_path` fijo) `is_member(group_id)`, `is_group_admin(group_id)`, `is_guardian_of(athlete_user_id)`. Las RPC repiten la verificación al inicio (defensa en profundidad). RLS es deny-by-default en todas las tablas.

## 4. Conceptos canónicos del dominio

### 4.1 Estados

- **Asistencia** (`attendance_records.status`): `PRESENT` (Presente), `ABSENT` (Ausente), `LATE` (Atrasado), `EXCUSED` (Justificado).
- **Cuenta** (`users.account_status`): `ACTIVE` (credenciales propias), `INVITED` (creada por invitación, pendiente de completar registro), `MANAGED` (gestionada por ADMIN, sin credenciales — típica para menores; **no puede iniciar sesión**).
- **Membresía** (`memberships.status`): `INVITED` | `PENDING` | `ACTIVE` | `INACTIVE`. Transiciones solo vía RPC.

### 4.2 Métrica canónica de asistencia

```
attendance_pct = (PRESENT + LATE) / (convocadas − EXCUSED) × 100
```

- Redondeo a **1 decimal** (half-up). Equivalencia SQL: denominador = `PRESENT + LATE + ABSENT`.
- `EXCUSED` **no penaliza** (sale del denominador); `LATE` cuenta como asistencia pero se reporta aparte como puntualidad: `late_rate = LATE / (PRESENT + LATE) × 100`.
- Denominador 0 → `null` en la API / "Sin datos" en UI, **nunca 0 % ni 100 %**.
- "Convocada" = existe fila en `attendance_records` para esa membership en esa actividad. Actividades sin registro **no cuentan** en ninguna métrica.
- Solo actividades con `starts_at <= now()` y `starts_at >= memberships.joined_at` (ingreso a mitad de temporada no arrastra ausencias previas).
- Toda métrica es **por grupo**; nunca se cruzan grupos ni existe porcentaje global.
- La métrica vive en **dos capas con una sola fuente por capa**: vistas SQL (reportes) y `packages/core` (cliente); ambas se testean contra **la misma batería de casos canónicos** (Vitest + pgTAP). Ejemplo verificable: 10 convocadas, 6 PRESENT, 1 LATE, 2 ABSENT, 1 EXCUSED → 7/9 = **77.8 %**.

### 4.3 Las 6 reglas de visibilidad (V1–V6, doc 02 §4)

1. **V1** — ATHLETE siempre ve lo propio (grupos, actividades, historial, %). No depende de toggles.
2. **V2** — GUARDIAN siempre ve a sus pupilos vigentes, en los grupos donde el pupilo es miembro.
3. **V3** — GUARDIAN solo de menores: al cumplir 18 el pupilo, el vínculo pasa a `INACTIVE`.
4. **V4** — Estadísticas agregadas del grupo solo con toggle: `groups.settings.athletes_can_view_group_stats` / `guardians_can_view_group_stats` (JSONB, independientes, por grupo, **default `false`**, solo ADMIN los edita).
5. **V5** — Datos que **NUNCA** ve un no-ADMIN (aunque los toggles estén activos): `email`, `phone`, `birthdate` de terceros, notas de asistencia de terceros, datos de apoderados de terceros, desglose actividad-por-actividad de terceros. Solo `full_name` + avatar + métricas agregadas. Se aplica **en el servidor** (vistas/serializadores), jamás solo en el frontend.
6. **V6** — Aislamiento entre grupos: nadie ve nada de grupos donde no es miembro; toda consulta valida membership `ACTIVE` en el `group_id`.

### 4.4 Menores de edad (regla transversal crítica)

- Menor = < 18 años según `users.birthdate` evaluado en `America/Santiago`. `birthdate` es **obligatorio** para todo ATHLETE.
- **R1 (invariante):** ningún ATHLETE menor pasa a membership `ACTIVE` sin ≥ 1 `guardianship` activa **con consentimiento `DATA_PROCESSING_MINOR` vigente** en `consents` (`revoked_at IS NULL`).
- Menor que entra por código de grupo queda `PENDING` (invisible en asistencia y reportes) hasta apoderado vinculado + confirmación del ADMIN.
- Cuentas `MANAGED`: creadas por ADMIN sin credenciales (email nullable); conversión a `ACTIVE` solo vía invitación por email + consentimiento del apoderado si sigue siendo menor (flujo CB-06, doc 02).
- Job diario (00:30 America/Santiago) al cumplir 18: `guardianships.status = 'INACTIVE'` + `deactivated_at`; el ex-apoderado pierde visibilidad ese mismo día. Las filas se conservan como histórico.
- Marco legal: Ley 19.628 y **Ley 21.719** (vigencia dic 2026; el producto se diseña directamente contra ella). Checklist pre-lanzamiento C-01…C-20 en doc 11 §8.

## 5. Modelo de datos (doc 04)

9 tablas [P0]: `users`, `groups`, `memberships`, `guardianships`, `activity_types`, `activities`, `attendance_records`, `invitations`, `consents`. DDL completo en doc 04 §5.

### Convenciones SQL

- PKs `uuid` con `gen_random_uuid()` (pgcrypto). Identificadores en **inglés `snake_case`**; etiquetas visibles en español viven en `packages/core`.
- Fechas `timestamptz` **siempre en UTC**; presentación en `America/Santiago` es responsabilidad de frontend/API. Los límites de período de reportes se calculan en hora de Chile y se convierten a UTC.
- Enums como `text` + `CHECK` (**no `CREATE TYPE`**), para migraciones incrementales.
- `updated_at` por trigger genérico `set_updated_at()`.
- **Nunca borrado físico** de usuarios/miembros con historial: se desactivan (`status = INACTIVE`) o se anonimizan (doc 11 §5.4).

### Uniques canónicos

| Tabla | Unique |
|---|---|
| `users` | `lower(email)` parcial `WHERE email IS NOT NULL` (múltiples NULL para MANAGED) |
| `groups` | `invite_code` (8 chars alfanuméricos, regenerable) |
| `memberships` | `(user_id, group_id, role)` — una fila por rol; multi-rol = varias filas |
| `guardianships` | `(guardian_user_id, athlete_user_id)` — vínculo global por persona, no por grupo |
| `attendance_records` | `(activity_id, membership_id)` — editar = `UPDATE`/upsert, nunca fila nueva |
| `invitations` | `token` (≥128 bits, un solo uso, almacenado hasheado SHA-256, expira a 7 días) |
| `activity_types` | `(group_id, name)` parcial; `name` parcial para tipos de sistema (`group_id IS NULL`) |

### Puntos clave del modelo

- `activity_types` de sistema (`group_id = NULL`, UUIDs fijos sembrados por migración, **inmutables**): `TRAINING`, `PHYSICAL_PREP`, `COMPETITION`, `MEETING`.
- Recurrencia semanal simple: `activities.recurrence_rule` JSONB `{"freq":"WEEKLY","by_weekday":["TU","TH"],"until":"..."}`; se **materializa** una fila por ocurrencia (máx. 26 semanas o 150 instancias); `recurrence_source_id` autorreferencia la serie.
- `attendance_records.membership_id` debe ser rol ATHLETE del **mismo grupo** de la actividad (validación en servicio + trigger `trg_attendance_membership` como defensa en profundidad).
- `consents` es append-only: revocar = `UPDATE revoked_at`, re-otorgar = fila nueva; jamás `DELETE` (evidencia de licitud).
- Un ADMIN que también entrena tiene **dos filas** de membership; su asistencia referencia siempre la membership ATHLETE (CB-01).
- El GUARDIAN obtiene membership GUARDIAN **auto-creada** en cada grupo donde su pupilo es miembro activo (CB-02) y no puede salir mientras tenga pupilos vigentes ahí (error 422 `guardian_has_active_wards`).
- Tablas futuras (no crear en P0): `push_tokens`/`notifications` [P1], `justification_requests`/`payments`/`audit_log` [P2].

## 6. API y backend (doc 07)

No hay API REST artesanal: el contrato canónico es la tabla de operaciones de doc 07 §2 con notación lógica `/api/v1/...`, donde cada operación se implementa vía PostgREST (vista), RPC (`rpc/nombre`) o Edge Function (`functions/v1/nombre`).

- **Errores uniformes:** `{ "error": { "code": "snake_case_estable", "message": "texto en español", "details": {} } }`. HTTP: 400 validación, 401 sin sesión, 403 sin permiso, **404 no existe o no visible (anti-enumeración)**, 409 conflicto (ej. `LAST_ADMIN`, `membership_already_exists`), 422 regla de negocio (ej. `minor_cannot_leave`, `guardian_has_active_wards`), 429 rate limit.
- **Validación:** schemas Zod en `packages/core`, compartidos por web, móvil y Edge Functions; CHECK/UNIQUE de Postgres como red final. Tipos regenerados con `supabase gen types` en cada migración; el CI falla si divergen.
- **Reglas de negocio R1–R15** (doc 07 §5) — las críticas: R1 menor-requiere-apoderado+consentimiento; R2 solo ADMIN toma/edita asistencia; R3 upsert único por `(activity_id, membership_id)`, lote ≤ 500; R4 métrica canónica en vista SQL y core con los mismos tests; R5 último ADMIN no puede salir (409 `LAST_ADMIN`, con `FOR UPDATE`); R6 scoping por grupo vía RLS; R7 convocatoria = existe registro; R10 código de grupo solo incorpora ATHLETE (GUARDIAN solo por invitación dirigida); R12 invitaciones expiran a 7 días; R13 editar serie afecta solo futuras sin asistencia; R14 tipos de sistema inmutables.
- **Auth:** JWT access (1 h) + refresh rotatorio; en web con `@supabase/ssr` (cookies HttpOnly/Secure/SameSite=Lax, **nunca localStorage**); `auth.uid()` → `public.users.id` vía helper `auth_user_id()`.
- **Seguridad:** `service_role` key SOLO en Edge Functions y CI, jamás en clientes ni `NEXT_PUBLIC_*`; anti-enumeración en login/recovery/invitaciones; rate limits (join por código 10/15 min, invitaciones 50/día/grupo); CORS por allowlist; contraseñas argon2id/bcrypt, mínimo 10 chars; scrubbing de PII en logs y Sentry (nunca email/phone/birthdate en logs).
- **Límites:** máx. 500 memberships ACTIVE por grupo; 30 grupos por usuario; paginación PostgREST default 50 / máx. 100; reportes en vivo sin cache (si p95 > 500 ms, recién ahí vista materializada — no antes).

## 7. Testing y CI (docs 06 §7.2, 09)

1. **En cada PR:** lint + typecheck (Turborepo con cache remoto), Vitest de `packages/core` (incluye casos canónicos de la métrica), `supabase start` en Docker → migraciones → **pgTAP** (políticas RLS con seeds por rol, incluidos tests negativos de las 6 reglas de visibilidad) → integración de Edge Functions. Presupuesto: < 12 min.
2. **Merge a `main`:** deploy automático a staging (Vercel + `supabase db push`).
3. **Release (tag `vX.Y.Z`):** deploy a producción con aprobación manual.
4. Gates innegociables: pgTAP en verde para toda migración que toque RLS; misma batería métrica SQL ↔ core; imposible activar ATHLETE menor sin guardianship+consentimiento (test de integración).

**Entornos:** dev local (Supabase CLI/Docker, seeds sintéticos), staging (proyecto Supabase separado, **prohibido copiar datos reales** — datos de menores), prod (`sa-east-1`, backups diarios + `pg_dump` semanal externo cifrado). Secretos solo en Vercel/Supabase/GitHub Actions, nunca en el repo.

## 8. Frontend y pantallas (doc 05)

- Rutas web en inglés con grupo activo en URL: `/groups/:groupId/...`; fuera de contexto de grupo: `/login`, `/profile`, `/wards`, `/join`. Códigos estables de pantalla (`AUT-01`, `GRP-02`, `ASI-01`, …) usados como referencia cruzada.
- Web responsive [P0]: la toma de asistencia debe ser usable a una mano en viewport 375 px (se toma en la cancha).
- Móvil [P1] cubre solo funciones núcleo (consulta multi-rol + toma de asistencia ADMIN); toda pantalla de **gestión** es solo-web en v1.0.
- Multi-rol en un grupo: se muestra la vista del rol más permisivo + sección "Mi asistencia".
- Reportes [P0] como tablas accesibles (copiar/pegar, Ctrl+F); gráficos enriquecidos son [P1]. Semáforo de %: ≥85 verde, 70–84.9 ámbar, <70 rojo. Chips de estado: PRESENT verde, LATE ámbar, ABSENT rojo, EXCUSED gris.

## 9. Roadmap resumido (doc 09)

| Fase | Qué | Duración |
|---|---|---|
| 0 | Monorepo, Supabase, CI/CD, esquema canónico completo + helpers RLS, wireframes, spikes de los 3 flujos críticos | 2 sem (desde 2026-07-06) |
| 1 | MVP Web [P0]: M1 Auth → M2 Grupos → M3 Integrantes/apoderados (2 sem, el más riesgoso) → M4 Actividades → M5 Asistencia → M6 Historial → M7 Reportes → M8 Visibilidad | 9 sem |
| 2 | MVP Móvil [P1] (Expo, push, CSV) | 6 sem |
| 3 | Beta con 3-5 clubes reales + hardening legal (solapada) | → **v1.0: 2026-11-13** |
| 4 | Olas [P2] | post-v1.0 |

Cada módulo de Fase 1 cierra con sus políticas RLS testeadas en pgTAP antes de pasar al siguiente.

## 10. Reglas de oro para agentes de IA

1. **Respeta las etiquetas [P0]/[P1]/[P2]**: no implementes ni "prepares" alcance de una prioridad superior sin pedirlo explícito. El scope creep es el riesgo #6 del proyecto.
2. **La lógica de dominio no se duplica**: métrica, schemas Zod, enums y etiquetas viven en `packages/core` y/o vistas SQL — jamás re-implementadas ad-hoc en una pantalla o Edge Function.
3. **Nunca expongas a no-ADMIN**: email, phone, birthdate, notas de terceros ni apoderados de terceros (regla V5). Ante la duda, proyecta menos columnas.
4. **Todo write no trivial pasa por RPC/Edge Function** transaccional; el cliente nunca escribe directo contra tablas base con invariantes.
5. **UTC en la base, America/Santiago en la presentación**. Los cortes de semana/mes se calculan en hora de Chile.
6. **No borres historia**: desactivar/anonimizar en vez de DELETE; `consents` y `guardianships` son evidencia legal.
7. Nueva migración ⇒ regenerar tipos (`supabase gen types`) + tests pgTAP de las políticas afectadas.
8. Textos de UI y mensajes de error en **español**; código e identificadores en **inglés**.
9. Los 4 tipos de actividad de sistema y los toggles default `false` son inamovibles.
10. Ante ambigüedad de producto, la fuente de verdad es `docs/` en este orden: 02 (permisos) → 04 (datos) → 07 (API) → 08 (métrica) → 11 (legal).

## 11. Índice de documentación

| Doc | Contenido | Léelo para |
|---|---|---|
| [01-vision-y-alcance.md](docs/01-vision-y-alcance.md) | Objetivo, problema, usuarios, casos de uso, alcance P0/P1/P2, criterios de éxito E1–E8 | Entender el qué y el porqué |
| [02-roles-y-permisos.md](docs/02-roles-y-permisos.md) | Matriz de 37 acciones × 3 roles, condiciones C1–C15, reglas de menores, visibilidad V1–V6, casos borde CB-01–CB-06 | Saber quién puede hacer/ver qué |
| [03-modulos-y-flujos.md](docs/03-modulos-y-flujos.md) | 9 módulos (M1–M9) con dependencias, 8 flujos (F1–F8) con diagramas | Cómo se conectan las funcionalidades |
| [04-modelo-de-datos.md](docs/04-modelo-de-datos.md) | Entidades, ERD, constraints, índices, DDL completo, reglas de integridad, tablas futuras | Implementar la base de datos |
| [05-pantallas.md](docs/05-pantallas.md) | Inventario de pantallas por rol con códigos estables, navegación, detalle de pantallas críticas | Construir la interfaz |
| [06-arquitectura-y-stack.md](docs/06-arquitectura-y-stack.md) | Decisión de arquitectura, alternativas evaluadas, multi-tenancy, escalamiento, entornos, costos | Montar la plataforma |
| [07-api-y-backend.md](docs/07-api-y-backend.md) | Contrato de operaciones, ejemplos JSON, validaciones, reglas R1–R15, seguridad OWASP, rate limits | Implementar el backend |
| [08-reportes-y-estadisticas.md](docs/08-reportes-y-estadisticas.md) | Fórmulas exactas, visibilidad por rol, SQL de referencia, casos especiales | Reportes correctos y consistentes |
| [09-roadmap.md](docs/09-roadmap.md) | 5 fases, orden de módulos, Gantt, 13 riesgos con mitigación | Planificar el desarrollo |
| [10-historias-de-usuario.md](docs/10-historias-de-usuario.md) | 47 historias (HU-ADM/DEP/APO/GEN) con criterios Dado/Cuando/Entonces | Tickets y QA |
| [11-legal-seguridad-privacidad.md](docs/11-legal-seguridad-privacidad.md) | Datos de menores, consentimiento, Ley 19.628/21.719, retención/anonimización, checklist C-01–C-20 | Cumplir el marco legal chileno |
