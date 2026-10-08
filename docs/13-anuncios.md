# Anuncios de grupo — HU-ADM-22 / #57

El alcance autorizado (#57) incluye muro y gestión web más infraestructura de notificaciones Expo ya implementada. No incluye la app móvil, Web Push, comentarios, adjuntos, recordatorios de actividades ni avisos de ausencias. **Cambio de planificación 2026-10-05:** el cliente futuro será nativo (Java/Android y Swift/iOS), así que recibir anuncios requiere migrar el registro de tokens y el envío Expo a FCM/APNs. Este documento describe la implementación actual mientras no se completa esa migración.

## Muro y permisos

- Ruta `/groups/:groupId/announcements`, disponible desde la navegación de cada grupo.
- Todos los roles ACTIVE leen; solo ADMIN ACTIVE publica, edita y elimina. Los toggles de estadísticas no afectan anuncios.
- Título 1–120 y cuerpo 1–5000 caracteres, texto plano escapado en React. Sin datos del autor/destinatarios en el DTO ni consultas abiertas a `users`.
- Fechas UTC, presentación `America/Santiago`. Paginación de 50 filas, orden descendente por fecha y UUID.
- Borrado lógico y versión `updated_at` exacta para evitar sobrescribir o eliminar cambios de otro administrador. Para resolver 409, actualizar el muro y volver a abrir la edición.
- La página no usa caché persistente. Refresca al recuperar foco, cada 30 segundos mientras esté visible y con «Actualizar muro».
- Publicación y cola son transaccionales. El cliente conserva el UUID `p_request_id` al reintentar una publicación incierta; mismo ID/datos devuelve la misma publicación, otro contenido produce 409. Editar no emite otro push.

## Contrato de la implementación actual Expo (transitorio)

1. Configurar credenciales APNs/FCM y obtener el `ExpoPushToken` del proyecto después del permiso del sistema operativo.
2. Con JWT del usuario, llamar `register_announcement_push_token(p_token,p_platform)` con `IOS` o `ANDROID`. Registrar no habilita automáticamente los avisos.
3. Tras consentimiento explícito, llamar `set_announcement_push_enabled(true)`. La preferencia abarca todos los grupos del usuario y puede cambiarse desde el muro web. Su valor inicial es false.
4. Desregistrar el token mediante `unregister_announcement_push_token` **antes de cerrar sesión**. Un token activo nunca se reasigna a otra cuenta; desregistrado puede vincularse a la siguiente cuenta del dispositivo. Repetir registro propio actualiza `last_seen_at`.
5. Al tocar el push, usar `data.url` (`/groups/:groupId/announcements#id`) o sus IDs y volver a consultar con la sesión actual. Un usuario sin membresía vigente no puede leer el anuncio aunque conserve la notificación.

El usuario puede tener varios dispositivos; la cola deduplica por anuncio/dispositivo, independientemente de sus roles. Al publicar solo se incluyen dispositivos activos con opt-in y membresía ACTIVE. Registrarse/habilitar avisos después no dispara notificaciones históricas.

La pantalla bloqueada recibe un texto genérico. El título/cuerpo redactados por ADMIN nunca viajan a Expo; el payload lleva solo tipo, grupo, anuncio y ruta relativa. Tokens y respuestas del proveedor no se registran en logs.

## Cola y garantías

`app_private.announcement_push_deliveries` no está expuesta por PostgREST. Las RPC de worker se conceden exclusivamente a service_role.

- `PENDING` → `AWAITING_RECEIPT` cuando Expo devuelve ticket.
- `AWAITING_RECEIPT` → `DELIVERED` cuando APNs/FCM acepta según el recibo Expo. Esto no prueba lectura ni recepción física en el dispositivo.
- `CANCELLED` si el anuncio se elimina, se apaga opt-in, se desregistra/reasigna el token o se pierde la membresía antes de reservar el envío.
- `FAILED` ante error permanente, seis intentos agotados o recibo no disponible durante 23 horas.

Reserva máxima de 10 filas con `FOR UPDATE SKIP LOCKED`, lease de dos minutos y ACK por token de reserva. Hasta cinco conexiones concurrentes, una petición por dispositivo para aislar errores de proyecto. Timeout HTTP de 10 s, backoff exponencial desde dos minutos; un fallo al consultar recibos conserva el ticket sin reenviar el push. Recibos a partir de 15 minutos y cada 15 minutos si aún no están disponibles. `MessageRateExceeded` permite reenvío con backoff; `DeviceNotRegistered` desactiva el token.

La unicidad y los leases evitan duplicados por reintentos de publicación y workers concurrentes. Expo no proporciona una transacción compartida con nuestra DB: un timeout ambiguo o caída entre aceptación y ACK puede causar duplicado. Se envían `collapseId` y `tag` estables para reducirlo. No se promete entrega exactamente una vez. Un push ya aceptado por Expo no puede retirarse por editar/borrar o apagar avisos; el muro siempre verifica el permiso y contenido actuales.

`job_runs` registra las ejecuciones completadas por día chileno y la cantidad de transiciones aceptadas/confirmadas, sin PII. Un mismo aviso puede aportar dos transiciones (ticket y recibo); no es una métrica de usuarios ni de lecturas. Los fallos terminales quedan en la cola para diagnóstico del operador; no se reactivan automáticamente.

## Despliegue

1. Aplicar migraciones y regenerar tipos con el flujo habitual del entorno. La migración registra `pg_cron` cada minuto; sin secretos Vault permanece inactivo.
2. Desplegar `supabase functions deploy send-announcement-push`. El handler exige `SUPABASE_SERVICE_ROLE_KEY` aunque el gateway tenga `verify_jwt=false`; nunca compartir esa clave con clientes.
3. Configurar en Vault, mediante el dashboard/gestor de secretos del entorno:
   - `announcement_push_url`: URL HTTPS del proyecto + `/functions/v1/send-announcement-push`.
   - `announcement_push_key`: clave service_role del mismo proyecto.
4. Configurar el proyecto Expo y credenciales APNs/FCM. Si se habilita la seguridad mejorada de Expo Push, establecer `EXPO_ACCESS_TOKEN` como secreto de la Edge Function.
5. Con un dispositivo de prueba vinculado y opt-in, publicar en un grupo sintético, verificar ticket/recibo, navegación, desregistro y opt-out. No usar información real de menores para pruebas.

No se despliegan funciones ni secretos en producción como parte de este PR. El muro web puede utilizarse tras desplegar aplicación/migración; para recibir push se necesita el cliente Expo que registre dispositivos y las credenciales anteriores. No hay alta de dispositivos ni notificaciones de navegador en esta entrega.

Consulta operativa sin PII (solo SQL de operador):

```sql
select status, failure_code, count(*)
from app_private.announcement_push_deliveries
group by status, failure_code;
select job_name, run_date, completed_at, affected_count
from public.job_runs where job_name = 'send-announcement-push';
```

## Validación local

```sh
pnpm exec supabase migration up --local
pnpm exec supabase test db
pnpm test
pnpm typecheck
pnpm --filter @asisteam/web build
RUN_ANNOUNCEMENT_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run announcements.integration.test.ts
```

La integración usa Auth/PostgREST/SQL reales y transporte Expo simulado para no enviar a dispositivos reales. Los fixtures sintéticos se eliminan al terminar. pgTAP verifica permisos, aislamiento, estados de membresía, idempotencia, versiones y cola; Vitest verifica schemas, acciones, XSS, formularios y errores/tickets/recibos de Expo.

Fuente primaria del protocolo y sus límites: [Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/).


## MIG-15 (#159): transporte Nest y worker Expo

[Seguro] [Contrato, handoff y evidencia](migration/issue-159/README.md) sustituyen el despliegue Edge descrito arriba al activar WORKER. La instalación mantiene LEGACY y sus firmas públicas; se exige retirar/drenar Edge y pg_net antes de constancia de operador y activación SQL. El consumidor web usa ANNOUNCEMENTS=nest y SDK; tokens Expo se registran/desregistran por `/api/v1/me/announcement-push/tokens`, opt-in por `/api/v1/me/announcement-push`, exclusivamente propia sesión. Worker usa asisteam_jobs sin tablas/BYPASSRLS y motor Expo compartido. Protocolo, límites y advertencia de timeout ambiguo se conservan; FCM/APNs nativos y dispositivos web continúan fuera del alcance. Expo real/corte externo requieren evidencia aparte.
