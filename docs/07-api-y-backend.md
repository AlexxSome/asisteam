# API y backend

**Proyecto:** Asisteam · **Fecha:** 2026-07-03 · **Documentos relacionados:** 02-roles-y-permisos.md, 03-modulos-y-flujos.md, 04-modelo-de-datos.md, 06-arquitectura-y-stack.md, 08-reportes-y-estadisticas.md, 11-legal-seguridad-privacidad.md

---

## 1. Enfoque general del backend

El stack elegido (ver 06-arquitectura-y-stack.md) es **Supabase (PostgreSQL 17 + Auth + RLS + PostgREST + Edge Functions)**. Por lo tanto Asisteam **no expone una API REST artesanal**: la "API" es la combinación de tres capas, con una convención estricta de equipo adoptada desde el día 1:

| Capa | Uso | Regla |
|---|---|---|
| **PostgREST + RLS** | Lecturas y CRUD simple sin efectos colaterales [P0] | Toda lectura pasa por vistas o RPC con **columnas explícitas**; prohibido `SELECT *` sobre `users` hacia no-ADMIN |
| **Funciones RPC (PL/pgSQL, `SECURITY DEFINER` cuando corresponde)** | Escrituras transaccionales con reglas de negocio [P0] | Todo write no trivial pasa por RPC o Edge Function; nunca desde el cliente contra tablas base |
| **Edge Functions (Deno/TypeScript)** | Flujos con efectos externos: email de invitación, claim de cuentas MANAGED, push [P1] | Validan con schemas Zod de `packages/core`; idempotentes cuando las dispara `pg_cron` |

Para que el contrato sea legible y estable ante los clientes (web [P0] y móvil [P1]), la tabla de operaciones de la sección 2 usa la **notación lógica `/api/v1/...`**: cada fila indica en la columna *Implementación* si se resuelve vía PostgREST (tabla/vista), RPC (`rpc/nombre_funcion`) o Edge Function (`functions/v1/nombre`). Esta tabla es el contrato canónico; los nombres de RPC y vistas son los identificadores reales en la base.

```mermaid
flowchart LR
    W["Web Next.js 16 [P0]"] -->|supabase-js| GW[Supabase API Gateway]
    M["Móvil Expo [P1]"] -->|supabase-js| GW
    GW --> AUTH["Supabase Auth\n(JWT access + refresh)"]
    GW --> PGRST["PostgREST\nlecturas: vistas + RLS"]
    GW --> RPC["RPC PL/pgSQL\nwrites transaccionales"]
    GW --> EF["Edge Functions\nefectos externos"]
    PGRST --> DB[(PostgreSQL 17\nRLS + triggers + constraints)]
    RPC --> DB
    EF --> DB
    EF --> RESEND[Resend email]
    CRON[pg_cron] --> EF
```

## 2. Tabla de operaciones (contrato canónico)

Convenciones: rutas lógicas `/api/v1/`, recursos en plural. Rol requerido = rol de la **membership del solicitante en el grupo afectado** (los roles no son globales; ver 02-roles-y-permisos.md). "Autenticado" = cualquier usuario con sesión válida.

### 2.1 Auth

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| POST | /api/v1/auth/register | Público | Registro con email + contraseña; crea `auth.users` y perfil en `public.users` (ACTIVE) | Supabase Auth `signUp` + trigger de perfil | [P0] |
| POST | /api/v1/auth/login | Público | Login email + contraseña; retorna access + refresh token | Supabase Auth `signInWithPassword` | [P0] |
| POST | /api/v1/auth/refresh | Sesión con refresh token | Renueva el access token | Supabase Auth `refreshSession` | [P0] |
| POST | /api/v1/auth/password-recovery | Público | Envía email de recuperación (respuesta siempre 200, sin revelar existencia del email) | Supabase Auth `resetPasswordForEmail` | [P0] |
| POST | /api/v1/auth/password-reset | Token de recuperación | Fija nueva contraseña | Supabase Auth `updateUser` | [P0] |
| POST | /api/v1/auth/logout | Autenticado | Revoca el refresh token de la sesión | Supabase Auth `signOut` | [P0] |
| POST | /api/v1/auth/social/{google,apple} | Público | Login social | Supabase Auth OAuth nativo | [P2] |

### 2.2 Users / perfil

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| GET | /api/v1/users/me | Autenticado | Perfil propio completo (incluye email, phone, birthdate) | PostgREST `users` + RLS `id = auth_user_id()` | [P0] |
| PATCH | /api/v1/users/me | Autenticado | Edita full_name, phone, birthdate, avatar_url | PostgREST + RLS; birthdate protegido por trigger si rompe invariante de menor (§5) | [P0] |
| GET | /api/v1/users/{id} | ADMIN del grupo común / GUARDIAN del pupilo | Perfil de tercero con columnas según rol (§6.3) | Vista `v_member_profiles` (columnas explícitas) | [P0] |
| POST | /api/v1/users/me/avatar | Autenticado | Sube avatar (JPEG/PNG/WebP ≤ 2 MB) | Supabase Storage bucket `avatars` + RLS por owner | [P0] |
| DELETE | /api/v1/users/me | Autenticado | Solicita eliminación de cuenta (ver 11-legal-seguridad-privacidad.md) | Edge Function `functions/v1/delete-account` | [P0] |

#### Correcciones de mayoría de edad y fotos (HU-GEN-04, #16)

- `rpc/request_birthdate_change(p_birthdate)` registra la corrección menor→adulto cuando hay memberships ATHLETE `ACTIVE` o `PENDING`. Conserva la fecha vigente hasta que **un ADMIN de cada grupo** confirme. Una persona no puede aprobar su propia solicitud; si es el único ADMIN debe incorporar otro mediante la gestión de roles. Las solicitudes nuevas o cambios posteriores de fecha invalidan las anteriores.
- `rpc/list_birthdate_reviews()` proyecta solo nombre, fechas y grupo que administra el solicitante. `rpc/review_birthdate_change(p_request_id,p_group_id,p_approve)` confirma o rechaza desde `/profile/birthdate-requests`. Revalida grupos actuales y que los aprobadores sigan siendo ADMIN `ACTIVE`; la última aprobación aplica la fecha, desactiva guardianships y memberships GUARDIAN sin otros pupilos, conservando historial. El rechazo conserva la fecha anterior.
- La edición directa menor→adulto rechazada por el trigger devuelve `birthdate_admin_confirmation_required`; la web registra la solicitud y guarda los demás campos por separado. `birthdate` no puede vaciarse si existe rol ATHLETE. Los límites de edad se calculan en `America/Santiago`.
- El bucket `avatars` es privado, con límite de 2 MiB y MIME JPEG/PNG/WebP. `avatar_url` guarda una URL relativa estable `/profile/avatar/{auth_user_id}/{archivo}`; el endpoint usa la sesión y RLS en cada lectura, sin cache ni enlaces públicos. La foto se comparte solo con roles autorizados por grupo (V1–V6); un menor requiere consentimiento de imagen vigente.
- `rpc/list_avatar_permissions()` y `rpc/set_avatar_permission(p_guardianship_id,p_allow)` permiten al apoderado gestionar en `/profile` la cláusula de imagen de un consentimiento `DATA_PROCESSING_MINOR` ya vigente. Cada decisión conserva su versión de términos, revoca la evidencia anterior y crea una nueva fila. No conceden el consentimiento general ni crean vínculos (flujos M3).
- Las tablas base `groups`, `memberships`, `guardianships` y `consents` son dependencias de autorización del perfil. Su CRUD permanece cerrado a clientes; las interfaces de gestión M2/M3 siguen en sus historias respectivas.

