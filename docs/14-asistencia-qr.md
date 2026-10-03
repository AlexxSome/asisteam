# Autoasistencia con QR — HU-DEP-10 / #58

Alcance P2 autorizado: web responsive. ADMIN muestra el QR desde el detalle de una actividad; ATHLETE lo escanea con la cámara del teléfono y abre el enlace web. No requiere app Expo ni acceso a la cámara desde el navegador. No incluye geocerca.

## Horario y permisos

ADMIN configura el horario para todo el grupo en la pantalla del QR. Valores iniciales: apertura 15 minutos antes del inicio, cierre 60 minutos después y atraso después de 10 minutos. Son minutos enteros de 0 a 1440; el cierre debe ser mayor que cero y el umbral de atraso no puede superar el cierre. La configuración se aplica inmediatamente a todas las actividades del grupo, sin modificar registros existentes.

La ventana incluye sus extremos. En el umbral exacto se registra PRESENT; estrictamente después, LATE. PostgreSQL decide con su reloj después de tomar los bloqueos. No se admite fecha, estado, usuario ni membership enviados por el deportista. La presentación del inicio usa America/Santiago; los cálculos utilizan instantes UTC y minutos transcurridos.

- Solo ADMIN ACTIVE configura y emite el QR. COACH conserva sus permisos de toma manual, pero no emite QR ni modifica estos ajustes.
- Solo ATHLETE ACTIVE del mismo grupo registra su propia llegada. Multirol usa su membership ATHLETE. ADMIN/COACH/GUARDIAN sin ese rol, membresías PENDING/INVITED/INACTIVE, ajenos y usuarios sin sesión no pueden registrarse.
- Un escaneo válido crea una única fila de asistencia. Si ya existe, responde con su estado actual sin alterar ID, estado, nota, actor ni fecha; esto incluye ABSENT/EXCUSED previamente registrados por ADMIN. Una corrección se solicita al administrador.
- El bloqueo de actividad se comparte con tomar, editar y desmarcar asistencia. Escaneos concurrentes no duplican filas y una toma ADMIN concurrente prevalece, cualquiera sea el orden de adquisición del bloqueo.
- La métrica conserva sus reglas previas: solo actividades pasadas, posteriores al ingreso y con registro. No hay ausencias automáticas ni cambios de fórmula.

## QR y sesión

El QR contiene una URL del origen de la web: `/check-in#activity_id=<uuid>&token=<token>`. El fragmento no se envía en GET ni Referer; se retira del historial al leerlo y se conserva únicamente en memoria hasta terminar el flujo. El formulario de login permite continuar en ese mismo destino estricto; no acepta redirecciones arbitrarias. Si la sesión tarda más que la vigencia del QR, el deportista debe escanear el código actual.

Una clave aleatoria de 256 bits por actividad permanece en `app_private.qr_checkin_keys`. HMAC-SHA256 vincula el token a la actividad y al tramo UTC de 60 segundos. Todos los ADMIN reciben el mismo token durante ese tramo; varios dispositivos no se invalidan entre sí. Al terminar el tramo, el token anterior deja de servir; la vigencia restante puede ser menor que 60 s al abrir la pantalla. El cierre de la ventana también invalida el registro. No se acepta el tramo anterior ni futuro.

La pantalla renueva el QR al vencer usando la hora de servidor y un temporizador monotónico local, retira códigos vencidos y vuelve a consultar cuando recupera visibilidad. Una consulta fallida muestra una acción de reintento. Se usa `qrcode.react` para generar SVG en el dispositivo; ningún servicio externo recibe el enlace/token. No hay prueba de presencia física: un QR compartido durante su vigencia permite registrar a otro ATHLETE autorizado; la geocerca queda fuera de esta historia.

Las tablas privadas tienen RLS y no conceden lectura/escritura al cliente. Los toggles `groups.settings` conservan su contrato. La única respuesta al deportista contiene actividad, grupo, título, estado, fecha del registro propio y si se creó; no revela notas ni datos de terceros. Los tokens no se registran en logs de aplicación.

## Contrato

| RPC | Entrada | Respuesta / permiso |
|---|---|---|
| `get_qr_checkin_settings` | `p_group_id` | Los tres tiempos; solo ADMIN |
| `set_qr_checkin_settings` | `p_group_id`, `p_settings` con `opens_before_minutes`, `closes_after_minutes`, `late_after_minutes` | Configuración validada; solo ADMIN |
| `issue_activity_checkin_qr` | `p_activity_id` | `activity_id`, `token`, `server_time`, `expires_at`; solo ADMIN, dentro de ventana |
| `self_checkin` | `p_activity_id`, `p_token` | `activity_id`, `group_id`, `activity_title`, `status`, `recorded_at`, `created`; solo ATHLETE ACTIVE propio |

Errores: 401 sin sesión; 404 `checkin_not_available` para actividad inexistente, ajena o sin ATHLETE ACTIVE propio; 403 `admin_required` en administración del QR; 400 `invalid_qr_settings`; 422 `checkin_qr_expired` para token inválido/vencido y `checkin_window_closed` fuera de ventana. Las Server Actions traducen códigos conocidos al sobre uniforme de error en español y ocultan errores internos.

## Validación y despliegue

Aplicar `20261003040000_qr_attendance.sql` antes de desplegar la web; no requiere Edge Function, cron ni secretos nuevos de entorno. Las claves operativas se generan dentro de la base al emitir el primer QR válido.

```sh
pnpm install --frozen-lockfile --prod=false
pnpm exec supabase migration up --local
pnpm exec supabase test db
pnpm test
pnpm typecheck
pnpm --filter @asisteam/web build
RUN_CHECKIN_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run src/lib/check-in.integration.test.ts
pnpm exec supabase gen types typescript --local
```

pgTAP comprueba límites exactos, permisos, aislamiento, revocación, caducidad e idempotencia. Vitest cubre payloads estrictos, login, errores, reescaneo en la misma pestaña y rotación en pantalla. La integración utiliza Auth/PostgREST reales y verifica ocho escaneos simultáneos y asistencia manual concurrente con fixtures sintéticos propios que elimina al terminar.
