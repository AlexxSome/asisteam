# MIG-01 · Runtime, SQL e integraciones

[Seguro] Inventario estático del commit `ecf2864955cae6b692f98bbcd992d5f1085755e0`, 2026-10-06. [Seguro] Producción y usuarios reales no están confirmados; en esta revisión no se accedió a consolas, secretos ni datos de proveedores. **VERIFICADO_LOCAL** describe código/config versionados; **PENDIENTE** describe ensayos y acuerdos aún sin evidencia.

## Seis Edge Functions

[Seguro] Cada entrypoint existente se enlaza debajo. [Probable] Todos los destinos, DTO de transporte y pruebas de migración son propuestas; responsable: desarrollador asignado, con revisión de producto/operación pendiente. La cola, locks y RPC transaccionales se conservan hasta probar su reemplazo.

| Edge y consumidor actual | Destino propuesto / DTO / autorización | SQL y efecto conservados | Prueba de origen y gate de destino |
| --- | --- | --- | --- |
| [send-invitation](../../../supabase/functions/send-invitation/index.ts): INT-04 y activación MANAGED desde Server Action | `POST /api/v1/groups/{groupId}/invitations`; acciones send/resend/activate, request schema actual; JWT verificado + ADMIN ACTIVE | `issue_invitation`/`issue_managed_activation`; token aleatorio hasheado, expiración 7 días, 50 envíos/día/grupo Chile, histórico/reenvío; Resend con idempotencia. Fallo de email puede dejar PENDING, nunca anunciar envío confirmado | [Handler](../../../apps/web/src/app/groups/%5BgroupId%5D/invitations/new/send-invitation.test.ts), [integración](../../../apps/web/src/app/groups/%5BgroupId%5D/invitations/new/send-invitation.integration.test.ts), [pgTAP](../../../supabase/tests/send_invitations.test.sql); repetir permisos/rate limit/carrera/503 sin correos reales · #153 |
| [accept-invitation](../../../supabase/functions/accept-invitation/index.ts): AUT-05/06 vía proxy Next | `POST /api/v1/invitations/{token}/actions`; preview/register/claim/accept, DTO actual; proxy de confianza + destinatario/token; accept además JWT/términos | consume attempt, context, prepare/cancel registration, result y accept; autorización efímera + trigger GoTrue transaccional; menor y MANAGED conservan consentimientos diferenciados | [Acciones](../../../apps/web/src/app/invitations/%5Btoken%5D/actions.test.ts), [integración](../../../apps/web/src/app/invitations/%5Btoken%5D/invitation.integration.test.ts), [pgTAP](../../../supabase/tests/invitations.test.sql); en Nest reemplazar vínculo GoTrue sin alta parcial de credenciales · #153/#164 |
| [guardianship-majority](../../../supabase/functions/guardianship-majority/index.ts): despacho privado pg_cron/pg_net | Worker privado, sin endpoint de producto; DTO interno de deliveries; rol job con grants mínimos | `run_guardianship_majority`, claim/complete emails; lock/ledger diario, vínculo INACTIVE histórico y retiro de acceso; Resend se reintenta independientemente de la baja | [Handler](../../../apps/web/src/lib/guardianship-majority.test.ts), [pgTAP](../../../supabase/tests/my_wards.test.sql); probar DST, mayoría, duplicados, caída de correo y lease · #157 |
| [subscription-billing](../../../supabase/functions/subscription-billing/index.ts): pantalla billing ADMIN | `POST /api/v1/groups/{groupId}/billing/actions`; checkout/sync/cancel, schema estricto actual; JWT verificado + ADMIN | begin/context/claim/reject, lookup/sync subscription/invoice; precio CLP y cupo del servidor; creación incierta se concilia, AUTHORIZED no prueba pago | [Handler](../../../apps/web/src/lib/subscription-billing.test.ts), [integración](../../../apps/web/src/lib/subscription-billing.integration.test.ts), [pgTAP](../../../supabase/tests/group_subscriptions.test.sql); sandbox real del proveedor pendiente, sin cobrar · #158 |
| [mercadopago-webhook](../../../supabase/functions/mercadopago-webhook/index.ts): Mercado Pago | `POST /api/v1/webhooks/mercadopago`; DTO actual de evento; HMAC/request-id/ts/data.id, sin JWT usuario | lookup, consulta API MP y sync de ledger; importe/moneda/collector se comprueban en proveedor, no en payload; repetidos y desorden preservan pagos | Mismos handler/integración y pgTAP billing; firma inválida, timeout/replay/desorden y cambio URL de contratos anteriores · #158 |
| [send-announcement-push](../../../supabase/functions/send-announcement-push/index.ts): despacho privado pg_cron/pg_net | Worker privado; DTO de reserva/recibo; rol job separado | claim/complete/record run; lease, opt-in, tokens activos, tickets/receipts Expo y backoff. No sustituir transporte por FCM/APNs en esta épica | [Handler](../../../apps/web/src/lib/announcement-push.test.ts), [integración](../../../apps/web/src/lib/announcements.integration.test.ts), [pgTAP](../../../supabase/tests/group_announcements.test.sql); proveedor/device real pendiente y no duplicar ejecutor · #159 |