### 2.3 Groups

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| POST | /api/v1/groups | Autenticado | Crea grupo (club/equipo); el creador queda ADMIN ACTIVE; genera `invite_code` | RPC `rpc/create_group` | [P0] |
| GET | /api/v1/groups | Autenticado | Lista grupos donde el usuario tiene membership | Vista `v_my_groups` | [P0] |
| GET | /api/v1/groups/{id} | Miembro | Detalle del grupo (ADMIN ve además settings e invite_code) | Vista `v_group_detail` | [P0] |
| PATCH | /api/v1/groups/{id} | ADMIN | Edita name, sport, description, logo_url | PostgREST + RLS `is_group_admin(id)` | [P0] |
| PATCH | /api/v1/groups/{id}/settings | ADMIN | Toggles `athletes_can_view_group_stats`, `guardians_can_view_group_stats` (default false) | RPC `rpc/update_group_settings` (valida shape del JSONB con Zod/CHECK) | [P0] |
| POST | /api/v1/groups/{id}/invite-code/rotate | ADMIN | Regenera `invite_code` e invalida el anterior | RPC `rpc/rotate_invite_code` | [P0] |
| DELETE | /api/v1/groups/{id} | ADMIN | Desactiva/elimina el grupo (soft delete con confirmación) | RPC `rpc/deactivate_group` | [P0] |

### 2.4 Memberships

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| GET | /api/v1/groups/{id}/memberships | ADMIN (lista completa) / miembro (nómina reducida: nombre + rol) | Lista integrantes con filtros `role`, `status` | Vistas `v_group_members_admin` / `v_group_members_basic` | [P0] |
| POST | /api/v1/groups/{id}/memberships | ADMIN | Crea MANAGED sin credenciales; adulto ATHLETE ACTIVE, menor PENDING con apoderado y declaración ADMIN hasta consentimiento | RPC `rpc/create_managed_member` | [P0] |
| PATCH | /api/v1/memberships/{id}/approve | ADMIN | Aprueba membership PENDING → ACTIVE (valida invariante de menor) | RPC `rpc/approve_membership` | [P0] |
| PATCH | /api/v1/memberships/{id}/reject | ADMIN | Rechaza membership PENDING → INACTIVE conservando su fila e historial | RPC `rpc/reject_pending_membership` | [P0] |
| PATCH | /api/v1/memberships/{id}/role | ADMIN | Agrega/quita rol vía filas de membership por rol (nunca edita `role` in place) | RPC `rpc/set_member_roles` | [P0] |
| PATCH | /api/v1/memberships/{id}/deactivate | ADMIN, o el propio usuario (salir del grupo) | Marca INACTIVE; bloquea si es el último ADMIN ACTIVE (§5). La auto-desactivación se rechaza con 422 `minor_cannot_leave` si la membership es ATHLETE y el usuario es menor según `users.birthdate` (la baja de menores la ejecuta solo el ADMIN, nota C8 de 02-roles-y-permisos.md), y con 422 `guardian_has_active_wards` si es GUARDIAN con un pupilo ATHLETE ACTIVE o PENDING en el grupo (preserva la regla V2) | RPC `rpc/deactivate_membership` | [P0] |
| PATCH | /api/v1/memberships/{id}/reactivate | ADMIN | Reactiva INACTIVE → ACTIVE (revalida invariante de menor) | RPC `rpc/reactivate_membership` | [P0] |

#### Aprobaciones pendientes (HU-ADM-07)

- INT-06, `/groups/:groupId/members/pending`, usa `list_pending_memberships(p_group_id,p_offset)` con páginas de 50. Proyecta ID, nombre, mayoría/minoría de edad en Chile, vínculo activo, consentimiento vigente y si corresponde ratificación MANAGED; solo ADMIN del grupo. `list_pending_athletes` conserva el resumen existente de inicio.
- `approve_membership(p_group_id,p_membership_id)` y `reject_pending_membership(p_group_id,p_membership_id)` revalidan ADMIN y estado `PENDING` bajo bloqueo. La aprobación fija `joined_at` al momento de activar, verifica R1 y capacidad incluyendo apoderados auto-incorporados (CB-02). El rechazo conserva ID, perfil, vínculos, consentimientos y fecha de ingreso previa; `updated_at` registra la transición. No admite reactivaciones ni cambios de otros roles.
- Un menor requiere vínculo activo **y** `DATA_PROCESSING_MINOR` vigente. Las altas MANAGED pendientes conservan la ratificación del apoderado designado mediante `consent_managed_member`; el ADMIN no puede sustituirla desde Aprobaciones. Si el pendiente ya cumplió 18, deja de exigirse vínculo/consentimiento y puede ser aprobado por ADMIN.
- Respuestas: 404 `membership_not_found` para membership ajena, inexistente o de otro rol; 409 `membership_not_pending` si otra decisión ya la resolvió; 422 para vínculo/consentimiento faltante o límites de capacidad. No crea asistencia retroactiva.

#### Alta MANAGED y consentimiento (HU-ADM-05)

- `/groups/:groupId/members/new` llama a `create_managed_member(p_group_id,p_full_name,p_birthdate,p_email,p_guardian)`. Para menores, `p_guardian` contiene nombre, email, vínculo y `authorized: true`; la declaración ADMIN queda en `app_private.managed_member_enrollments`, sin crear consentimiento ni credenciales. No se sobrescriben perfiles existentes encontrados por email.
- El envío reutiliza `send-invitation` con rol GUARDIAN. El apoderado obtiene membership al aceptar la invitación; vincularlo al perfil no abre por sí solo el grupo. Si falla el correo, el alta queda PENDING y la web dirige a las invitaciones para reenviar o emitir la que falte sin repetir el alta.
- `list_managed_member_consents(p_group_id,p_offset)` devuelve solo nombre, vínculo y membership de los pupilos pendientes del solicitante, en páginas de 50; exige membership ACTIVE en ese grupo. `/groups/:groupId/members/consent` solicita aceptación explícita de la versión `2026-09-21`.
- `consent_managed_member(p_membership_id,p_accepted)` solo permite al apoderado vinculado registrar `DATA_PROCESSING_MINOR` (`IN_APP`, sin foto). Activa ATHLETE y fija `joined_at` en la misma transacción, revalidando permisos y capacidad; repetir la confirmación no duplica evidencia. La cuenta del deportista sigue MANAGED. No aprueba solicitudes PENDING originadas por código ni habilita credenciales del menor.

