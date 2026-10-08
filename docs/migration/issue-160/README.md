# MIG-16 · QR y llegada propia en Nest (#160)

[Seguro] Base `35c0520eb6484014a55802ddd9c21e588994fa83` de `origin/develop`; rama `codex/160-qr-llegada-nest`. Entorno local sintético, 2026-10-08, macOS arm64, Node24.16.0/pnpm10.33.2/PostgreSQL17 del stack Supabase. Las dependencias #148/#149/#154/#155 están cerradas e integradas. Graphify actualizado antes de localizar código; único cambio ajeno inicial `apps/web/next-env.d.ts` excluido y preservado. El commit final se obtiene del PR; los JSON conservan la base fuente y los checks sobre el diff pendiente.

## Operaciones y seguridad

| Método/ruta HTTP | SDK | RPC canónica/permiso |
| --- | --- | --- |
| GET `/api/v1/groups/:groupId/check-in-settings` | getQrSettings | get_qr_checkin_settings / ADMIN ACTIVE |
| PUT misma ruta | setQrSettings | set_qr_checkin_settings / ADMIN ACTIVE |
| POST `/api/v1/activities/:activityId/check-in-qr` | issueCheckinQr | issue_activity_checkin_qr / ADMIN ACTIVE |
| POST `/api/v1/me/check-in` | selfCheckin | self_checkin / ATHLETE ACTIVE propio |

[Seguro] [Controlador](../../../apps/api/src/qr.ts), schemas core y SDK/OpenAPI generados usan la sesión temporal de MIG-05 y una transacción `Database.authenticated` con rol `asisteam_api`, consentimiento de cuenta vigente y actor obtenido de la sesión verificada. No existe endpoint genérico SQL ni actor/membership/estado/hora/claves en body de llegada. Las RPC autorizan nuevamente el rol y grupo dentro de SQL; COACH no configura/emite, GUARDIAN/ADMIN sin ATHLETE no registran llegada. PENDING/INVITED/INACTIVE/ajeno tienen 404 anti-enumeración; multirol registra la membership ATHLETE propia.

[Seguro] No cambia SQL/RLS/esquema/tipos DB. El rol API hereda el grant authenticated ya existente y no lee claves ni tablas privadas. HMAC-SHA256 por actividad/tramo UTC60s, clave256bits, reloj PostgreSQL tras locks y ventana/umbral exactos permanecen en SQL. Las marcas previas, incluidas ABSENT/EXCUSED manuales, conservan ID/estado/nota/actor/fecha; escaneos simultáneos y toma manual comparten lock. La métrica conserva su fuente canónica. No hay geocerca/offline ni clientes móviles nuevos.

[Seguro] Token QR solo en body HTTP; URL web mantiene fragmento que la UI retira del historial. No-store en API/SDK; logger omite URL/query/body/identidad/excepciones. DTO de llegada solo actividad/grupo/título/estado/fecha propia/created, sin nota ni terceros. Las pruebas no publican payloads/tokens: captura QR enmascarada, trace/video/screenshot automático deshabilitados y asserts sobre booleanos/códigos. Auth/JWT/claves nunca se copian a evidencia.

## Activación, códigos anteriores y rollback

[Seguro] Configuración solo servidor: ASISTEAM_API_ORIGIN, ASISTEAM_API_SUPABASE_URL igual al proyecto actual, DATABASE_URL del rol mínimo y emisor Auth del mismo proyecto. `ASISTEAM_TRANSPORT_QR=nest` selecciona las cuatro Server Actions; supabase sigue default. GROUPS/ACTIVITIES seleccionan sus propios loaders de página. `/check-in` conserva Auth SSR temporal, coherente con #162/#164 pendientes. Un error/timeout no ejecuta el otro transporte ni reenvía; el reintento manual con QR vigente devuelve marca anterior si ya hubo commit.

[Seguro] La transición conserva **la misma base escritora**, UUID y clave por actividad: los códigos emitidos por RPC legacy se redimen en Nest y viceversa sin adaptador criptográfico, con expiración original (≤60s y cierre de ventana). Se prueba ambas direcciones; este issue no retira ni rota claves. Volver QR=supabase cambia futuras operaciones sobre las mismas filas, sin borrar asistencias ni restaurar snapshot previo a writes. Desplegar artefacto compatible, probar roles/códigos propios sintéticos y entonces activar bandera por entorno; ninguna prueba local activa tráfico cloud.