## SQL y portabilidad

[Seguro] [inventory.json](inventory.json) enumera las **33 migraciones**, sus funciones/tablas/vistas/extensiones/dependencias y SHA-256. Contiene las **150 declaraciones y 121 nombres únicos** de función, tomando la última declaración del mismo nombre por orden de migración; este conteo no resuelve sobrecargas ni prueba catálogo aplicado. También enumera los **33 archivos pgTAP** y las referencias textuales de cada función. Funciones sin llamada web no se presentan como nuevas pantallas.

| Dependencia local | Tratamiento propuesto / responsable |
| --- | --- |
| [Seguro] `auth.users`, `auth.uid()`, FK, `handle_new_user` y metadata de registro/invitación/términos | [Probable] #149/#150/#164: adaptador temporal y sustitución de triggers/FK por identidad propia con UUID conservados; probar registro transaccional, MANAGED e identidad social. Desarrollador asignado. |
| [Seguro] `storage.buckets`/`storage.objects`, `can_read_avatar` y `can_upload_avatar` | [Probable] #161: permisos desde API + S3 privado, mapa de propietarios, transferencia/checksum y revocación de imagen; Storage antes de Auth. Desarrollador asignado. |
| [Seguro] `pgcrypto` declarado; HMAC y bytes aleatorios existentes | [Probable] #150/#160/#165: comprobar versión/extensión en PostgreSQL 17 destino y preservar firma/ventana QR; nunca enviar claves de `app_private.qr_checkin_keys`. Desarrollador asignado. |
| [Seguro] `pg_cron`, `pg_net` declarados y consultas `vault.decrypted_secrets` | [Probable] #157/#159: trasladar agenda/despacho y configuración a worker; mantener funciones de dominio/ledger. No suponer que Vault/pg_net están disponibles en RDS. Desarrollador asignado. |
| [Seguro] Helpers/RLS/SECURITY DEFINER, grants, constraints, triggers, métricas y límites | [Probable] #149/#150/#165: conservar/adaptar con roles reales no propietarios/NOBYPASSRLS, search_path y SQL↔core, V1–V6/R1, COACH/multirol y pooling. Desarrollador asignado. |

## Jobs realmente versionados

| Job | Agenda y evidencia local | Efecto / propuesta |
| --- | --- | --- |
| [Seguro] `guardianship-majority` | [Migración](../../../supabase/migrations/20260928010000_my_wards.sql): cron `*/10 * * * *`; dispatcher no actúa antes de 00:30 America/Santiago; run_date chilena y `job_runs` evitan reprocesar dominio | [Probable] Worker reproduce agenda, ledger y reintentos de email; validar DST y fallos antes de desactivar cron. |
| [Seguro] `send-announcement-push` | [Migración](../../../supabase/migrations/20261003030000_group_announcements.sql): cron `* * * * *`; solo despacha pendientes/receipts vencidos | [Probable] Worker preserva reservas/leases y recibos; el corte debe dejar un único ejecutor. |

[Seguro] No hay otro `cron.schedule` en las 33 migraciones. Los objetivos documentados de cron diario de expiración de invitaciones y `send-push` de ausencia no tienen job/Edge equivalente en este inventario; la aceptación/contexto sí comprueban expiración de invitaciones. [Probable] Preservar ese comportamiento existente y registrar los trabajos pendientes por separado, sin inventar que los objetivos P1 se entregaron.

## Storage y configuración por nombre

[Seguro] La [migración de perfil](../../../supabase/migrations/20260921010000_profile_and_birthdate_approvals.sql) declara solo el bucket **avatars**, privado, límite **2.097.152 bytes**, JPEG/PNG/WebP. La subida comprueba bytes/MIME, guarda ruta con Auth UUID, compensa si falla el perfil y elimina imagen anterior; el proxy entrega imágenes autorizadas con `private, no-store` y 404 indistinguible. Logos son `groups.logo_url`; no hay bucket de logos acreditado por las migraciones.