### 2.5 Invitations y join por código

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| POST | /api/v1/groups/{id}/invitations | ADMIN | Invitación dirigida por email con rol ATHLETE o GUARDIAN; crea `users` INVITED si no existe; envía email | Edge Function `functions/v1/send-invitation` (Resend) | [P0] |
| GET | /api/v1/groups/{id}/invitations | ADMIN | Lista invitaciones con status y expiración | PostgREST `invitations` + RLS | [P0] |
| DELETE | /api/v1/invitations/{id} | ADMIN | Revoca invitación PENDING | RPC `rpc/revoke_invitation` | [P0] |
| POST | /api/v1/invitations/{token}/accept | Autenticado (o registro en el mismo flujo) | Acepta invitación: crea/activa membership; si es claim de cuenta MANAGED exige consentimiento del apoderado para menores | Edge Function `functions/v1/accept-invitation` | [P0] |
| POST | /api/v1/groups/join | Autenticado | Unirse por `invite_code`: solo ATHLETE; adulto → ACTIVE, menor → PENDING hasta apoderado + confirmación ADMIN | RPC `rpc/join_group_by_code` | [P0] |
| GET | /api/v1/invite-codes/{code}/preview | Autenticado | Preview del grupo antes de unirse (solo name, sport, logo_url) | RPC `rpc/preview_invite_code` | [P0] |

### 2.6 Guardianships

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| POST | /api/v1/guardianships | ADMIN de un grupo del deportista | Vincula apoderado ↔ deportista menor con `relationship`; rechaza si el deportista es adulto | RPC `rpc/create_guardianship` | [P0] |
| GET | /api/v1/guardianships?athlete_user_id= | ADMIN del grupo / el propio GUARDIAN | Lista vínculos de un deportista | Vista `v_guardianships` | [P0] |
| GET | /api/v1/users/me/wards | GUARDIAN | Lista pupilos del apoderado autenticado | Vista `v_my_wards` | [P0] |
| DELETE | /api/v1/guardianships/{id} | ADMIN | Desvincula; bloquea si dejaría a un menor ACTIVE sin apoderado (§5) | RPC `rpc/remove_guardianship` | [P0] |
| — | (job diario) | Sistema | Al cumplir 18 el pupilo: vínculo pasa a inactivo, notifica a las partes | `pg_cron` → Edge Function `functions/v1/guardianship-majority` | [P0] |

#### Registro y vínculo de apoderados (HU-ADM-06)

- `/groups/:groupId/guardians` permite al ADMIN elegir un ATHLETE menor `ACTIVE` o `PENDING` de su grupo, indicar nombre/email del apoderado y `relationship`. `list_guardianship_athletes(p_group_id,p_search,p_offset)` ofrece búsqueda por nombre, páginas de 50 y solo ID/nombre/conteo; exige ADMIN del grupo.
- `create_guardianship(p_group_id,p_athlete_user_id,p_full_name,p_email,p_relationship)` registra el vínculo global y las memberships GUARDIAN `ACTIVE` en una transacción. Es el **registro directo del ADMIN**: incluye el grupo solicitado y los demás grupos donde el pupilo tenga ATHLETE `ACTIVE` (CB-02). Verifica autorización, edad según Chile y límites de 500 membresías activas/grupo y 30 grupos/apoderado bajo bloqueo.
- El email identifica al apoderado sin búsqueda global de usuarios. Un perfil nuevo queda `INVITED`, sin credenciales; un perfil existente se conserva. La web reutiliza `send-invitation` para que el destinatario complete su registro o acceda con su cuenta. Un fallo del correo conserva el vínculo y permite recuperar el envío desde Invitaciones.
- Respuestas: 404 `athlete_not_found` para pupilo inexistente o ajeno, 422 `guardian_only_for_minor` para adulto, 409 `guardianship_already_exists` si el par ya tiene vínculo, incluido su historial inactivo. No duplica ni reactiva vínculos históricos. Registrar el vínculo no crea consentimiento ni cambia la membership del deportista; los flujos pendientes conservan sus requisitos propios.

### 2.7 Activity types

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| GET | /api/v1/groups/{id}/activity-types | Miembro | Tipos de sistema (group_id NULL: TRAINING, PHYSICAL_PREP, COMPETITION, MEETING) + personalizados del grupo | Vista `v_activity_types` | [P0] |
| POST | /api/v1/groups/{id}/activity-types | ADMIN | Crea tipo personalizado (name único por grupo, color hex) | PostgREST + RLS + UNIQUE parcial | [P0] |
| PATCH | /api/v1/activity-types/{id} | ADMIN | Edita name/color/is_active; los tipos de sistema son inmutables | PostgREST + RLS `group_id IS NOT NULL` | [P0] |

### 2.8 Activities

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| POST | /api/v1/groups/{id}/activities | ADMIN | Crea actividad puntual o recurrente (semanal simple: días de semana + fecha fin); la recurrencia se expande a filas materializadas | RPC `rpc/create_activity` | [P0] |
| GET | /api/v1/groups/{id}/activities | Miembro (GUARDIAN vía pupilo) | Lista/calendario con filtros `from`, `to`, `activity_type_id` | Vista `v_group_activities` | [P0] |
| GET | /api/v1/activities/{id} | Miembro (GUARDIAN vía pupilo) | Detalle de actividad | Vista `v_group_activities` | [P0] |
| PATCH | /api/v1/activities/{id} | ADMIN | Edita una instancia; con `?scope=series` edita las instancias futuras de la serie | RPC `rpc/update_activity` | [P0] |
| DELETE | /api/v1/activities/{id} | ADMIN | Elimina instancia o serie futura (`?scope=series`); bloquea si ya tiene asistencia registrada salvo confirmación explícita | RPC `rpc/delete_activity` | [P0] |

### 2.9 Attendance

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| PUT | /api/v1/activities/{id}/attendance | ADMIN | Toma/edita asistencia **en lote** (upsert transaccional por `(activity_id, membership_id)`): status ∈ {PRESENT, ABSENT, LATE, EXCUSED} + note opcional | RPC `rpc/record_attendance_bulk` | [P0] |
| GET | /api/v1/activities/{id}/attendance | ADMIN (completo con notas) / ATHLETE-GUARDIAN (solo el registro propio/del pupilo) | Asistencia por actividad | Vistas `v_attendance_admin` / `v_attendance_own` | [P0] |
| PATCH | /api/v1/attendance-records/{id} | ADMIN | Edición puntual posterior de un registro (status/note); actualiza recorded_by/recorded_at | RPC `rpc/update_attendance_record` | [P0] |
| GET | /api/v1/groups/{gid}/athletes/{mid}/attendance | ADMIN / el propio ATHLETE / GUARDIAN del pupilo | Historial individual con filtros de período (semana, mes, rango, temporada) | Vista `v_athlete_attendance_history` | [P0] |
| POST | /api/v1/attendance-records/{id}/excuse-requests | ATHLETE / GUARDIAN | Solicitud de justificación con flujo de aprobación | Post-MVP | [P2] |
| POST | /api/v1/activities/{id}/self-checkin | ATHLETE | Autoregistro por QR o geocerca | Post-MVP | [P2] |

