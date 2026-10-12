# Matriz comparativa de paridad · WEB-09

[Seguro] Comparación del inventario39/39 de WEB-01 con las rutas migradas WEB-04…08; el sourceCommit de cada corrida está en la evidencia sanitizada. Cada suite Vite ahora se ejecuta con artefacto estático+Nest/PostgreSQL/S3 propios, mismo origen y CSP. La columna de prueba identifica los recorridos existentes conservados; su estado final lo determina la corrida, no esta tabla.

| Flujos/rutas canónicas | Antes Next / después Vite | Suite Vite (y regresión Next conservada) |
|---|---|---|
| `/` | Grupo recordado autorizado/selector/bienvenida | access, session, groups-profile |
| `/login` | Email, Google/Apple configurados, error, retorno seguro | access, session |
| `/register` | Registro/aceptación, código solo ATHLETE, menor PENDING | access |
| `/forgot-password` | Recovery genérica y contexto | access |
| `/reset-password` | Un uso, URL limpia, sesiones revocadas | access |
| `/invitations/:token` | INVITED/MANAGED→ACTIVE, destinatario, vencido/usado | access |
| `/accept-terms` | Aceptación explícita/retorno autorizado | access, session |
| `/legal/2026-09-21` | Contenido canónico, sin aceptación por GET; HTML sin JS | infrastructure |
| `/welcome` | Primer uso/sin grupos, pendientes propios | access, groups-profile |
| `/join` | Código/menor pendiente/no acceso prematuro | access, members |
| `/groups` | Selector/agenda global, multirol, sólo ACTIVE | session, groups-profile |
| `/groups/new` | Alta/grupo y cupos servidores | groups-profile, capabilities |
| `/groups/:groupId` | Inicio/contexto/roles/recarga | session, groups-profile |
| `/groups/:groupId/settings` | Datos/código/regeneración/guardado explícito | groups-profile |
| `/groups/:groupId/settings/visibility` | Toggles independientes defaultfalse/ADMIN | groups-profile, activities-reports |
| `/groups/:groupId/activity-types` | Tipos de sistema inmutables y gestiónADMIN | activities-reports |
| `/groups/:groupId/members` | Nómina/filtros/paginación/multirol/V5 | members |
| `/groups/:groupId/members/new` | MANAGED, menor PENDING, write incierto | members |
| `/groups/:groupId/members/pending` | R1/vínculo/consentimiento/confirmaciónADMIN | members |
| `/groups/:groupId/members/consent` | Consentimiento vigente GUARDIAN e historia | members |
| `/groups/:groupId/invitations/new` | Crear/historial/reenvío/cupo/incertidumbre | members |
| `/groups/:groupId/guardians` | Vincular menor, privacidad y gestiónADMIN | members |
| `/wards` | Pupilos vigentes y grupos propios | members, groups-profile |
| `/wards/:athleteUserId` | Datos/agenda/historial/consentimiento autorizado | members, activities-reports |
| `/groups/:groupId/activities` | Agenda/filtros/paginación/fechasChile | activities-reports |
| `/groups/:groupId/activities/new` | Actividad/recurrencia/DST/validación | activities-reports |
| `/groups/:groupId/activities/:activityId` | Detalle/retorno/tenant y rol | activities-reports |
| `/groups/:groupId/activities/:activityId/edit` | Esta/futuras, preservar asistencia | activities-reports |
| `/groups/:groupId/activities/:activityId/attendance` | ADMIN/COACH, notas/desmarcadoADMIN, lote500/parcial | activities-reports |
| `/me/history` | SelectorATHLETE, sin porcentaje global | activities-reports |
| `/groups/:groupId/me/history` | V1,77.8/null, convocatoria/joined_at | activities-reports |
| `/groups/:groupId/wards/:athleteUserId/history` | V2/V3/vínculo activo/tenant | activities-reports |
| `/groups/:groupId/reports` | V4/V5,toggles, tablas/caption/filtros/período | activities-reports |
| `/profile` | Datos/contraseña/avatar/borrador/privacidad | groups-profile |
| `/profile/birthdate-requests` | RevisiónADMIN/fecha pendiente/menores | groups-profile |
| `/groups/:groupId/billing` | Precio/cupo/ledger/cancelación/checkout incierto | capabilities |
| `/groups/:groupId/announcements` | CRUDADMIN, versiones/borrador/opt-in/refresh | capabilities |
| `/groups/:groupId/activities/:activityId/qr` | EmisiónADMIN/expiración/settings/privacidad | capabilities |
| `/check-in` | Fragmento en memoria, login, idempotencia/negativos | capabilities |

[Seguro] Cada archivo `.spec.ts` vive en `apps/web-vite/e2e/`; las47 pruebas Next de `apps/web/e2e/` permanecen en `ci:extended`. Responsive320/375/768/1024/1440, teclado/drawer/confirmaciones, axe, errores/red/recarga y rolesADMIN/COACH/ATHLETE/GUARDIAN/multirol se conservan en esos recorridos; no se afirma cada combinación de cada ruta sin evidencia específica.

[Seguro] Infraestructura añade lectura directa de todas las rutas, HTML/legal/API/assets/headers/hashes, actualización con assets retenidos, recarga y rollback conservando sesión viva; logout/revocación no se revierten. SQL/RLS/menores/métricas y84 integraciones siguen gates separados. La prueba browser no cambia estados HTTP de shell al fallar un loader; el servidor Nest mantiene401/404/503 y la UI el mensaje canónico.

[Seguro] Gates humanos/proveedores siguen **PENDIENTE** en #181/#209. El mapa no marca cumplimiento WCAG integral, lector/zoom nativo/cancha, proveedor real ni producción. No hay rutas nuevas deCSV/offline/móvil ni rediseño adicional.
