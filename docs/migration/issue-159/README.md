# MIG-15 · Anuncios, preferencias y Expo en Nest (#159)

[Seguro] Base `3e96b76f5ac631a532fe71d3ca12d936a9c15c7b` de `origin/develop`; rama `codex/159-anuncios-push-nest`. Entorno local sintético, 2026-10-07/08, macOS arm64, Node24.16.0/pnpm10.33.2 y PostgreSQL17 del stack Supabase. Dependencias #148/#149/#151/#157 cerradas e integradas. Graphify actualizado sobre la base; se preserva el cambio ajeno de next-env.d.ts en el checkout original.

## Contrato y consumidores

[Seguro] [Controlador Nest](../../../apps/api/src/announcements.ts) y OpenAPI/SDK desde core implementan ocho operaciones: GET/POST `/api/v1/groups/:groupId/announcements`, PATCH/DELETE `/:announcementId`, GET/PATCH `/api/v1/me/announcement-push`, POST/DELETE `/tokens`. Los DELETE reciben JSON estricto (versión o token). Sesión/perfil/consentimiento vigentes; ADMIN ACTIVE publica/gestiona y todos los roles ACTIVE leen por RPC/RLS canónicas. Ajeno, PENDING e INACTIVE no enumeran contenido. Preferencias/existencia de dispositivos son propias; los DTO no incluyen tokens, autores ni destinatarios. UUID de publicación preserva idempotencia; fechas HTTP UTC conservan seis decimales para la versión exacta. Editar no genera otro push, borrar es lógico.

[Seguro] Next selecciona ANNOUNCEMENTS=nest en loader y cuatro Server Actions, sobre la misma DB; no-store, cookies SSR y credenciales solo servidor. Error/timeout no muestra éxito ni ejecuta fallback. La web conserva publicación, edición, confirmación de eliminación, borrador, refresh30s/foco, paginación50, fechas Chile y opt-in global explícito default false. No agrega rutas/clientes móviles ni dispositivos de navegador.

## Worker y reglas existentes

[Seguro] [Motor Expo compartido](../../../packages/core/src/announcement-push.ts) conserva el protocolo de la Edge sin dependencia Supabase en Node; la Edge mantiene autenticación service_role. El [worker Nest](../../../apps/worker/src/announcements.ts) usa exclusivamente RPC privadas con rol `asisteam_jobs` sin ownership/BYPASSRLS ni tablas. Límite10 por reserva, lease2min/SKIP LOCKED, hasta5 conexiones de proveedor, timeout10s y origen HTTPS Expo fijo sin redirects; recibos desde15min y sin reenvío al fallar consulta. Opt-out, desregistro/pérdida de membresía y borrado cancelan pendientes; DeviceNotRegistered invalida el token propio. Seis intentos máximo, backoff exponencial y23h de límite de recibos. ACK del worker requiere token y lease vigente; el nuevo claim cerca al proceso anterior. Se conserva `job_runs` y la cola histórica.

[Seguro] La integración del contrato de retry detectó una llamada heredada `make_interval(secs=...)` que no persistía el backoff al completar un error. La migración corrige la función canónica privada a `secs=>...`; el caso HTTP503 comprueba PENDING/attempts1 y fecha futura contra el reloj PostgreSQL, ningún envío antes del plazo y aceptación tras adelantar exclusivamente el fixture. No cambia la política de seis intentos ni el intervalo original.

[Seguro] Dos réplicas no reservan el mismo efecto concurrentemente. Expo carece de transacción/idempotency key compartida con PostgreSQL: aceptación seguida de caída/pérdida de ACK o timeout ambiguo puede duplicar un push al recuperar el lease. Se conservan collapseId/tag estables para reducirlo; **no se promete exactly-once ni recepción física/lectura**. DELIVERED significa recibo de aceptación de APNs/FCM por Expo. Un mensaje ya aceptado no puede retirarse; leer el muro vuelve a autorizar.

## Configuración y handoff