### 2.10 Reports

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| GET | /api/v1/groups/{id}/reports/attendance | ADMIN | % de asistencia por deportista, por tipo de actividad y por período (`period=week\|month\|custom\|season`, `from`, `to`) | Vista `v_group_attendance_report` (métrica canónica, §5) | [P0] |
| GET | /api/v1/groups/{id}/reports/attendance/aggregate | ATHLETE / GUARDIAN, **solo si el toggle respectivo del grupo es true** | Estadísticas agregadas: avatar y nombre + % + totales de cada integrante; nada más (regla de visibilidad 5) | Vista `v_group_stats_members` (evalúa el toggle dentro de la vista) | [P0] |
| GET | /api/v1/groups/{gid}/athletes/{mid}/reports | ADMIN / propio / GUARDIAN del pupilo | Reporte individual: %, desglose por estado, indicador de puntualidad (LATE aparte), por período | Vista `v_athlete_attendance_summary` | [P0] |
| GET | /api/v1/groups/{id}/reports/attendance/export?format=csv | ADMIN | Exportación CSV del reporte de grupo | Edge Function `functions/v1/export-report` | [P1] |

### 2.11 Notifications

| Método | Ruta lógica | Rol | Descripción | Implementación | Prioridad |
|---|---|---|---|---|---|
| POST | /api/v1/users/me/push-tokens | Autenticado | Registra token de Expo Notifications del dispositivo | PostgREST `push_tokens` + RLS por owner | [P1] |
| — | (jobs) | Sistema | Recordatorio de actividad a miembros; aviso de ausencia (ABSENT) al apoderado tras el registro | `pg_cron` + Edge Function `functions/v1/send-push` (idempotente) | [P1] |

## 3. Ejemplos de request/response (endpoints núcleo)

Errores en formato uniforme: `{ "error": { "code": "string_estable", "message": "texto en español", "details": {} } }`. Códigos HTTP: 400 validación, 401 sin sesión, 403 sin permiso, 404 no existe **o no visible** (anti-enumeración), 409 conflicto de unicidad, 422 regla de negocio, 429 rate limit.

### 3.1 Login — `POST /api/v1/auth/login` [P0]

```json
// Request
{ "email": "carla.reyes@example.cl", "password": "S3gura!2026" }

// Response 200
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "v1.MRjzXk...",
  "user": {
    "id": "a1b2c3d4-0001-4a2b-9c3d-111111111111",
    "email": "carla.reyes@example.cl",
    "full_name": "Carla Reyes",
    "account_status": "ACTIVE"
  }
}
// 400 credenciales inválidas: mensaje genérico "Email o contraseña incorrectos"
// (no distingue email inexistente de contraseña errada — anti-enumeración)
```

### 3.2 Crear actividad recurrente — `POST /api/v1/groups/{id}/activities` → `rpc/create_activity` [P0]

```json
// Request
{
  "activity_type_id": "b2c3d4e5-0002-4b3c-8d4e-222222222222",
  "title": "Entrenamiento adultos",
  "description": "Cancha 2, traer petos",
  "location": "Estadio Municipal de Ñuñoa",
  "starts_at": "2026-07-07T22:30:00Z",
  "ends_at": "2026-07-08T00:00:00Z",
  "recurrence_rule": { "freq": "WEEKLY", "by_weekday": ["TU", "TH"], "until": "2026-09-30" }
}

// Respuesta de rpc/create_activity — UUID de la primera ocurrencia materializada
"d4e5f6a7-0004-4d5e-8f6a-444444444444"
// 422 { "error": { "code": "invalid_date_range", "message": "ends_at debe ser posterior a starts_at" } }
```

La RPC conserva el retorno UUID de la creación puntual (HU-ADM-08) y agrega `p_recurrence_rule` opcional. La primera ocurrencia tiene `recurrence_source_id = NULL`; las demás la referencian, y todas copian la regla. `v_group_activities` proyecta ambos campos. La expansión usa días y horas de `America/Santiago`, incluye la fecha de término y rechaza toda la transacción si supera 26 semanas/150 ocurrencias o si un horario es inexistente o ambiguo por cambio de hora.

`update_activity` y `delete_activity` reciben `p_group_id`, `p_activity_id` y `p_scope` (`single` por defecto, o `series`), y devuelven la cantidad de filas afectadas. Desde el detalle, `/groups/:groupId/activities/:activityId/edit` permite elegir «solo esta» o «esta y las siguientes». El alcance de serie toma las ocurrencias desde la seleccionada, futuras y sin asistencia: la edición actualiza datos y horarios, conservando fechas y días de cada ocurrencia. Mover una fecha se hace con edición puntual. No reexpande ni cambia los días/fecha final de la regla original.

Eliminar una ocurrencia con asistencia devuelve 409 `attendance_confirmation_required` hasta recibir `p_confirm_attendance = true` tras una confirmación adicional de la UI. El alcance de serie siempre conserva las que tienen asistencia, aunque se envíe esa bandera. Si se elimina la raíz, la primera sobreviviente pasa a ser raíz para que las demás sigan agrupadas. Las escrituras bloquean las actividades antes de evaluar asistencia, compartiendo la serialización con `record_attendance_bulk`.

### 3.3 Tomar asistencia en lote — `PUT /api/v1/activities/{id}/attendance` → `rpc/record_attendance_bulk` [P0]

```json
// Request (upsert transaccional: crea o actualiza según la clave única activity_id + membership_id)
{
  "records": [
    { "membership_id": "f6a7b8c9-0006-4f7a-8b8c-666666666666", "status": "PRESENT" },
    { "membership_id": "a7b8c9d0-0007-4a8b-9c9d-777777777777", "status": "LATE", "note": "Llegó 15 min tarde" },
    { "membership_id": "b8c9d0e1-0008-4b9c-8d0e-888888888888", "status": "EXCUSED", "note": "Certificado médico" }
  ]
}

// Response 200
{
  "activity_id": "d4e5f6a7-0004-4d5e-8f6a-444444444444",
  "recorded_by": "a1b2c3d4-0001-4a2b-9c3d-111111111111",
  "recorded_at": "2026-07-07T23:05:12Z",
  "created": 2,
  "updated": 1,
  "summary": { "PRESENT": 1, "ABSENT": 0, "LATE": 1, "EXCUSED": 1 }
}
// 403 si el solicitante no es ADMIN ACTIVE del grupo de la actividad
// 422 { "error": { "code": "membership_not_athlete_in_group", "message": "El integrante no es deportista de este grupo" } }
```

