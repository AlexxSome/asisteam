# Pantallas web y móvil

**Proyecto:** Asisteam · **Corte verificado:** 05-10-2026 · **Base:** `48d404ab96cecd1d6ddb109616e91ed0fcabce8b` (`develop`) · **Reconciliación:** [#121](https://github.com/AlexxSome/asisteam/issues/121), dependiente de [#102](https://github.com/AlexxSome/asisteam/issues/102) entregado en [PR #123](https://github.com/AlexxSome/asisteam/pull/123).

Este documento separa disponibilidad en el repositorio y objetivos de producto. La autorización se define en [02-roles-y-permisos.md](02-roles-y-permisos.md); el inventario no concede permisos. Los códigos `AUT-01`, `ASI-01`, etc. se conservan para las referencias de [módulos](03-modulos-y-flujos.md) e [historias](10-historias-de-usuario.md). Un código puede representar varias rutas o una sección dentro de otra pantalla.

El [diseño original completo](https://github.com/AlexxSome/asisteam/blob/48d404ab96cecd1d6ddb109616e91ed0fcabce8b/docs/05-pantallas.md) conserva las propuestas de interacción y prioridades por plataforma como histórico. Las brechas de este corte no cancelan requisitos: cualquier cambio de producto requiere una decisión trazada.

## 1. Convenciones

- **Implementado:** existe código enlazado en la base del corte; no implica despliegue, proveedor configurado ni QA completa del flujo.
- **Integrado/parcial:** el código lógico se atiende en una sección o comparte ruta; se explicitan las partes ausentes.
- **Ruta lógica/objetivo UX:** dirección o interacción del plan original sin página equivalente; no se presenta como enlace operativo.
- **Diferido o sin evidencia:** requiere planificación/ratificación, no una implementación deducida de un issue cerrado.
- **Prioridad:** [P0]/[P1]/[P2] conserva el roadmap original. COACH, billing SaaS, anuncios, QR web y OAuth son [P2] ya autorizados; no se degradan ni se amplían por esta reconciliación.
- **Parámetros:** la tabla usa `[groupId]`, `[activityId]`, `[athleteUserId]` y `[token]` como el App Router; equivalen a `:groupId`, etc. en contratos lógicos. No son URLs que se abran sin valores autorizados.
- **Plataforma:** web responsive implementada; no hay cliente móvil implementado en el corte verificado. La planificación vigente desde 2026-10-05 define apps nativas Java/Android y Swift/iOS [P1]. Offline [P2] fue pospuesto explícitamente en #54 y sigue diferido.

## 2. Inventario de páginas reales

**39 archivos `page.tsx`** identificados en el grafo de graphify actualizado a la base del corte, cada uno enlazado abajo. Incluyen la entrada de redirección `/` y el aviso legal. La auditoría inicial sobre `d7dff870f2b2` tenía **37**; [#107](https://github.com/AlexxSome/asisteam/issues/107) añadió `/accept-terms` y `/legal/2026-09-21`. No se cuentan layouts, estados especiales, componentes, hashes, query strings ni handlers como páginas nuevas.

| Ruta real / archivo | Código de pantalla | Audiencia efectiva | Implementación y límite |
|---|---|---|---|
| [`/`](../apps/web/src/app/page.tsx) | GRP-01 / ONB-01 | Sesión | Redirección al grupo válido recordado, único grupo, selector o bienvenida. |
| [`/login`](../apps/web/src/app/login/page.tsx) | AUT-01 / AUT-07 | Público | Email y proveedores Google/Apple disponibles según configuración. |
| [`/register`](../apps/web/src/app/register/page.tsx) | AUT-02 / AUT-07 | Público | Registro con aceptación informada y contexto de código. |
| [`/forgot-password`](../apps/web/src/app/forgot-password/page.tsx) | AUT-03 | Público | Recuperación por email; conserva contexto de invitación. |
| [`/reset-password`](../apps/web/src/app/reset-password/page.tsx) | AUT-04 | Recuperación | Recibe `?token=`; la acción verifica el token de recuperación en un cliente transitorio y limpia la URL tras guardar. |
| [`/invitations/[token]`](../apps/web/src/app/invitations/%5Btoken%5D/page.tsx) | AUT-05 / AUT-06 | Destinatario | Aceptación o activación MANAGED, según la invitación validada. |
| [`/accept-terms`](../apps/web/src/app/accept-terms/page.tsx) | AUT-02 / AUT-07, continuación | Sesión | Aceptación pendiente antes de continuar; página añadida por #107. |
| [`/legal/2026-09-21`](../apps/web/src/app/legal/2026-09-21/page.tsx) | AUT-02 / CFG-03, aviso | Público | Archivo del aviso versionado; leerlo no registra consentimiento (#107). |
| [`/welcome`](../apps/web/src/app/welcome/page.tsx) | ONB-01 / ONB-03 | Sin grupos activos | Crear/unirse, suscripción explicada y solicitudes pendientes. |
| [`/join`](../apps/web/src/app/join/page.tsx) | ONB-02 / ONB-03 | Sesión | Código incorpora ATHLETE; muestra progreso pendiente del menor. |
| [`/groups`](../apps/web/src/app/groups/page.tsx) | GRP-01 / ACT-01 global | Sesión | Selector de grupos y agenda global en #agenda. |
| [`/groups/new`](../apps/web/src/app/groups/new/page.tsx) | ONB-04 | Sesión | Formulario de alta del grupo y contexto del primer pago. |
| [`/groups/[groupId]`](../apps/web/src/app/groups/%5BgroupId%5D/page.tsx) | GRP-02 | Miembro del grupo | Inicio por roles, próxima actividad, pendientes y datos propios/pupilos. |
| [`/groups/[groupId]/settings`](../apps/web/src/app/groups/%5BgroupId%5D/settings/page.tsx) | GRP-03 / INT-05 | ADMIN | Datos, código/enlace y regeneración; guardado explícito de datos. |
| [`/groups/[groupId]/settings/visibility`](../apps/web/src/app/groups/%5BgroupId%5D/settings/visibility/page.tsx) | GRP-04 | ADMIN | Toggles independientes con guardado inmediato y vista previa. |
| [`/groups/[groupId]/activity-types`](../apps/web/src/app/groups/%5BgroupId%5D/activity-types/page.tsx) | GRP-05 | ADMIN | Crear/editar/desactivar tipos propios; sistema inmutable. |
| [`/groups/[groupId]/members`](../apps/web/src/app/groups/%5BgroupId%5D/members/page.tsx) | INT-01 | ADMIN | Búsqueda y filtros por rol/estado, acciones por fila; no detalle dedicado. |
| [`/groups/[groupId]/members/new`](../apps/web/src/app/groups/%5BgroupId%5D/members/new/page.tsx) | INT-03 | ADMIN | Alta MANAGED; menor pendiente hasta consentimiento efectivo. |
| [`/groups/[groupId]/members/pending`](../apps/web/src/app/groups/%5BgroupId%5D/members/pending/page.tsx) | INT-06 | ADMIN | Progreso de incorporación, vínculo, consentimiento y aprobación. |
| [`/groups/[groupId]/members/consent`](../apps/web/src/app/groups/%5BgroupId%5D/members/consent/page.tsx) | APO-04 / AUT-06, consentimiento | GUARDIAN del pupilo | Tratamiento de datos y activación de cuenta separados; no es gestión ADMIN. |
| [`/groups/[groupId]/invitations/new`](../apps/web/src/app/groups/%5BgroupId%5D/invitations/new/page.tsx) | INT-04 | ADMIN | Nueva invitación e historial mediante ?view=history, con reenvío. |
| [`/groups/[groupId]/guardians`](../apps/web/src/app/groups/%5BgroupId%5D/guardians/page.tsx) | APO-01 / APO-02 parcial | ADMIN | Registrar/vincular apoderado a menor elegido; no directorio completo de apoderados. |
| [`/wards`](../apps/web/src/app/wards/page.tsx) | APO-03 | GUARDIAN | Pupilos, grupos, actividad, métricas y tareas de consentimiento. |
| [`/wards/[athleteUserId]`](../apps/web/src/app/wards/%5BathleteUserId%5D/page.tsx) | APO-04 | GUARDIAN vigente | Grupos y agenda del pupilo; entradas a historial/consentimiento por grupo. |
| [`/groups/[groupId]/activities`](../apps/web/src/app/groups/%5BgroupId%5D/activities/page.tsx) | ACT-01 | Miembro del grupo | Agenda próximas/pasadas y paginación; no calendario mensual interactivo. |
| [`/groups/[groupId]/activities/new`](../apps/web/src/app/groups/%5BgroupId%5D/activities/new/page.tsx) | ACT-03 | ADMIN | Creación simple o recurrencia semanal. |
| [`/groups/[groupId]/activities/[activityId]`](../apps/web/src/app/groups/%5BgroupId%5D/activities/%5BactivityId%5D/page.tsx) | ACT-02 | Miembro del grupo | Datos, retorno a agenda y acciones según rol; consulta de asistencia mediante historial. |
| [`/groups/[groupId]/activities/[activityId]/edit`](../apps/web/src/app/groups/%5BgroupId%5D/activities/%5BactivityId%5D/edit/page.tsx) | ACT-03 / ACT-04 | ADMIN | Edición y alcance de serie; preserva ocurrencias con asistencia. |
| [`/groups/[groupId]/activities/[activityId]/attendance`](../apps/web/src/app/groups/%5BgroupId%5D/activities/%5BactivityId%5D/attendance/page.tsx) | ASI-01 | ADMIN / COACH | Estados y guardado por fila; notas/desmarcado solo ADMIN. |
| [`/me/history`](../apps/web/src/app/me/history/page.tsx) | PRF-02 / ASI-02 | ATHLETE | Selector de grupo o redirección si solo hay uno; vacío sin membership ATHLETE. |
| [`/groups/[groupId]/me/history`](../apps/web/src/app/groups/%5BgroupId%5D/me/history/page.tsx) | PRF-02 / ASI-02 | ATHLETE propio | Historial individual con filtros y resumen. |
| [`/groups/[groupId]/wards/[athleteUserId]/history`](../apps/web/src/app/groups/%5BgroupId%5D/wards/%5BathleteUserId%5D/history/page.tsx) | ASI-02 / APO-04 | GUARDIAN vigente | Historial del pupilo activo en ese grupo. |
| [`/groups/[groupId]/reports`](../apps/web/src/app/groups/%5BgroupId%5D/reports/page.tsx) | REP-01 / REP-02 | Por permisos | ADMIN/COACH: reporte autorizado; ATHLETE/GUARDIAN: propios/pupilos y agregados según toggles. |
| [`/profile`](../apps/web/src/app/profile/page.tsx) | PRF-01 / CFG-01 / CFG-03 | Sesión | Datos/foto, corrección de edad, cuenta y privacidad por soporte. |
| [`/profile/birthdate-requests`](../apps/web/src/app/profile/birthdate-requests/page.tsx) | PRF-01, revisión | ADMIN revisor | Solicitudes de corrección de edad de sus grupos, limitadas por RPC. |
| [`/groups/[groupId]/billing`](../apps/web/src/app/groups/%5BgroupId%5D/billing/page.tsx) | Extensión #56 (sin código histórico) | ADMIN | Plan, checkout, capacidad e historial de cobros del club. |
| [`/groups/[groupId]/announcements`](../apps/web/src/app/groups/%5BgroupId%5D/announcements/page.tsx) | Extensión #57 (sin código histórico) | Miembro; edición ADMIN | Muro, publicación/edición y preferencia de avisos; no mensajería. |
| [`/groups/[groupId]/activities/[activityId]/qr`](../apps/web/src/app/groups/%5BgroupId%5D/activities/%5BactivityId%5D/qr/page.tsx) | ASI-04, emisión | ADMIN | QR temporal y ajustes plegables para todo el grupo. |
| [`/check-in`](../apps/web/src/app/check-in/page.tsx) | ASI-04, llegada | ATHLETE propio | Lectura de fragmento QR, login si falta sesión y registro propio. |

El resto de rutas no es una pantalla independiente: [`/auth/callback`](../apps/web/src/app/auth/callback/route.ts) es el handler de autenticación y [`/profile/avatar/[ownerId]/[fileName]`](../apps/web/src/app/profile/avatar/%5BownerId%5D/%5BfileName%5D/route.ts) entrega imágenes autorizadas. `error.tsx`, `not-found.tsx` y los estados compartidos se documentan en el [sistema visual](12-sistema-visual.md#contratos-de-componentes-y-estados--corte-05-10-2026).

### 2.1 Códigos lógicos sin página propia y brechas

| Código / prioridad original | Ruta o propuesta original | Estado comprobado al corte |
|---|---|---|
| AUT-06 [P0] | Activación MANAGED separada | Integrada en `/invitations/[token]`; consentimiento del apoderado en `/groups/[groupId]/members/consent`. |
| AUT-07 [P2 autorizado] | Login Google/Apple | Integrado en acceso/registro; controles dependen de configuración de proveedores (#59). |
| ONB-03 [P0] | Pantalla de espera del menor | Integrada en `/welcome` y `/join`; progreso con responsables, sin acceso al grupo mientras esté pendiente. |
| ONB-04 [P0] | Wizard de datos → visibilidad → invitaciones | Existe formulario de grupo y guía de siguientes pasos; no es un wizard de tres páginas. |
| GRP-05 [P0] | `/groups/:groupId/settings/activity-types` | Ruta lógica antigua; la real es `/groups/[groupId]/activity-types`. |
| INT-02 [P0] | `/groups/:groupId/members/:membershipId` | **Sin página**. Acciones existentes en la nómina no equivalen al detalle de perfil/apoderados/resumen previsto. |
| INT-05 [P0] | Compartir código/enlace y QR de invitación | Código/enlace integrado en Configuración; el QR de asistencia ASI-04 no demuestra un QR de invitación al grupo. |
| APO-01 / APO-02 [P0] | Directorio de apoderados y vincular/desvincular | `/guardians` registra/vincula buscando al menor; no acredita el directorio ni la desvinculación completa descritos en el plan. |
| ACT-04 [P0] | Diálogo de edición de serie | Integrado en `/activities/[activityId]/edit`; no una ruta nueva. |
| ASI-02 [P0] | `/groups/:groupId/members/:membershipId/history` ADMIN | **Sin página**. Existen historial propio y de pupilo; la tabla ADMIN no enlaza un historial individual dedicado. |
| ASI-03 [P2] | Solicitar/aprobar justificación | Sin UI identificada. Elegir EXCUSED en asistencia no es el flujo de solicitud/aprobación (#52/#53). |
| ASI-04 [P2 autorizado] | QR/geocerca originalmente móvil | QR entregado en web (#58); geocerca excluida expresamente. |
| ASI-05 [P2] | Asistencia offline móvil | Pospuesto por decisión registrada en #54; rollback y reintento de red no son cola offline. |
| REP-02 [P0] | `/groups/:groupId/stats` | Integrada en `/groups/[groupId]/reports`; no existe `/stats`. |
| REP-03 [P1] | Botón Exportar CSV en REP-01 | Sin control/descarga identificados; discrepancia de #36 registrada en §7. |
| REP-04 [P2] | Ranking gamificado | Sin pantalla identificada; no se deduce de ordenar métricas. |
| CFG-01 [P0] | `/settings/account`, contraseña y cerrar todas las sesiones | Cuenta dentro de `/profile`; contraseña vía recuperación; «Mi cuenta» cierra **este dispositivo**, no todas las sesiones. |
| CFG-02 [P1] | `/settings/notifications`, recordatorio/ausencia | Sin página. La preferencia de anuncios en el muro pertenece a #57 y no implementa #44/#50. |
| CFG-03 [P0] | `/settings/privacy` | Integrada en `/profile#privacy`: solicitudes por correo a soporte; no descarga, supresión ni revocación automáticas. |
| PRF-02 [P0] | `/me/history` | Selector/redirección al historial por grupo; nunca un porcentaje global. |

Las brechas P0 anteriores se documentan para decisión del responsable dentro de la épica #100; no se marca el MVP completo ni se crean rutas para hacer coincidir el código con el plan.

## 3. Navegación implementada por rol

La entrada [`groupHomePath()`](../apps/web/src/lib/groups.ts) lleva a `/welcome` si no hay grupos ACTIVE; restaura un grupo recordado aún autorizado, usa el único grupo o abre `/groups` si hay varios. GUARDIAN no redirige automáticamente a `/wards` por el mero rol: esa vista se alcanza desde la navegación.

| Contexto | Recorrido implementado |
|---|---|
| ADMIN | Inicio del grupo → Actividades → Detalle → Toma de asistencia; Integrantes → alta/invitación/aprobaciones/vincular; Gestión → configuración/tipos/suscripción; Reportes y Anuncios. |
| COACH | Inicio → Actividades → Toma/corrección de estados y Reportes agregados; sin gestión, notas privadas ni desmarcado. |
| ATHLETE | Inicio/agenda → detalle; Mi asistencia → historial de su grupo; Reportes conserva lo propio con toggles apagados; QR registra solo su membership ATHLETE. |
| GUARDIAN | Mis pupilos → detalle → historial/consentimientos en el grupo del pupilo; Reportes mantiene sus pupilos aunque no tenga agregados grupales habilitados. |
| Multirol | Unión de roles en el grupo; se conservan accesos propios ATHLETE y de pupilos GUARDIAN. La navegación no reemplaza controles de servidor/RLS. |

[`AppShell`](../apps/web/src/components/app-shell.tsx) agrupa tareas, muestra contexto de grupo y separa espacio personal. El selector conserva únicamente destinos permitidos al cambiar de grupo; los IDs de una actividad/pupilo no se reutilizan como si pertenecieran al nuevo grupo. «Mi agenda global» es `/groups#agenda`; no suma porcentajes entre grupos.

## 4. Web responsive y propuesta móvil

La web usa navegación lateral desde 1024 px y un drawer modal en anchos menores, con retorno de foco. El [sistema visual](12-sistema-visual.md) define tokens, tamaños mínimos y contratos reales. El objetivo de tomar asistencia a una mano en 375 px continúa vigente; no equivale a una app móvil instalada.

La distribución móvil de [doc 09](09-roadmap.md) sigue siendo un **objetivo**: acceso, consulta multirol y toma de asistencia; gestión completa queda fuera de la primera entrega nativa. El backend de avisos actual usa Expo Push, pero no existe cliente Expo ni app Java/Swift entregada. No hay tabs nativos, share sheet ni almacenamiento offline implementados en este corte.

## 5. Contratos de pantallas críticas al corte

### 5.1 ASI-01 — Toma de asistencia

[`AttendanceSheet`](../apps/web/src/app/groups/%5BgroupId%5D/activities/%5BactivityId%5D/attendance/attendance-sheet.tsx) presenta deportistas activos, búsqueda y páginas de 50. Contadores, estado textual, selección y guardado por fila distinguen sin marcar/guardando/guardado/error. El lote confirma «todos presentes» sobre los no marcados y usa bloques de hasta 500; conserva lo ya confirmado ante un fallo posterior. La nota es opcional y exclusiva de ADMIN, al igual que volver a sin marcar. COACH conserva notas existentes sin leerlas ni escribirlas.

Sin nómina se ofrecen acciones según rol; un cambio fallido se revierte y admite recuperación. No hay cola offline. El objetivo histórico de marcar 20 personas en menos de 60 segundos es una meta de usabilidad, no una medición certificada por este inventario.

### 5.2 INT-01 — Integrantes y altas

[`/members`](../apps/web/src/app/groups/%5BgroupId%5D/members/page.tsx) busca por nombre, filtra rol/estado y pagina; cada fila corresponde a una membership y una persona puede repetirse por rol. Distingue nómina vacía, filtros sin resultados y página fuera de rango. Las acciones por fila no abren INT-02, que no tiene ruta.

INT-03 no activa automáticamente a un menor: separa declaración ADMIN, vínculo y consentimiento efectivo del apoderado. INT-06 muestra el avance y quién completa cada paso; «Consentimientos de mis pupilos» pertenece al GUARDIAN. Doc 02 define cuándo el consentimiento basta y cuándo falta confirmación ADMIN.

### 5.3 ACT-02 / ACT-03 / ACT-04 — Actividad y serie

El detalle muestra horario de Chile, tipo, ubicación, recurrencia y retorno al contexto de agenda. ADMIN edita y muestra QR; ADMIN/COACH acceden a toma de asistencia. ATHLETE/GUARDIAN consultan estados y notas autorizadas mediante enlaces a sus historiales; no se promete un resumen de asistencia embebido en el detalle.

La creación y edición comparten [`ActivityForm`](../apps/web/src/app/groups/%5BgroupId%5D/activities/new/activity-form.tsx). El alcance de serie se elige en la edición; futuras con asistencia quedan protegidas por el contrato de backend. La agenda real es una lista por próximas/pasadas, no un calendario mensual navegable.

### 5.4 REP-01 / REP-02 — Reportes y estadísticas

[`/reports`](../apps/web/src/app/groups/%5BgroupId%5D/reports/page.tsx) selecciona la presentación por permisos. ADMIN/COACH reciben el reporte autorizado, con filtros aplicados, promedio individual y total ponderado diferenciados; la proyección COACH conserva las restricciones de doc 02. ATHLETE/GUARDIAN reciben sus datos/pupilos y, si corresponde, agregados grupales de temporada; no necesitan `/stats`.

[`ReportTable`](../apps/web/src/app/groups/%5BgroupId%5D/reports/report-table.tsx) presenta nombres y métricas en una región enfocable, encabezados por fila/columna, números tabulares y primera columna fija. La tabla por tipo incluye barras visuales de apoyo; la evolución semanal es tabla. **No hay botón CSV ni enlace de fila a historial ADMIN** en el corte. Null se presenta como «Sin datos»; los umbrales y fórmula vienen de core/SQL.

### 5.5 ASI-02 / PRF-02 — Historial individual

ATHLETE usa `/groups/[groupId]/me/history`; GUARDIAN, `/groups/[groupId]/wards/[athleteUserId]/history`. `/me/history` elige grupo o redirige. [`AttendanceHistoryContent`](../apps/web/src/components/attendance-history.tsx) comparte resumen, filtros y registros autorizados; las notas no se abren a terceros. La ruta ADMIN `/members/:membershipId/history` sigue como objetivo sin página.

### 5.6 APO-03 / APO-04 — Apoderados

`/wards` y su detalle presentan pupilos/grupos vigentes, próximas actividades, métricas por grupo y tareas. Historial y consentimientos tienen enlaces contextuales. La vista puede mostrar incorporaciones pendientes sin convertirlas en asistencia activa; el cumpleaños 18 retira la visibilidad según las reglas del servidor. La consulta de un pupilo nunca autoriza a ver a los demás deportistas.

### 5.7 GRP-04 — Visibilidad

`/groups/[groupId]/settings/visibility` usa dos toggles independientes, inicialmente false, guardado inmediato y vista previa (ejemplo rotulado si faltan registros). Incluye autor/fecha del último cambio. Mostrar agregados no expone contactos, birthdate ni notas privadas; doc 02 es la referencia para V1–V6. Los datos del grupo en `/settings` tienen guardado explícito y no comparten esa semántica de autosave.

## 6. Alcance y criterios de mantenimiento

| Prioridad original | Estado del corte |
|---|---|
| P0 web | Módulos y páginas de §2; brechas lógicas de §2.1 explícitas. No declarar todas las pantallas del plan operativas solo por el número de páginas. |
| P1 móvil/push/CSV | Sin cliente móvil; CSV y recordatorios/ausencias sin UI verificada. Stack nativo Java/Swift planificado; migración de Expo Push a FCM/APNs pendiente de diseño en Fase 2. |
| P2 autorizado | COACH, suscripciones del club, anuncios, QR web y OAuth existentes. Límites y evidencia en §7. |
| P2 restante | Offline pospuesto; geocerca, ranking, justificaciones y gestión móvil no se implementan por inferencia. |

Al terminar **cada issue de UI**, el mismo PR debe actualizar las filas de rutas/códigos que cambien, los contratos de componentes/estados del [sistema visual](12-sistema-visual.md), base/fecha, evidencia y pendientes. Mantener códigos estables; una nueva extensión sin código histórico usa el issue como identificador hasta que se acuerde uno. No convertir una propuesta UX en descripción de código ni un test omitido en PASS.

## 7. Reconciliación de historias y alcance

Consulta de cuerpo, comentarios, responsable e historial de GitHub al 05-10-2026 y contraste con las rutas/componentes del grafo. **Responsable** diferencia assignee registrado y autor del cierre; no se asigna trabajo nuevo por este documento. Fechas de cierre en UTC, como GitHub. Ningún issue antiguo fue cerrado/reabierto por #121.

| Historia | Evidencia y responsable/historial | Decisión documental y seguimiento |
|---|---|---|
| [#36 · CSV](https://github.com/AlexxSome/asisteam/issues/36) P1 | Cerrado por AlexxSome el 29-09-2026 14:40:30Z, sin assignee ni comentarios; timeline sin PR de entrega vinculado. REP-01/ReportTable no ofrecen CSV. | **Cerrado sin implementación UI verificada**. Conservar P1; ratificar con AlexxSome el motivo del cierre antes de planificar. No implementar ni reabrir aquí. |
| [#19 · App móvil](https://github.com/AlexxSome/asisteam/issues/19) P1 | Assignee AlexxSome; cerrado 29-09-2026 14:39:44Z, sin comentarios de entrega; grafo sin cliente `apps/mobile`. | **Sin cliente verificado**; [#54](https://github.com/AlexxSome/asisteam/issues/54#issuecomment-5933509828) registra luego que móvil se planificará más adelante. No reabrir el alcance por el rediseño. |
| [#44 · Recordatorios](https://github.com/AlexxSome/asisteam/issues/44) / [#50 · Aviso de ausencia](https://github.com/AlexxSome/asisteam/issues/50) P1 | Sin assignee ni comentarios; cierres por AlexxSome el 29-09-2026 a 14:40:31Z (ambos eventos de cierre del timeline). Sin CFG-02 ni UI de esos avisos identificadas. | **Cierres sin UI verificada**; pedir ratificación del cierre en su futura planificación. El push de anuncios #57 no demuestra estas dos historias. |
| [#52 · Solicitar justificación](https://github.com/AlexxSome/asisteam/issues/52) / [#53 · Aprobar](https://github.com/AlexxSome/asisteam/issues/53) P2 | #52 asignado a AlexxSome; #53 sin assignee. Cerrados por AlexxSome el 29-09-2026 a 14:50:39Z y 14:51:11Z, sin comentarios ni UI ASI-03 identificada. | **Sin flujo verificado**; conservar P2 y ratificar decisión con el autor de los cierres. EXCUSED manual no prueba solicitud/aprobación. |
| [#54 · Offline](https://github.com/AlexxSome/asisteam/issues/54#issuecomment-5933509828) P2 | AlexxSome, assignee y autor del comentario/cierre del 01-10-2026: pospuesto, sin commits/PR, depende del cliente móvil y ASI-01. | **Diferido explícitamente**. La decisión de Java/Swift no reactiva cola ni sincronización offline. |
| [#55 · COACH](https://github.com/AlexxSome/asisteam/issues/55#issuecomment-5945537421) P2 | AlexxSome confirma [PR #95](https://github.com/AlexxSome/asisteam/pull/95), 02-10-2026; [doc 02](02-roles-y-permisos.md#delegación-coach-p2--hu-adm-20-55) y ASI-01/reportes registran la implementación. | **Autorizado e implementado**: estados y agregados; sin notas privadas ni gestión. Preservar esta capacidad. |
| [#56 · Billing](https://github.com/AlexxSome/asisteam/issues/56#issuecomment-5966035726) P2 | AlexxSome confirma [PR #96](https://github.com/AlexxSome/asisteam/pull/96), 03-10-2026. [Doc 12](12-suscripciones-saas.md) registra el cambio de alcance a suscripciones SaaS por club. | **Autorizado e implementado**: club → Asisteam con Mercado Pago. Sustituye cuotas de deportistas; no crear tesorería de integrantes por el título antiguo. |
| [#57 · Anuncios](https://github.com/AlexxSome/asisteam/issues/57#issuecomment-5966437188) P2 | AlexxSome confirma [PR #97](https://github.com/AlexxSome/asisteam/pull/97), 03-10-2026; muro y [doc 13](13-anuncios.md). | **Web y backend de avisos implementados**. El envío actual depende de Expo Push; las apps nativas requieren migrar tokens/transporte a FCM/APNs. No hay push de navegador ni mensajería directa. |
| [#58 · QR](https://github.com/AlexxSome/asisteam/issues/58#issuecomment-5971087844) P2 | Assignee AlexxSome; confirma [PR #98](https://github.com/AlexxSome/asisteam/pull/98), 03-10-2026; emisión/check-in y [doc 14](14-asistencia-qr.md). | **Autorizado en web responsive**: ADMIN emite, ATHLETE se registra; preserva registros previos. No incluye geocerca ni exige Expo. |
| [#59 · Google/Apple](https://github.com/AlexxSome/asisteam/issues/59#issuecomment-5971635628) P2 | AlexxSome confirma [PR #99](https://github.com/AlexxSome/asisteam/pull/99), 03-10-2026; acceso/registro y handler OAuth existentes. | **Implementación autorizada**, operativa solo con proveedores configurados. La aceptación de condiciones se completa en #107, no se infiere del login social. |

Los cierres sin motivo verificable permanecen como discrepancias, no como decisiones «entregado» o «cancelado». El siguiente paso de producto corresponde a AlexxSome como autor/responsable identificado; esta rama deja la evidencia para esa revisión sin atribuirle una decisión que no registró.

## 8. Evidencia y validación de esta reconciliación

| Antes, base del corte | Después de #121 |
|---|---|
| AGENTS decía «solo documentación»; README enumeraba 11 documentos y capacidades existentes como futuras. | Monorepo/módulos actuales, serie 01–14 más guía visual (15 documentos) y extensiones autorizadas enlazados. |
| 37 páginas de una auditoría anterior; rutas lógicas mezcladas con disponibles. | 39 fuentes `page.tsx` enlazadas, dos adiciones de #107, secciones integradas y páginas ausentes explícitas. |
| #36 cerrado podía interpretarse como CSV disponible; #54 como offline entregado. | Historial/responsables y decisión documental individual sin cambios de estado de issues. |
| Guía visual anclada en tokens #102, con #103 aún descrito como futuro. | Contratos actuales de componentes, foco, carga/error/vacío, tablas y actualización por issue. |

Cambio de documentación: no altera pantallas ni reglas. La comparación anterior es la evidencia antes/después del contenido; no se atribuye un cambio visual a esta rama. La evidencia sintética de teclado y 320/375/768/1024/1440 px reside en [QA #120](qa/issue-120/README.md), con sus límites explícitos. El zoom nativo 200 % y lector de pantalla pendientes de la matriz final no se convierten en PASS por actualizar este mapa.

Resultados locales del 05-10-2026:

| Comprobación | Resultado de #121 |
|---|---|
| Enlaces y anclas | 141 enlaces relativos válidos; anclas Markdown verificadas. |
| Inventario | 39 páginas del grafo enlazadas exactamente una vez en §2; coinciden con las páginas del build, excluyendo handlers y `_not-found`. |
| Vitest core | 150 PASS. |
| Vitest web | 821 PASS en repetición completa; 81 integraciones opt-in omitidas. La primera pasada tuvo 820 PASS y el fallo intermitente de preview de foto ya documentado en #119/#120; no se modificó perfil ni se afirma reparado. |
| Typecheck web/core y build web | PASS; build fuera del sandbox por el puerto interno de Turbopack. Aviso preexistente de `middleware` → `proxy`. |
| Playwright completo | Intentado; no llegó a ejecutar casos porque el proceso del servidor resolvió pnpm global 11.1.1 frente a 10.33.2. No se atribuyen nuevas capturas/teclado/viewports a esta ejecución. |
| Auto-revisión y `git diff --check` | Acotados a los cuatro documentos y sus referencias; sin cambios funcionales. |

Se ejecutaron los scripts reales mediante `corepack pnpm --filter @asisteam/core test/typecheck` y `corepack pnpm --filter @asisteam/web test/typecheck/build/test:e2e:full` (cada tarea por separado). No hay script lint ni skills auxiliares heredadas `frontend-check`, `frontend-ci` o `ship` instaladas; se usa el flujo de entrega explícito de la skill invocada. No hay cambios DB/RLS/RPC ni tipos que regenerar; no se ejecutaron pgTAP ni integraciones opt-in. La evidencia visual previa permanece enlazada y fechada; no se certifica otra pasada manual en esta rama.


### Verificación adicional de la épica #100 — 05-10-2026

[QA de cierre #100](qa/issue-100/README.md) amplía los recorridos de #120 con registro e invitación reales locales, cadena de menor/apoderado/consentimiento/aprobación, alta MANAGED, edición de series, lote de asistencia, QR, recuperación de contraseña y fallo del servidor. No agrega rutas: se conservan las 39 páginas del inventario.

Se corrigen el reintento de `ErrorState` (refresca el payload del servidor) y la semántica de grupos etiquetados en acceso social, aceptación de invitación, preview de logo y resumen de suscripción. La documentación de AUT-04 se ajusta al contrato existente y probado. La validación humana con lector, zoom nativo y tiempo de asistencia a una mano permanece **PENDIENTE**; este informe no cierra por sí solo la épica.

## Migración de transporte de grupos/perfil · MIG-07 (#151), 07-10-2026

[Seguro] [Evidencia MIG-07](migration/issue-151/README.md) registra GRP-01/02/03/04, creación/ingreso y PRF-01 (incluida revisión ADMIN) consumiendo Nest bajo GROUPS/PROFILE=nest. Se conservan las 39 páginas, códigos/rutas y estado visible: confirmación de guardado, error sin éxito, fecha pendiente y permisos de imagen. Las otras capacidades de una página (agenda/miembros/asistencia/billing) siguen sus módulos/transportes; esta entrega no declara esas operaciones migradas.

[Seguro] El selector conserva grupo/cookie por usuario; middleware vuelve a comprobar membership antes del streaming, con 404 para ajeno/inactivo/PENDING y permisos de gestión. E2E real local pasó 8 pruebas a 375 px: cuatro roles/multirol, selector, restricciones y guardar configuración/perfil; axe acotado. Storage mantiene autorización temporal. El retorno a Supabase usa la misma base y no repite una acción fallida o de resultado incierto.

## Migración de integrantes/apoderados/consentimientos · MIG-08 (#152), 07-10-2026

[Seguro] [Evidencia MIG-08](migration/issue-152/README.md) registra las páginas `/groups/:groupId/members` (nómina), `/members/new` (MANAGED), `/members/pending` (INT-06), `/guardians`, `/members/consent`, `/wards` y `/wards/:athleteUserId`, resumen pendiente de inicio y `/accept-terms`, middleware y callback usando MEMBERS=nest. Se conservan los códigos/rutas y las 39 páginas del inventario. Invitaciones/activación propia, imagen, asistencia e historial mantienen sus módulos/adaptadores; el cambio de transporte no acredita salida completa de Supabase.

[Seguro] El recorrido local incluye menor por código → vínculo → consentimiento → aprobación ADMIN, MANAGED menor → consentimiento sin credenciales, pupilos/historial a 320 px y nómina/edición/COACH/baja/reactivación a 375 px, con axe acotado. Las reglas de visibilidad/R1/cupos se comprueban además mediante HTTP/PostgreSQL real. Validación humana/cancha y despliegue cloud siguen pendientes.

## Invitaciones y activación por Nest · MIG-09 (#153), 07-10-2026

[Seguro] [MIG-09](migration/issue-153/README.md) reconcilia AUT-05/AUT-06 (/invitations/:token), INT-04 (envío/historial/reenvío), acciones de activación MANAGED en nómina y APO-04 (solicitud/revisión). INVITATIONS=nest selecciona un ejecutor; MEMBERS mantiene datos/consentimiento y Auth mantiene cookies SSR. Se conservan las 39 páginas y códigos, sin nuevos componentes/disposición. Links previos se resuelven sobre la misma tabla/hashes. El alcance local/externo y las verificaciones de 375 px/axe figuran en la evidencia, sin acreditar despliegue cloud o validación humana.


## Actividades/tipos por Nest · MIG-10 (#154), 07-10-2026

[Seguro] [MIG-10](migration/issue-154/README.md) reconcilia ACT-01/02/03/04, GRP-05 y agendas/tarjetas de GRP-02, /groups, /wards y /wards/:athleteUserId mediante ACTIVITIES=nest. Conserva las 39 páginas, rutas/códigos, formularios y estados. Lecturas globales/pupilo mantienen selección de grupos ACTIVE; CRUD preserva alcance puntual/serie, historial y fechas de Chile. La evidencia local de integración/E2E, límites y resultado de CI está enlazada; no acredita deploy cloud ni lector humano.


## Asistencia por Nest · MIG-11 (#155), 07-10-2026

[Seguro] [MIG-11](migration/issue-155/README.md) reconcilia ASI-01 mediante ATTENDANCE=nest: roster completo paginado, guardado por fila/lote, corrección parcial y desmarcado ADMIN. Conserva39 páginas, rutas/códigos, botones44px, confirmación/guardado/error, privacidad COACH y éxitos parciales entre lotes. La evidencia local375px/teclado/recarga/fallo de red y sus límites figuran en el runbook; no acredita deploy cloud ni revisión humana completa.


## Historial/reportes por Nest · MIG-12 (#156), 07-10-2026

[Seguro] [MIG-12](migration/issue-156/README.md) conecta historial propio/de pupilos, reportes ADMIN/COACH y estadísticas con REPORTS=nest sobre las cuatro RPC canónicas. Conserva rutas/códigos y 39 páginas; filtros de período/tipos/inactivos/orden, paginación y tablas accesibles siguen usando los DTO SQL autorizados. V1/V2 permanecen con toggles apagados y V4/V5 se reevalúan en servidor. Evidencia local por rol, Chile/métricas, teclado375px/axe y límites en el runbook; no acredita despliegue cloud ni lector humano.


## Suscripción por Nest · MIG-14 (#158), 07-10-2026

[Seguro] [MIG-14](migration/issue-158/README.md) conecta `/groups/:groupId/billing` y sus acciones mediante BILLING=nest: DTO ADMIN, ledger paginado y checkout/conciliación/cancelación con precios/cupos de servidor. Conserva39 páginas y la ruta de la extensión #56, que no tiene código de pantalla histórico. Mantiene tabla enfocada por teclado, fechas Chile, confirmación y error sin éxito. El retorno con query de checkout no altera estados. La continuidad firmada por URL antigua y los límites de sandbox/corte se registran en el runbook; no acredita deploy cloud.