[Seguro] La [migración](../../../supabase/migrations/20261008030000_announcement_worker.sql) instala LEGACY. Compilar/iniciar worker no corta el scheduler. API usa DATABASE_URL/asisteam_api y worker DATABASE_URL/asisteam_jobs sobre la misma DB. EXPO_ACCESS_TOKEN opcional privado del worker si el proyecto exige seguridad mejorada. Provisionar LOGIN/clave/TLS en gestor externo; runtime nunca usa postgres/service_role. ASISTEAM_TRANSPORT_ANNOUNCEMENTS=nest cambia solo el consumidor web; el ejecutor de efectos lo decide SQL.

[Seguro] Procedimiento de operador por entorno, previo a activar el worker:

1. Aplicar migración, configurar y verificar el artefacto/egress Expo, rol mínimo y monitor. Mantener LEGACY mientras se valida.
2. Ejecutar `select app_private.announcement_handoff('DRAINING');`. SQL obtiene lock exclusivo del estado, espera transacciones de claims anteriores y retira únicamente cron `send-announcement-push`. El dispatcher directo también deja de contactar pg_net. Nuevos claims LEGACY fallan; sus ACK/ledger finales aún pueden terminar en DRAINING. Worker no reclama.
3. Retirar/deshabilitar **todas** las versiones/instancias de Edge `send-announcement-push` y bloquear invocaciones directas. Comprobar drenaje de solicitudes pg_net, instancias suspendidas y HTTP/DB/Expo ya en curso. Registrar evidencia de retirada/ausencia de solicitudes y conciliar tickets/recibos o aceptación incierta sin publicar tokens/respuestas. **No activar mientras siga un proceso/enviado incierto sin conciliar**. El plazo no demuestra quiescencia externa.
4. Esperar al menos3min desde DRAINING; lease2min más margen del lote10/5 conexiones con timeout10s. SQL exige además ausencia de cron y leases activos. Estas verificaciones no sustituyen el punto3.
5. Tras acreditar retirada/drenaje, ejecutar `select app_private.announcement_handoff('WORKER',true);`. El booleano es constancia del operador, no verificación automática de procesos externos. SQL registra draining_since/activated_at/mode. Conservar commit/digest/entorno, evidencia del punto3, consulta cron y timestamps como evidencia operativa redactada. Jobs/API/cliente no pueden ejecutar handoff ni el motor canónico directamente.
6. Iniciar/continuar worker; verificar ticket→recibo, opt-out y backlog sintético. En WORKER claims/ACK/ledger antiguos están cercados. Si falla el artefacto, detener/restaurar worker compatible manteniendo DB/cola/ledger y recuperar leases: no volver a LEGACY con una bandera ni restaurar snapshot anterior a escrituras.

[Seguro] Cada tick publica únicamente contadores pending/failed/oldest_seconds. Eventos `push_failed` ante fallo del tick y `push_backlog` ante terminales o antigüedad>600s; alertar también por ausencia de push_tick/push_backlog durante120s. No registrar contenido, tokens, SQL, errores o respuestas Expo. El monitor externo y su destinatario se configuran en despliegue; no se infieren de pruebas locales.

## Verificación y límites

[Seguro] Reproducción desde raíz, en secuencia cuando las suites modifican credenciales/mode del mismo stack local:

```sh
pnpm ci:checks
pnpm ci:backend
API_RLS_TEST=1 pnpm --filter @asisteam/api exec node --test test/announcements.integration.mjs
pnpm exec supabase test db supabase/tests/announcement_worker.test.sql supabase/tests/group_announcements.test.sql
ASISTEAM_QA_NEST=1 pnpm --filter @asisteam/web test:e2e:full --grep MIG-15
docker build -f apps/worker/Dockerfile -t asisteam-worker:issue159 .
WORKER_IMAGE=asisteam-worker:issue159 pnpm --filter @asisteam/worker exec node test/container-smoke.mjs
```