### 3.4 Reporte de grupo — `GET /api/v1/groups/{id}/reports/attendance?period=month&from=2026-06-01` [P0]

```json
// Response 200 (solo ADMIN; métrica canónica: (PRESENT+LATE)/(convocadas−EXCUSED)×100, 1 decimal)
{
  "group_id": "e5f6a7b8-0005-4e6f-9a7b-555555555555",
  "period": { "type": "month", "from": "2026-06-01", "to": "2026-06-30", "timezone": "America/Santiago" },
  "totals": { "activities": 12, "athletes": 18 },
  "by_athlete": [
    {
      "membership_id": "f6a7b8c9-0006-4f7a-8b8c-666666666666",
      "full_name": "Diego Fuentes",
      "convened": 12, "present": 9, "late": 1, "absent": 1, "excused": 1,
      "attendance_pct": 90.9,
      "late_rate": 10.0
    }
  ],
  "by_activity_type": [
    { "activity_type_id": "b2c3d4e5-...", "name": "Entrenamiento", "activities": 8, "attendance_pct": 87.5 },
    { "activity_type_id": "c9d0e1f2-...", "name": "Competencia", "activities": 4, "attendance_pct": 95.2 }
  ]
}
```

### 3.5 Unirse por código — `POST /api/v1/groups/join` → `rpc/join_group_by_code` [P0]

```json
// Request
{ "invite_code": "ASNV-7K2M" }

// Response 201 — adulto con cuenta: membership ATHLETE ACTIVE
{
  "membership": {
    "id": "c9d0e1f2-0009-4c0d-9e1f-999999999999",
    "group_id": "e5f6a7b8-0005-4e6f-9a7b-555555555555",
    "role": "ATHLETE",
    "status": "ACTIVE",
    "joined_at": "2026-07-03T14:22:40Z"
  },
  "group": { "name": "Club Atlético Ñuñoa", "sport": "Atletismo" }
}

// Response 201 — menor de edad: queda PENDING (requiere apoderado vinculado + confirmación del ADMIN)
{
  "membership": { "id": "...", "role": "ATHLETE", "status": "PENDING" },
  "pending_reason": "minor_requires_guardian_and_admin_approval"
}
// 404 { "error": { "code": "invalid_invite_code", "message": "Código no válido" } } (mismo error si expiró/rotó)
// 409 { "error": { "code": "membership_already_exists", "message": "Ya perteneces a este grupo como deportista" } }
```

## 4. Validaciones por recurso

Los schemas Zod viven en `packages/core` y se comparten entre web [P0], móvil [P1] y Edge Functions; los CHECK/UNIQUE de PostgreSQL son la red de seguridad (ver 04-modelo-de-datos.md).

| Recurso | Validaciones clave |
|---|---|
| users | `email` formato RFC + único (case-insensitive) y nullable solo si `account_status = MANAGED`; `full_name` 2-120 chars; `phone` E.164 opcional (+56...); `birthdate` fecha pasada, edad ≤ 110 años; `account_status` ∈ enum |
| groups | `name` 3-80 chars, `sport` 2-50; `invite_code` único, generado servidor (nunca lo elige el cliente); `settings` JSONB con shape exacto validado (dos booleans, default `false`) |
| memberships | Único `(user_id, group_id, role)`; `role` y `status` ∈ enums; ATHLETE menor de edad no puede quedar ACTIVE sin guardianship activa (trigger); transición de status solo vía RPC |
| guardianships | Único `(guardian_user_id, athlete_user_id)`; `guardian_user_id ≠ athlete_user_id`; pupilo debe ser menor de 18 al crear el vínculo; `relationship` texto 2-40 chars |
| invitations | `token` ≥ 128 bits aleatorios (URL-safe), único; `expires_at` = creación + 7 días; `role` ∈ {ATHLETE, GUARDIAN} (nunca ADMIN por invitación en MVP); email formato válido |
| activity_types | `name` 2-40 chars, único por grupo (case-insensitive); `color` hex `#RRGGBB`; tipos de sistema (`group_id IS NULL`) inmutables desde la API |
| activities | `starts_at < ends_at`; duración ≤ 24 h; `title` 3-120 chars; `activity_type_id` de sistema o del mismo `group_id`; `recurrence_rule`: solo `freq = WEEKLY`, `by_weekday` ⊆ {MO..SU} no vacío, `until` ≤ 26 semanas (~6 meses) desde `starts_at` o máx. 150 instancias, lo que ocurra primero (límite anti-explosión, coherente con 03-modulos-y-flujos.md F5 y 06-arquitectura-y-stack.md); fechas siempre timestamptz UTC |
| attendance_records | Único `(activity_id, membership_id)`; `membership_id` debe ser rol ATHLETE, status ACTIVE, del **mismo grupo** que la actividad (trigger); `status` ∈ enum; `note` ≤ 500 chars; lote ≤ 500 registros por request (coincide con el máx. de 500 memberships ACTIVE por grupo de 06-arquitectura-y-stack.md: un grupo lleno se toma en una sola llamada) |
| reports | `period` ∈ {week, month, custom, season}; en custom `from ≤ to` y rango ≤ 24 meses; los límites de período se interpretan en America/Santiago y se convierten a UTC en la vista |

## 5. Reglas de negocio del backend

Cada regla se implementa en la capa indicada y se prueba en CI (pgTAP para SQL, Vitest para `packages/core`).