[Seguro] Los siguientes nombres salen de archivos TS identificados por el grafo y de [config.toml](../../../supabase/config.toml); nunca se leyó un archivo `.env` ni el valor de un secreto desplegado. La presencia del nombre no demuestra configuración activa. `inventory.json.environment` incluye fuente y línea.

| Nombres / ámbito actual | Destino propuesto y estado |
| --- | --- |
| [Seguro] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | [Probable] Compatibilidad temporal; retirar al finalizar. La anon key es pública; service_role sigue privada y luego se sustituye por rol mínimo, nunca cliente. |
| [Seguro] `ASISTEAM_SITE_URL`, `NODE_ENV` | [Probable] Origen explícito/config de proceso; valores no secretos; mantener allowlist/cookies por entorno. |
| [Seguro] `INVITATION_PROXY_SECRET`, `INVITATION_ALLOWED_ORIGINS`, `INVITATION_WEB_URL` | [Probable] Proxy/allowlist/link del entorno; secreto solo en servidor y validar IP de proxy confiable. |
| [Seguro] `RESEND_API_KEY`, `INVITATION_EMAIL_FROM` | [Probable] API/worker privado con remitente verificado; Resend sandbox/entrega real PENDIENTE. |
| [Seguro] `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_COLLECTOR_ID`, `BILLING_WEB_URL`, `BILLING_WEBHOOK_URL`, `BILLING_ALLOWED_ORIGINS` | [Probable] Configurar servidor/worker y webhook nuevo tras ensayo; collector/URL no son credenciales; valores/secrets separados por entorno. |
| [Seguro] `EXPO_ACCESS_TOKEN` | [Probable] Worker de anuncios conserva Expo; FCM/APNs siguen fuera. |
| [Seguro] `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`, `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` | [Probable] Migrar OAuth en #163 con callback/origen verificados; config local tiene ambos providers deshabilitados y no demuestra configuración externa. |
| [Seguro] Vault: `guardianship_majority_url`, `guardianship_majority_key`, `announcement_push_url`, `announcement_push_key` | [Probable] Retirar despachos/secrets Vault solo tras activar el ejecutor independiente y drenar entregas; no copiar service_role como clave del nuevo sistema. |

[Seguro] `config.toml` fija PostgreSQL 17, API máximo 100 filas, JWT 3.600 s y refresh rotatorio; recovery 3.600 s, password mínimo diez caracteres y plantilla. `verify_jwt=false` está declarado para accept-invitation/send-invitation/send-announcement-push, cuyos handlers verifican identidad o acceso privado internamente. El archivo local no configura los proyectos cloud.

## Mercado Pago: cambio de URL aún sin certificar

[Seguro] El [handler billing](../../../supabase/functions/subscription-billing/handler.ts) envía `notification_url` desde `BILLING_WEBHOOK_URL` al crear una preapproval. El [adaptador](../../../supabase/functions/subscription-billing/provider.ts) implementa consulta/creación/cancelación/recuperación, pero no actualización de URL de un contrato existente. Cambiar una variable de entorno solo cambia las creaciones posteriores en este código.

[Seguro] Se intentó consultar la referencia oficial [PUT preapproval](https://www.mercadopago.cl/developers/es/reference/subscriptions/_preapproval_id/put) y [POST preapproval](https://www.mercadopago.cl/developers/es/reference/subscriptions/_preapproval/post) el 2026-10-06; el acceso devolvió 403. No se efectuó una actualización ni una llamada autenticada al proveedor. Por ello **no está verificado** si puede trasladarse la URL de contratos anteriores ni si la configuración de aplicación la reemplaza.

[Probable] #158 debe crear un contrato de sandbox con URL antigua, consultar destino efectivo, ensayar mecanismo admitido por el proveedor, y demostrar que eventos de renovación/pagos llegan al receptor nuevo y conservan ledger. Registrar únicamente ID sintético redactado, método, entorno y resultado; consultar soporte si la API no admite actualización. No cancelar/recrear contratos reales para resolverlo por inferencia.

[Seguro] La existencia de producción, usuarios y contratos reales no está confirmada. [Probable] Si se confirma ausencia de contratos reales en la cuenta al habilitar billing, la primera contratación debe usar el webhook nuevo y este riesgo de contratos anteriores será no aplicable para ese corte; falta esa verificación de cuenta. Si algún contrato sigue dependiendo de Supabase, conservar el receptor antiguo prolonga convivencia y bloquea afirmar salida completa.