[Seguro] Para un futuro cambio físico de DB (#165/#166): preservar `app_private.qr_checkin_keys` y ajustes en transferencia cifrada con acceso exclusivo operador, verificando compatibilidad antes de retirar origen. Si se opta por agotar códigos, detener emisión de ambos transportes, drenar peticiones en curso y acreditar última emisión confirmada; esperar **≥60s desde esa última emisión** antes de retirar claves antiguas/activar una nueva emisión en la base destino. La expiración puede ser menor por fin de tramo o ventana; esperar no autoriza dos bases escritoras, aceptar tramo viejo/futuro ni ampliar ventana. Registrar solo timestamps/commit/digest/entorno; no claves ni payloads. El ensayo/corte físico queda en #166.

## Reproducción y evidencia

```sh
pnpm install --frozen-lockfile
pnpm api:generate
pnpm ci:checks
pnpm ci:backend
API_RLS_TEST=1 pnpm --filter @asisteam/api exec node --test test/qr.integration.mjs
pnpm exec supabase test db supabase/tests/qr_attendance.test.sql supabase/tests/api_session_rls.test.sql
ASISTEAM_QA_NEST=1 pnpm --filter @asisteam/web test:e2e:full --grep MIG-16
```

[Seguro] Backend CI incorpora integración QR con noSkip y Extended QA exige el recorrido MIG-16 sin omisiones. Fixtures HTTP usan emisor Auth sintético ES256 y PostgreSQL real/rol mínimo; E2E usa GoTrue real local y Next→Nest→PostgreSQL. Suites con credencial temporal del mismo rol se ejecutan en secuencia y restauran password/LOGIN; cleanup elimina exclusivamente UUID sintéticos propios. RLS/locks/invariantes permanecen activos durante operaciones; réplica en teardown solo conexión operador y restaurada en finally.

| Check | Resultado |
| --- | --- |
| Lint/contrato/tipos/build/unitarias completos | PASS;150 core,903 web,81 opt-in omitidas aquí y ejecutadas aparte |
| Acciones/adaptadores QR | PASS13 (5 legacy+8 Nest); 0 omitidas |
| SDK QR | PASS1; 0 omitidas |
| HTTP/SQL firma/vigencia/roles/compatibilidad/reintento/concurrencia | PASS1 escenario completo; 0 omitidas |
| pgTAP QR + sesión/RLS | PASS66; 0 omitidas |
| Backend global / Edge | FAIL pgTAP global preexistente3; módulos HTTP/worker/portabilidad/tipos PASS / Edge81/81 PASS,0 omitidas,49.84s |
| E2E375px/teclado/axe/login/emisión/llegada/errores | PASS1/1,0 omitidas,13.47s; Next→Nest→PostgreSQL/GoTrue reales locales |
| CI remoto y despliegue/corte cloud | PENDIENTE; no acreditados por pruebas locales |

[Seguro] La primera corrida de checks detectó un enlace workspace ausente en node_modules de worker después del merge #159. Se restauró instalación con lockfile congelado y se repiten los checks; no se modifican manifest/lock/versiones. pnpm11 del PATH se sustituye durante comandos por un shim temporal que invoca corepack pnpm10.33.2. No se integra configuración local de herramientas.

[Seguro] Auto-revisión limitada al diff del issue: transporte único, proyección/error seguro, grants existentes, no retirada de claves, compatibilidad sin alargar vigencia y fixtures/evidencia sin QR reutilizable. El PR permite revisión; no mergea, corta tráfico ni cierra #160.

[Seguro] [Checks sanitizados](checks.json), [backend](backend.json), [baseline pgTAP](baseline.json) y [E2E](e2e.json) solo registran base/entorno/resultado/duración/conteos. [Emisión y ajuste guardado](qr-mig16-admin-375.png) con QR enmascarado; [marca propia anterior](qr-mig16-llegada-375.png) tras login; [QR vencido](qr-mig16-vencido-375.png). Inspección visual confirma que no hay payloads/tokens/códigos legibles. Axe sin violaciones en [QR](axe-qr.json), [llegada](axe-llegada.json) y [vencido](axe-vencido.json); revisión automática acotada, no certificación con lector humano.

[Seguro] Gate pgTAP completo: group_subscriptions.test.sql casos44–45 (have0/want1000, NULL/want100.0) y send_invitations.test.sql15 (have1/want0). Se reprodujeron los mismos3 fallos con archivos exactos de35c0520 mediante git show y ejecución de esos dos archivos temporales. Este diff no altera migraciones ni esas suites, no toca cuotas/fixtures ajenos y no corrige problemas anteriores ampliando alcance. PR draft; gate global y revisión del usuario pendientes antes de merge.

[Seguro] Las primeras corridas E2E requirieron corregir selectors de SVG/status y esperar final de login/lectura inicial antes de simular un cambio de fragmento; la corrida final pasa con UI de producto existente. No se sustituyen endpoints de producto por mocks.

[Seguro] [Edge sanitizado](edge.json) registra81/81 integraciones reales locales,0 omitidas; recupera la etapa detenida por pgTAP global. No hay migración nueva ni tipos DB divergentes.

[Seguro] Revisión final del diff, lint y typecheck repetidos tras los ajustes de E2E: PASS. next-env.d.ts restaurado exactamente a su cambio ajeno inicial; manifest/lockfile intactos.