| # | Regla | Implementación | Prioridad |
|---|---|---|---|
| R1 | **Menor requiere apoderado**: ATHLETE < 18 años no puede pasar a membership ACTIVE sin al menos una guardianship activa **con consentimiento `DATA_PROCESSING_MINOR` vigente** (fila en `consents` con `revoked_at NULL`, ver 11-legal-seguridad-privacidad.md) | Trigger `BEFORE UPDATE` en memberships + validación de ambas condiciones en `rpc/approve_membership`, `rpc/create_managed_member`, `rpc/join_group_by_code` y `rpc/reactivate_membership` | [P0] |
| R2 | **Solo ADMIN toma y edita asistencia** (COACH es [P2]) | `rpc/record_attendance_bulk` y `rpc/update_attendance_record` verifican membership ADMIN ACTIVE en el grupo de la actividad; RLS niega INSERT/UPDATE directo a attendance_records | [P0] |
| R3 | **Unicidad de asistencia** por `(activity_id, membership_id)`: tomar dos veces = upsert, nunca duplicado | UNIQUE compuesto + `INSERT ... ON CONFLICT DO UPDATE` en la RPC | [P0] |
| R4 | **Métrica canónica**: `(PRESENT + LATE) / (convocadas − EXCUSED) × 100`, redondeo a 1 decimal; denominador 0 → `attendance_pct: null` (no 0%) | Vista SQL `v_group_attendance_report` y función en `packages/core`, testeadas contra los **mismos casos canónicos** | [P0] |
| R5 | **Último ADMIN no puede salir ni desactivarse**: el grupo debe tener siempre ≥ 1 ADMIN ACTIVE. La misma RPC rechaza la auto-desactivación de un ATHLETE menor de edad (422 `minor_cannot_leave`, nota C8 de 02-roles-y-permisos.md) y de un GUARDIAN con pupilos vigentes en el grupo (422 `guardian_has_active_wards`) | `rpc/deactivate_membership` cuenta ADMIN ACTIVE con lock (`FOR UPDATE`) y rechaza con HTTP 409, código `LAST_ADMIN` (alineado con CB-05 de 02-roles-y-permisos.md) | [P0] |
| R6 | **Scoping por grupo**: nadie lee ni escribe datos de grupos donde no tiene membership ACTIVE | RLS en todas las tablas con `group_id` usando helpers `SECURITY DEFINER` `is_member()`, `is_group_admin()`, `is_guardian_of()` | [P0] |
| R7 | **Convocatoria**: una actividad cuenta como convocada para un deportista **solo si existe una fila en `attendance_records` para su membership** en esa actividad (equivalencia operativa: denominador = PRESENT + LATE + ABSENT). Las actividades del grupo sin registro de asistencia no entran en numerador ni denominador de ninguna métrica. Filtros adicionales: solo actividades con `starts_at <= now()` y `starts_at >= joined_at` de la membership (ver 08-reportes-y-estadisticas.md, sección 1) | Lógica en `v_group_attendance_report`; documentada en 08-reportes-y-estadisticas.md | [P0] |
| R8 | **Registro anticipado permitido**: `rpc/record_attendance_bulk` acepta registros de una actividad aún no iniciada (la UI muestra un banner de advertencia, ver 05-pantallas.md ASI-01); las actividades con `starts_at > now()` se excluyen de numerador y denominador de todas las métricas hasta que comiencen (ver 08-reportes-y-estadisticas.md, sección 1) | `rpc/record_attendance_bulk` sin bloqueo por fecha; exclusión temporal en las vistas de reportes | [P0] |
| R9 | **GUARDIAN solo de menores**: al cumplir 18 el pupilo, job diario marca la guardianship inactiva y notifica; el ex-pupilo pasa a gestionar su cuenta | `pg_cron` (00:30 America/Santiago, alineado con 02-roles-y-permisos.md §3.4) → Edge Function idempotente `guardianship-majority` | [P0] |
| R10 | **Incorporación por código solo ATHLETE**; GUARDIAN solo por invitación dirigida o registro directo del ADMIN | `rpc/join_group_by_code` fija `role = 'ATHLETE'` sin parámetro de rol | [P0] |
| R11 | **Claim MANAGED → ACTIVE**: solo vía invitación por email; si el perfil es de un menor, requiere consentimiento registrado del apoderado (timestamp + guardian_user_id) antes de activar credenciales | Edge Function `accept-invitation`, transaccional; detalle en 11-legal-seguridad-privacidad.md | [P0] |
| R12 | **Expiración de invitaciones**: PENDING → EXPIRED pasado `expires_at` (7 días); un token EXPIRED o ACCEPTED nunca se reutiliza | `pg_cron` diario + check en `accept-invitation` | [P0] |
| R13 | **Edición de serie recurrente**: `scope=series` afecta solo instancias futuras (>= now) sin asistencia registrada; las pasadas son inmutables salvo edición puntual | `rpc/update_activity` / `rpc/delete_activity` | [P0] |
| R14 | **Tipos de sistema inmutables**: TRAINING, PHYSICAL_PREP, COMPETITION, MEETING no se editan ni desactivan por grupo | RLS: UPDATE solo donde `group_id IS NOT NULL` | [P0] |
| R15 | **Aviso de ausencia al apoderado**: registrar ABSENT de un pupilo encola push al GUARDIAN | Trigger → cola → Edge Function `send-push` | [P1] |

## 6. Autenticación, autorización y permisos

### 6.1 Autenticación (JWT access + refresh) [P0]

- Supabase Auth emite **access token JWT** (vida 1 hora, firma verificada por PostgREST en cada request) y **refresh token** de un solo uso con rotación automática (detección de reutilización → revocación de la familia de tokens).
- El JWT viaja en `Authorization: Bearer`; en el cliente web se gestiona con `@supabase/ssr` (cookies `HttpOnly`, `Secure`, `SameSite=Lax`), nunca en `localStorage`.
- `auth.uid()` del JWT se traduce a `public.users.id` con la función helper `auth_user_id()` (por el desacople para cuentas MANAGED, ver 06-arquitectura-y-stack.md).

### 6.2 Guard de membership por group_id [P0]

Toda política RLS de tablas con `group_id` se apoya en tres helpers `SECURITY DEFINER` con `search_path` fijado:

- `is_member(p_group_id uuid) → bool`: membership ACTIVE de cualquier rol.
- `is_group_admin(p_group_id uuid) → bool`: membership ADMIN ACTIVE.
- `is_guardian_of(p_athlete_user_id uuid) → bool`: guardianship activa hacia el pupilo.

Las RPC repiten la verificación al inicio (defensa en profundidad: RLS + check explícito), porque varias son `SECURITY DEFINER` para operar sobre tablas protegidas.

### 6.3 Matriz rol → operación (resumen) [P0]

| Operación | ADMIN | ATHLETE | GUARDIAN |
|---|---|---|---|
| Crear/editar grupo, settings, rotar invite_code | Sí | No | No |
| Gestionar memberships, invitaciones, guardianships | Sí | Salir del grupo (si es adulto; los menores solo vía ADMIN) | Salir del grupo solo si no tiene pupilos con membership ATHLETE ACTIVE o PENDING en él (preserva la regla de visibilidad V2) |
| CRUD actividades y tipos personalizados | Sí | No | No |
| Ver actividades del grupo | Sí | Sí | Sí (grupos del pupilo) |
| Tomar/editar asistencia | Sí | No | No |
| Ver asistencia por actividad | Todos + notas | Solo la propia | Solo la del pupilo |
| Historial y % individual | Cualquier deportista del grupo | El propio | El del pupilo |
| Reporte agregado del grupo | Sí | Solo si `athletes_can_view_group_stats = true` | Solo si `guardians_can_view_group_stats = true` |
| Exportar CSV [P1] | Sí | No | No |

### 6.4 Filtrado de campos por rol (regla de visibilidad 5) [P0]

Nunca se sirve `SELECT *` de `users` a no-ADMIN. Vistas con columnas explícitas:

