# Anuncios de grupo — HU-ADM-22 / #57

[Seguro] Vigencia MIG-24 (#168, 2026-10-10): Nest/Node24, PostgreSQL17 independiente, Auth propio y S3 privado son el único stack del repositorio. Dominio, RLS/V1–V6, menores, consentimientos y métricas se mantienen. [Evidencia y aceptación externa](migration/issue-168/README.md). Producción continúa NO-GO; no ejecutar corte/deploy real ni apagar receptores remotos.


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

`app_private.announcement_push_deliveries` no está expuesta por Nest → SQL/RLS. Las RPC de worker se conceden exclusivamente a asisteam_jobs.

- `PENDING` → `AWAITING_RECEIPT` cuando Expo devuelve ticket.
- `AWAITING_RECEIPT` → `DELIVERED` cuando APNs/FCM acepta según el recibo Expo. Esto no prueba lectura ni recepción física en el dispositivo.
- `CANCELLED` si el anuncio se elimina, se apaga opt-in, se desregistra/reasigna el token o se pierde la membresía antes de reservar el envío.
- `FAILED` ante error permanente, seis intentos agotados o recibo no disponible durante 23 horas.

Reserva máxima de 10 filas con `FOR UPDATE SKIP LOCKED`, lease de dos minutos y ACK por token de reserva. Hasta cinco conexiones concurrentes, una petición por dispositivo para aislar errores de proyecto. Timeout HTTP de 10 s, backoff exponencial desde dos minutos; un fallo al consultar recibos conserva el ticket sin reenviar el push. Recibos a partir de 15 minutos y cada 15 minutos si aún no están disponibles. `MessageRateExceeded` permite reenvío con backoff; `DeviceNotRegistered` desactiva el token.

La unicidad y los leases evitan duplicados por reintentos de publicación y workers concurrentes. Expo no proporciona una transacción compartida con nuestra DB: un timeout ambiguo o caída entre aceptación y ACK puede causar duplicado. Se envían `collapseId` y `tag` estables para reducirlo. No se promete entrega exactamente una vez. Un push ya aceptado por Expo no puede retirarse por editar/borrar o apagar avisos; el muro siempre verifica el permiso y contenido actuales.

`job_runs` registra las ejecuciones completadas por día chileno y la cantidad de transiciones aceptadas/confirmadas, sin PII. Un mismo aviso puede aportar dos transiciones (ticket y recibo); no es una métrica de usuarios ni de lecturas. Los fallos terminales quedan en la cola para diagnóstico del operador; no se reactivan automáticamente.

## Runtime y operación vigente

[Seguro] Worker Node/asisteam_jobs es el único ejecutor, con leases/ledger durables y motor Expo canónico. API propia registra/desregistra token y opt-in de la sesión; no hay cron/Vault/Edge del origen. Se conserva retry/recibos/device-not-registered/privacidad; reintento de ACK no reenvía mensajes aceptados.

[Seguro] EXPO_ACCESS_TOKEN es secreto del Worker si el entorno lo requiere. Expo es transporte transitorio autorizado #57; Java/Swift/FCM/APNs y dispositivos reales siguen fuera del retiro técnico. Recibos/provisión externa pendientes según matriz #168; no ejecutar deploy real ni habilitar notificaciones a dispositivos por inferencia.

## Validación local

```bash
pnpm ci:checks
pnpm ci:backend
pnpm ci:extended
```

[Seguro] Pruebas HTTP/SQL nativas y dos workers concurrentes preservan permisos, tenant, versiones, cola, crash/lease/ACK/retry/recibos. Unitarias conservan los15 casos del motor. Solo transporte Expo es sintético; bases propias se desechan al finalizar. [Evidencia #168](migration/issue-168/README.md).
