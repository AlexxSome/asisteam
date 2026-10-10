# Autoasistencia con QR — HU-DEP-10 / #58

[Seguro] **Vigencia del candidato MIG-24 (#168, 2026-10-09):** web/API/worker usan Nest + PostgreSQL17 independiente + Auth propio + S3 privado; SDK/rutas Supabase de producto retirados. [Inventario, contratos, evidencia y pendientes del corte real](migration/issue-168/README.md). Las referencias posteriores a Supabase/GoTrue/PostgREST/Edge/banderas describen la arquitectura de origen y los hitos históricos, no un fallback del candidato. Las reglas SQL/RLS, permisos, menores, métrica, consentimiento e historial se conservan. **Producción NO-GO; corte real y aceptación de #168 pendientes.**


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

## UX y recuperación — #119

El QR y la vigencia ocupan el primer bloque de la actividad. Los ajustes quedan plegados bajo **Ajustes de QR de todo el grupo**: abrirlos o editar campos no guarda nada. El botón de guardado y su explicación indican que afecta a todas las actividades, y la validación usa el schema compartido. Un fallo conserva el borrador y se anuncia como `alert`; un guardado correcto se anuncia como `status`.

La llegada distingue lectura, registro pendiente, confirmación, registro anterior, QR vencido y operación no disponible. Cada estado permite volver a Mis grupos con una URL limpia. Solo una falla recuperable permite reintentar; un QR vencido pide reescanear, incluso después del login. Los segundos no están en una región viva. Las respuestas recibidas con la pestaña oculta se descartan y el QR se vuelve a consultar al recuperar visibilidad.

### Evidencia antes/después

Base: `807dbe18d3f3d6be156727ecdf198135078753c5`. Chrome con datos sintéticos, componentes reales (incluido el shell) y CSS del build de producción. Un fixture temporal externo al repositorio sustituye Server Actions/consultas y navegación de Next. No usa una sesión Supabase ni constituye un E2E autenticado o una certificación con lector de pantalla.

| Escenario, 375 px | Antes | Después |
|---|---|---|
| QR y ajustes | [QR y formulario juntos](qa/issue-119/before-qr-375.png) | [QR y ajustes plegados](qa/issue-119/after-qr-375.png) |
| Enlace sin QR | [Instrucción sin salida](qa/issue-119/before-checkin-375.png) | [Instrucción y regreso a grupos](qa/issue-119/after-checkin-375.png) |

Estados adicionales: [renovación sin código vencido](qa/issue-119/after-renewing-375.png), [fallo al cargar QR](qa/issue-119/after-qr-error-375.png), [horario no disponible](qa/issue-119/after-qr-closed-375.png), [error al guardar con borrador conservado](qa/issue-119/after-settings-error-375.png), [guardado correcto](qa/issue-119/after-settings-success-375.png), [registrando](qa/issue-119/after-checkin-registering-375.png), [confirmación](qa/issue-119/after-checkin-ready-375.png), [registro anterior](qa/issue-119/after-checkin-existing-375.png), [vencido](qa/issue-119/after-checkin-expired-375.png), [login y aviso de reescaneo](qa/issue-119/after-checkin-login-375.png), [QR en escritorio](qa/issue-119/after-qr-1440.png).

[Mediciones y teclado](qa/issue-119/checks.json): 72 comprobaciones PASS en 320, 375, 768, 1024 y 1440 px; sin overflow horizontal. A 375 px el QR completo cabe en el viewport de 812 px de alto. Chrome confirma Enter para desplegar ajustes, Tab al primer campo, guardado explícito y reintento con teclado. Los enlaces de salida carecen de token y se elimina el fragmento tras leerlo.

### Gate local

- 24 pruebas de comportamiento de los dos componentes: caducidad durante login, reescaneo con respuesta anterior pendiente, rotación, respuesta que consume su vigencia, pestaña oculta, errores recuperables/no recuperables y guardado explícito con validación/feedback.
- Suite web: **821 PASS**, 81 pruebas de integración omitidas por su configuración opt-in. La primera ejecución tuvo un fallo transitorio en `profile-form.test.tsx` (retirada de previsualización tras guardar foto); la repetición completa pasó sin modificar perfil.
- Suite core: **150 PASS**. Typecheck de web/core y build de producción: **PASS**. `git diff --check`: **PASS**.
- Los scripts se ejecutaron con `corepack pnpm --filter @asisteam/web ...` y `corepack pnpm --filter @asisteam/core ...`; Turborepo seleccionaba pnpm 11 del PATH frente al 10.33.2 del repositorio. El build se ejecutó fuera del sandbox porque Turbopack abre un puerto interno. No se modificó la configuración de versiones.
- No hay script de lint ni skills heredadas `frontend-check`, `frontend-ci` o `ship` instaladas; se aplican los gates reales y la entrega explícita de la skill del issue. No se cambian DB/RLS/RPC ni tipos generados, por lo que no se requieren nuevas migraciones ni el gate de pgTAP/integración para este cambio.

La auto-revisión se limita al diff de #119 y sus efectos. Las reglas y límites del QR del contrato anterior se mantienen.

[Zoom nativo 200 %](qa/issue-119/zoom-200.json): Chrome configurado desde Apariencia en un perfil temporal aislado; ventana 1440 px → viewport CSS 720 px, DPR 2 y escala visual 1. QR, ajustes abiertos y recuperación de un código vencido no desbordan. Tab/Enter siguen operativos en los ajustes. Capturas del viewport físico mediante CDP sin recorte: [QR](qa/issue-119/zoom-200-qr.png), [ajustes](qa/issue-119/zoom-200-settings.png), [vencido](qa/issue-119/zoom-200-expired.png).

## Transporte Nest y compatibilidad — MIG-16 (#160)

[Seguro] [Runbook y evidencia](migration/issue-160/README.md) añade GET/PUT `/api/v1/groups/:groupId/check-in-settings`, POST `/api/v1/activities/:activityId/check-in-qr` y POST `/api/v1/me/check-in`. OpenAPI/SDK valida los mismos schemas canónicos; el token se envía exclusivamente en JSON. Sesión temporal, perfil ACTIVE, consentimiento vigente y transacción del rol mínimo `asisteam_api`; las cuatro RPC conservan la autorización en SQL.

[Seguro] `ASISTEAM_TRANSPORT_QR=nest` elige un único ejecutor en las cuatro Server Actions; `supabase` sigue default. Error/timeout no dispara fallback ni reenvío. La página ADMIN reutiliza detalle/grupo migrados según sus propias banderas; `/check-in` mantiene Auth SSR temporal. Una respuesta incierta permite reintento explícito con QR vigente: la RPC preserva el registro anterior.

[Seguro] Los códigos anteriores al cambio de transporte son compatibles directamente, con los mismos UUID, base, clave y tramo UTC. La firma y claves permanecen en PostgreSQL; este entregable no elimina/rota claves. Si un corte futuro mueve PostgreSQL, debe transferir íntegro `app_private.qr_checkin_keys` en backup cifrado/acceso operador o detener emisión de ambos transportes y agotar 60 segundos desde la última emisión confirmada antes de retirar claves antiguas; nunca aceptar tramo anterior/futuro ni alargar ventana. Verificar drenaje de peticiones en curso y una única base escritora según #166 antes de activar destino.