| Vista | Consumidor | Columnas de terceros expuestas |
|---|---|---|
| `v_group_members_basic` | ATHLETE / GUARDIAN | `full_name`, `role`, `avatar_url` — **jamás** email, phone, birthdate, notas, datos de apoderados |
| `v_group_stats_members` | ATHLETE / GUARDIAN con toggle activo | `full_name`, `avatar_url` + métricas agregadas (`attendance_pct`, totales por estado) — misma exposición que `v_group_members_basic` (ver 08-reportes-y-estadisticas.md §3.2) |
| `v_group_members_admin` | ADMIN del grupo | Perfil completo + estado de membership + apoderados vinculados |
| `v_attendance_own` | ATHLETE / GUARDIAN | Solo registros propios o del pupilo, con su propia `note` |

Los toggles `athletes_can_view_group_stats` / `guardians_can_view_group_stats` se evalúan **dentro de la vista** (join a `groups.settings`), no en el cliente: si el toggle está en false la vista retorna cero filas para ese rol.

## 7. Seguridad

### 7.1 OWASP Top 10 aplicado a Asisteam [P0]

| Riesgo OWASP | Mitigación en el proyecto |
|---|---|
| A01 Broken Access Control | RLS deny-by-default en todas las tablas (`ENABLE ROW LEVEL SECURITY` + sin política = sin acceso); pgTAP con seeds por rol en CI prueba cada política; anon key solo permite auth y RPC públicas |
| A02 Cryptographic Failures | TLS 1.2+ extremo a extremo; contraseñas con **bcrypt** (Supabase Auth, factor de costo por defecto ≥ 10); tokens de invitación y recovery aleatorios ≥ 128 bits; buckets de Storage privados con URLs firmadas de corta vida |
| A03 Injection | PostgREST parametriza todo; en PL/pgSQL prohibido `EXECUTE` con concatenación (lint en CI); Zod valida shape y tipos antes de tocar la base |
| A04 Insecure Design | Convención "write no trivial = RPC/Edge Function" concentra las invariantes; triggers + constraints como red final; revisión de diseño obligatoria para flujos con menores (R1, R11) |
| A05 Security Misconfiguration | `service_role` key solo en Edge Functions (jamás en clientes ni en variables `NEXT_PUBLIC_*`); helpers `SECURITY DEFINER` con `search_path` fijo; secretos en Vercel/Supabase env, no en el repo |
| A06 Vulnerable Components | Dependabot + `pnpm audit` en CI; actualización mensual de Postgres/extensiones vía Supabase |
| A07 Auth Failures | Rotación de refresh tokens con detección de reutilización; rate limiting de login (§7.2); mensajes de error genéricos; expiración de sesión configurada |
| A08 Data Integrity Failures | CI con revisión obligatoria (PR + checks) para migraciones SQL; Edge Functions desplegadas solo desde GitHub Actions |
| A09 Logging Failures | Sentry en web y Edge Functions; log de `recorded_by`/`recorded_at` en asistencia y de actor en RPCs sensibles (auditoría completa es [P2]) |
| A10 SSRF | Edge Functions no hacen fetch de URLs provistas por usuarios; avatares/logos se suben a Storage, nunca se descargan de URLs externas |

### 7.2 Rate limiting [P0]

| Superficie | Límite | Capa |
|---|---|---|
| Login / password recovery | Límites nativos de Supabase Auth (por IP y por email) + captcha (Turnstile) si supera umbral | Supabase Auth |
| `rpc/join_group_by_code` y `preview_invite_code` | 10 intentos / 15 min por usuario (anti fuerza bruta del código; formato `XXXX-XXXX` ≈ 32^8 combinaciones) | Tabla de intentos + check en la RPC |
| `accept-invitation` | 10 intentos / hora por IP | Edge Function |
| Envío de invitaciones por email | 50 / día por grupo (anti-spam con Resend) | Edge Function |
| API general | Límites del plan Supabase + WAF/protección DDoS de Vercel y Supabase | Plataforma |

### 7.3 Tokens, expiración y anti-enumeración [P0]

- Access token: 1 h. Refresh token: rotación en cada uso, revocable por sesión (`logout`).
- Tokens de invitación: expiran a los **7 días** (R12), un solo uso, se comparan en tiempo constante y se almacenan hasheados (SHA-256) — el valor plano solo viaja en el email.
- Recovery de contraseña: link válido 1 h, un solo uso.
- **Configuración HU-GEN-03:** en local, `supabase/config.toml` fija `auth.email.otp_expiry = 3600` y carga `supabase/templates/recovery.html`. En cada proyecto de Supabase Cloud, configurar Email OTP Expiration en **3600 segundos**, Site URL con el origen web del entorno y copiar esa plantilla en Auth → Email Templates → Reset Password; el archivo local no configura Cloud. El correo apunta a `/reset-password?token={{ .TokenHash }}`. La Server Action valida `type: recovery` al enviar la nueva contraseña, llama a `updateUser` y cierra la sesión efímera. Abrir el enlace no lo consume y el flujo funciona desde otro navegador. Si Auth rechaza la contraseña después de validar el token, se debe solicitar un nuevo enlace.
- **Anti-enumeración**: `password-recovery` responde 200 siempre; login no distingue email inexistente de contraseña incorrecta; `invitations` no revela si un email ya tiene cuenta; recursos no visibles retornan 404 (no 403) para no confirmar existencia; `preview_invite_code` solo expone name/sport/logo del grupo.

Verificación local de HU-GEN-03: iniciar `pnpm exec supabase start` y ejecutar `pnpm --filter @asisteam/web test:integration`. La suite crea y limpia cuentas sintéticas ACTIVE/INVITED, comprueba el correo en Mailpit, el cambio de contraseña, la invalidación del enlace y su vencimiento después de 60 minutos. Solo acepta endpoints locales; usa acceso administrativo exclusivamente para preparar y limpiar los fixtures. Las pruebas unitarias de schemas y Server Actions se ejecutan con `pnpm test`.