[Seguro] HTTP/SQL usa siete identidades sintéticas, roles ADMIN/ATHLETE/GUARDIAN/COACH/multirol/PENDING/sin consentimiento; proveedor **HTTP local que simula Expo**, dos contextos Nest y proceso separado que cae tras reservar. La limpieza elimina exclusivamente sus UUIDs; session_replication_role=replica existe solo en conexión operador durante teardown sintético y se restaura a origin en finally. No se alteran triggers append-only ni se desactivan invariantes en las operaciones probadas. No ejecutar con una cola local ajena pendiente: falla antes de cambiarla.

| Check | Resultado |
| --- | --- |
| CI checks: lint/contrato/tipos/build/unitarias | PASS:150 core,895 web;81 opt-in omitidas aquí, ejecutadas por backend aparte |
| Unitarias directamente afectadas | PASS30:15 motor Expo,9 acciones legacy,6 adaptadores Nest |
| pgTAP handoff/ACL + reglas canónicas | PASS102 (29+73),0 omitidas |
| HTTP/PostgreSQL/dos workers | PASS1 escenario completo,0 omitidas; incluye proceso separado que cae tras claim y recuperación por otra réplica |
| Backend completo / tipos / portabilidad | Módulos HTTP/worker/tipos PASS; portabilidad PG17.9 PASS, fallo inyectado esperado y limpieza PASS; backend FAIL únicamente pgTAP global ajeno |
| Integraciones Edge separadas | PASS81/81,0 omitidas,54.12s |
| E2E muro375px/teclado/axe | PASS1/1,0 omitidas,8.5s (total15.8s); Chromium/Next→Nest→PostgreSQL real, ADMIN/ATHLETE |
| Contenedor worker y SIGTERM | PASS: rol jobs mínimo, ambos ticks, solo lectura, exit0; imagen sha256:8869f85e19f86fbcc27710163b4ac9fc4af1faaf8ce66c27bc9e4a13e572bcfb |
| CI remoto | PENDIENTE; no acreditado por checks locales |
| Expo/APNs/FCM reales y handoff externo | PENDIENTE; sin proyecto/dispositivo/credenciales sintéticos configurados para proveedor externo |

[Seguro] La integración local no acredita proveedor real, retirada Edge ni despliegue cloud. La aceptación externa exige dispositivo sintético y credenciales Expo/APNs/FCM: envío/recibo/DeviceNotRegistered, opt-out, navegación con membresía revocada y evidencia del handoff. FCM/APNs nativos, móvil, Web Push, offline y nuevas features siguen fuera de este entregable. El PR no ejecuta corte, merge ni cierra el issue.

[Seguro] El fallo global preexistente es `supabase/tests/send_invitations.test.sql` #15, «rechazos no consumen cuota»: count global1/esperado0,50/51 assertions PASS. Se reprodujo con el archivo exacto de la base `3e96b76`: `git show 3e96b76:supabase/tests/send_invitations.test.sql > /tmp/issue159-base-send-invitations.test.sql`, seguido de `pnpm exec supabase test db /tmp/issue159-base-send-invitations.test.sql`. [MIG-14](../issue-158/README.md) ya identifica la cuota ajena del fixture QA120 y demuestra la causa dentro de BEGIN/ROLLBACK. Este issue no escribe cuotas de invitación, altera ese test ni elimina el fixture ajeno. Las81 Edge se ejecutaron separadas tras el stop del gate. El gate global requerido no está acreditado: PR draft para revisión, merge/corte bloqueados hasta verde global y validación externa.

[Seguro] Auto-revisión contra la base conservó mensajes de autenticación legacy y microsegundos de updated_at, corrigió el backoff SQL dentro del contrato migrado y evita iniciar un nuevo tick push tras señal de apagado. La prueba de checkbox usa teclado y espera el acuse HTTP: el control no presenta éxito anticipado. Limpieza y triggers se restauran; diff no incluye next-env.d.ts ni cambios ajenos. Los checks afectados se repiten después de esas correcciones.

[Seguro] Evidencia sanitizada del diff sobre la base: [checks](checks.json), [backend](backend.json), [Edge](edge.json); contienen únicamente entorno/commit fuente/resultado/duración/conteos, nunca logs crudos ni payloads. La auto-revisión final y smoke/lint afectados pasan.