**Aceptación HU-GEN-06 (#18):** el enlace dirigido apunta a `/invitations/{token}`. La pantalla permite crear credenciales sobre el perfil INVITED existente o iniciar sesión y aceptar. El preview no revela email ni existencia de cuenta. Un enlace vencido persiste `EXPIRED` y muestra la indicación de solicitar otro al ADMIN; la emisión y el reenvío corresponden a sus historias de administración.

La Edge Function `accept-invitation` recibe las acciones `preview`, `register` y `accept`. La última valida el JWT con Auth y vincula exclusivamente al destinatario. Para el registro, Edge prepara una autorización aleatoria de un uso (2 minutos, solo `service_role`), vinculada al token, email y datos validados. GoTrue crea las credenciales y el trigger consume esa autorización: perfil, membresía e invitación se actualizan en la misma transacción de Auth. Un fallo revierte las credenciales; Edge elimina también la autorización efímera. El token almacenado es SHA-256 y nunca sale hacia clientes. Los menores requieren consentimiento vigente antes de habilitar credenciales; para reclamar MANAGED también se exige `ACCOUNT_ACTIVATION_MINOR`. Una cuenta ya ACTIVE sin el consentimiento necesario solo obtiene membership PENDING.

**Configuración del entorno:** definir el mismo `INVITATION_PROXY_SECRET` aleatorio (32 bytes o más) en el servidor Next.js y en los secretos de la Edge Function. No usar prefijo `NEXT_PUBLIC_` ni reutilizar `service_role`. Next.js autentica sus peticiones de proxy con este secreto sobre TLS y reenvía la IP del navegador; Edge la hashea y aplica 10 intentos de aceptación por hora, con una ventana independiente para preview. [Vercel sobrescribe `X-Forwarded-For` para evitar suplantación](https://vercel.com/docs/headers/request-headers#x-forwarded-for) y debe ser el punto de entrada; en otro hosting, su proxy debe sobrescribir `X-Forwarded-For` con la IP real. La Edge rechaza llamadas sin este secreto. `INVITATION_ALLOWED_ORIGINS` admite una lista separada por comas y por defecto permite producción y staging. Desplegar `accept-invitation` con verificación JWT de gateway deshabilitada (declarada en `supabase/config.toml`): la autenticación se realiza dentro de la función.

**Verificación local de HU-GEN-06:** aplicar migraciones con `pnpm exec supabase migration up --local`; preparar un archivo de entorno local, fuera del repositorio, con `INVITATION_PROXY_SECRET`; ejecutar `pnpm exec supabase functions serve accept-invitation --env-file <archivo>`. Con el mismo secreto exportado en el shell, correr `pnpm --filter @asisteam/web test:invitations`. La suite solo admite Supabase local, prepara y elimina fixtures sintéticos, y prueba Auth real, expiración, aislamiento, aceptación concurrente, limpieza de autorizaciones y rate limit. `pnpm exec supabase test db` cubre RLS, consentimientos y replay; `pnpm test` cubre schemas y Server Actions.

**Emisión HU-ADM-04 (#23):** INT-04 (`/groups/:groupId/invitations/new`) permite al ADMIN enviar por email como ATHLETE/GUARDIAN, consultar estado y expiración con paginación de 50 filas, y reenviar invitaciones PENDING. La Server Action transmite el JWT de la sesión SSR; `send-invitation` lo valida con Auth y llama a `issue_invitation`, RPC exclusiva de `service_role` que repite autorización por grupo. La emisión crea un perfil INVITED sin credenciales ni membresía si el email no existe; un perfil existente se reutiliza sin modificarlo. La respuesta al navegador solo contiene ID, estado y expiración de la invitación y no revela la existencia de la cuenta.

El reenvío marca la fila previa EXPIRED y crea otra PENDING en la misma transacción, conservando el histórico y rechazando tanto el token anterior como cualquier autorización de registro ligada a él. La nueva vigencia es creación + 7 días; solamente se almacena SHA-256 de 32 bytes aleatorios. El contador privado de SQL serializa los intentos de envío por grupo, incluyendo reenvíos, y admite 50 por día calendario de `America/Santiago`. Los fallos del proveedor también consumen cuota para evitar reintentos sin límite. Resend y Postgres no comparten una transacción: si el proveedor falla o no confirma la respuesta, se devuelve `503 email_delivery_failed`; la invitación permanece PENDING y el ADMIN puede reenviarla desde el listado. No se anuncia éxito en ese caso.

**Configuración de emisión:** definir en los secretos de `send-invitation` `RESEND_API_KEY`, `INVITATION_EMAIL_FROM` (remitente de un dominio verificado en Resend), `INVITATION_WEB_URL` (origen web HTTPS del entorno, sin path) y `INVITATION_ALLOWED_ORIGINS` si difiere de producción/staging. Ningún secreto de Resend ni `service_role` se configura en Next.js. El enlace apunta a `/invitations/{token}` y utiliza el flujo de aceptación existente. Desplegar `send-invitation` con `verify_jwt = false` tal como declara `supabase/config.toml`; el JWT se verifica dentro de la función. La integración utiliza [POST /emails de Resend](https://resend.com/docs/api-reference/emails/send-email) con una clave de idempotencia por emisión.

**Verificación local de emisión:** aplicar migraciones, ejecutar `pnpm exec supabase test db`, `pnpm test`, `pnpm typecheck`, `pnpm build` y `pnpm --filter @asisteam/web test:send-invitations`. Esta última suite ejecuta el handler real con Auth, PostgREST y Postgres locales; únicamente reemplaza el transporte de Resend por un receptor en memoria, sin correos externos ni claves reales. Comprueba alta INVITED, registro GoTrue con el token emitido, reenvío, concurrencia, permisos y recuperación del fallo de correo. El contrato HTTP, CORS y proyecciones se cubren además en pruebas unitarias. Para servir Edge localmente, usar `pnpm exec supabase functions serve send-invitation --env-file <archivo-local>` con secretos fuera del repositorio.

### 7.4 CORS y cabeceras [P0]

- CORS restringido por allowlist a los orígenes de producción y staging (`https://app.asisteam.cl`, `https://staging.asisteam.cl`) en Edge Functions; la app móvil [P1] no usa CORS (requests nativas con Bearer).
- Next.js sirve `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` (HSTS) vía middleware.

### 7.5 Privacidad por diseño en los payloads [P0]

- **Minimización**: cada vista/RPC proyecta el mínimo de columnas para su caso de uso (§6.4); los payloads de reportes agregados contienen solo `full_name` + métricas, sin ids de usuario global cuando basta `membership_id`.
- **Datos de menores**: birthdate de terceros jamás sale a no-ADMIN; el flag derivado `is_minor` (boolean) se expone al ADMIN en `v_group_members_admin` para la UI sin repetir la fecha exacta donde no es necesaria.
- **Notas de asistencia**: visibles solo para ADMIN del grupo y para el titular (o su GUARDIAN); nunca en reportes agregados ni en `v_group_stats_members`.
- **Logs y Sentry**: scrubbing de PII (email, phone, tokens) en eventos; los logs de Edge Functions registran ids, no datos personales.
- **Residencia de datos**: sa-east-1 (Brasil), declarada en la política de privacidad conforme a Ley 19.628 / Ley 21.719 (ver 11-legal-seguridad-privacidad.md).

## 8. Versionado y evolución

- El prefijo lógico `/api/v1/` se materializa como convención de nombres estable: las vistas y RPC del contrato no cambian firma sin migración compatible; breaking changes introducen `_v2` y período de convivencia (relevante para la app móvil [P1], que no se actualiza instantáneamente).
- Tipos TypeScript regenerados con `supabase gen types` en cada migración y publicados en `packages/core`; el CI falla si el contrato y los tipos divergen.
- Ruta de salida documentada: si el producto supera al BaaS, la capa PostgREST/Auth se reemplaza por un backend NestJS (propuesta B) manteniendo esquema SQL, RPCs y `packages/core` (ver 06-arquitectura-y-stack.md).
