# MIG-09 · Invitaciones y activación MANAGED (#153)

[Seguro] Base develop `7cbf13d775c75cf1cf205fd26656e119ff1d4db9`, rama codex/153-invitaciones-nest, fecha 2026-10-07. Dependencias #148/#149/#152 integradas. Worktree aislado preserva next-env/.pnpm-store/plan del checkout original. Los JSON registran el commit base del árbol comprobado antes del commit de entrega; el PR vincula el árbol publicado.

## Contrato y frontera Auth

[Seguro] Nueve operaciones HTTP/SDK/OpenAPI implementadas bajo /api/v1:

| Método/ruta | Fuente canónica y acceso |
| --- | --- |
| POST /invitations/send | Emisión/reenvío/activación por api_issue_invitation→issue_invitation/issue_managed_activation, actor auth.uid(); envío Resend controlado por Nest |
| POST /invitations/preview | Contexto mínimo de grupo/rol, proxy servidor y rate limit |
| POST /invitations/accept | Cuenta existente verificada, proxy, aceptación SQL dirigida |
| POST /invitations/register | Perfil INVITED, reserva/nonce→GoTrue; schema estricto |
| POST /invitations/claim | MANAGED con invitación de activación; solo credenciales/aceptación, conserva perfil |
| GET /groups/:groupId/invitations | ADMIN, diez filas/total, sin token/digest |
| POST /groups/:groupId/memberships/:membershipId/activation | Solicitud ADMIN por RPC, no presume decisión del apoderado |
| POST /activation-requests/:requestId | Decisión del apoderado autorizado por RPC; rechazo histórico |
| GET /groups/:groupId/activation-requests | Lista propia autorizada de cincuenta filas por RPC |

[Seguro] SQL conserva locks/transacciones, hash SHA-256, 32 bytes aleatorios, siete días/un uso, expiración persistida y cuota50/día calendario de Chile. Wrappers privadas SECURITY DEFINER con search_path vacío derivan actor de auth.uid(), sin parámetro HTTP, EXECUTE solo asisteam_api. La sesión verifica GoTrue/perfil/consentimiento y RLS dentro de una conexión/transacción; las reglas de ingreso por código permanecen en GROUPS/SQL. Nueva migración aditiva y pgTAP de privilegios; tipos DB regenerados sin diff público.

[Seguro] asisteam_invitation se crea NOLOGIN/NOINHERIT/NOBYPASSRLS sin ownership/tabla/CREATE/membresía de roles; recibe solo context/attempt/prepare/cancel/result. La API comprueba esos límites antes de cada llamada. El bootstrap del restore portable crea también el rol para poder restaurar sus ACL. No se usa service_role en Nest.

[Seguro] AGENTS/doc07 reservan service_role a Edge/CI. invitation-auth conserva temporalmente solo createUser de GoTrue: secreto independiente, body estricto email/password/nonce y sin SQL, autorización de grupo ni correo. Nest reserva nonce hasheado de dos minutos vinculado a email/token/perfil; el trigger Auth vuelve a validar consentimiento y consume la reserva/acepta/enlaza en su transacción. Se cancela reserva al terminar; nonce falsificado revierte Auth. Este límite permite Auth temporal solicitado por #153; eliminación del bridge/GoTrue corresponde a #162/#164 y no está acreditada aquí.

[Seguro] /register rechaza MANAGED para impedir editar nombre/nacimiento con la forma de registro; /claim conserva public.users.id, memberships, asistencia y consentimiento. ADMIN no sustituye ACCOUNT_ACTIVATION_MINOR del apoderado. Revocar consentimiento antes de Auth bloquea credenciales. Contacto/fecha/notas no salen en preview/DTO públicos; PII de historial solo ADMIN. Logs por allowlist excluyen credenciales, tokens, secretos y PII.

## Corte, enlaces y reversión

```sh
pnpm exec supabase migration up --local
pnpm exec supabase gen types typescript --local
# Provisionar externamente LOGIN/password para asisteam_api y asisteam_invitation.
# DATABASE_URL e INVITATION_DATABASE_URL: mismo host,puerto,base, roles distintos.
ASISTEAM_TRANSPORT_INVITATIONS=nest
ASISTEAM_API_ORIGIN=https://<origen-nest>
ASISTEAM_API_SUPABASE_URL=https://<mismo-proyecto-supabase>
ASISTEAM_API_TIMEOUT_MS=30000
HTTP_TIMEOUT_MS=30000
```

[Seguro] Proveer SUPABASE_AUTH_URL/clave pública del mismo proyecto, INVITATION_PROXY_SECRET compartido Next/Nest (≥32), INVITATION_AUTH_BRIDGE_SECRET independiente Nest/Edge (≥32), RESEND_API_KEY, INVITATION_EMAIL_FROM e INVITATION_WEB_URL origen HTTPS. Desplegar invitation-auth con su secreto. Ningún secreto es NEXT_PUBLIC ni se almacena aquí. El transporte default sigue supabase; selección inválida/orígenes distintos/secretos ausentes falla cerrado. El adaptador exige IP saneada por proxy de confianza; otros hosts deben configurar ese saneamiento.

[Seguro] Procedimiento probado para links previos: conservar /invitations/:token, misma tabla y hash; alternar solo INVITATIONS, sin reenviar ni regenerar tokens globalmente. La integración inserta un token previo y la E2E entra por su URL original con cuenta existente, consume una sola vez y rechaza replay. Caducados se rechazan410. Antes de #162/#164 ejecutar esta misma batería contra el futuro Auth y documentar equivalencia; esa compatibilidad futura está PENDIENTE, no se deduce del corte actual.

[Seguro] Retornar la bandera a supabase y redesplegar Next selecciona solo el ejecutor legacy para operaciones futuras. No restaura datos ni reintenta automáticamente un write incierto. Los endpoints legacy se conservan como reversión explícita. Emisión se confirma antes de correo: fallo/timeout deja PENDING visible para revisar/reenvío humano y consume cuota. Decisión del apoderado confirmada permanece registrada aunque falle el correo posterior. Revocación manual sigue RPC existente.

## Verificación y límites

```sh
pnpm ci:checks
pnpm ci:backend
pnpm ci:staging
API_RLS_TEST=1 pnpm --filter @asisteam/api exec node --test --test-reporter=tap test/invitations.integration.mjs
pnpm exec supabase test db supabase/tests/api_invitations.test.sql
ASISTEAM_QA_NEST=1 ASISTEAM_QA_INVITATIONS=1 pnpm --filter @asisteam/web test:e2e:full --grep MIG-09
```

[Seguro] Node24.16.0/pnpm10.33.2, Mac/Docker/Supabase sintéticos locales. No ejecutar E2E con builds/typecheck ni con suites que provisionen roles API. Fixtures IDs únicos limpian solo sus filas y restauran LOGIN/password; QA preserva membresías anteriores. Reportes publicados contienen solo conteos/estados/tiempos, sin datos crudos.

| Check | Resultado y evidencia |
| --- | --- |
| Lint/generación/typecheck/build/contrato Next | PASS [checks](checks.json) |
| Unitarias | PASS core150/web861;81 opt-in omitidas aquí, API/SDK sin omisiones |
| Integración HTTP PostgreSQL/GoTrue/Edge real | PASS1 sin omisiones [focalizadas](focused.json): concurrencia/cuenta existente/nueva, replay/expired, cuota50/IP10hora, ajeno, schemas, MANAGED adulto/historia, menor/apoderado/rechazo/revocación y secreto/nonce falsificados |
| Nuevo pgTAP de privilegios | PASS11/11; backend completo documentado aparte |
| E2E Next→Nest→GoTrue | PASS1 sin omisiones, link previo/cuenta existente/replay y MANAGED→historial375px/axe acotado [focalizadas](focused.json) |
| Staging Docker local | PASS roles/dos imágenes/rollback/limpieza, fallo inyectado esperado [staging](staging.json); no despliegue remoto |
| Backend global/pgTAP final | FAIL [backend](backend.json): gate anterior paró con LOGIN QA residual y caso15; corrección SIGTERM/cleanup revalidada con pgTAP1514/35, nuevo11PASS, únicamente caso15FAIL [focalizadas](focused.json); sesión/grupos/MEMBERS/invitaciones/portabilidad/tipos PASS |
| Baseline pgTAP | FAIL mismo caso15 de send_invitations «rechazos no consumen cuota»,1/51 [comparación](issue153-pgtap-baseline.json) |
| Integraciones producto HTTP/Edge/SQL | PASS81/81, cero omitidas,54.55 s [ejecución separada](issue153-product-integrations.json), ejecutadas después del stop pgTAP |
| Correo Resend | SIMULADO: interceptado únicamente fetch de emails con recibo sintético y fallo503; entrega externa OMITIDA |
| CI remoto | PENDIENTE publicación/inspección; no inferir verde |
| Auth futuro/cloud/humano | PENDIENTE; no certifica cancha, lector ni WCAG completa |

[Seguro] La comparación pgTAP ejecuta el test del checkout develop exacto sobre el stack local compartido con la migración aditiva instalada: no es una DB prístina de base. Los hashes comprueban que test y funciones de emisión canónicas son byte-idénticos a la base y la nueva migración no redefine esas funciones. El mismo caso estaba registrado en MIG-03/MIG-08 y no está agravado por wrappers del nuevo transporte. Según política MIG-03/#147 puede entregarse PR revisable con gate rojo explícito; no se declara backend verde ni merge autorizado.

[Seguro] Descubrimiento exclusivamente graphify, AST actualizado y catálogo SQL. Auto-revisión limitada al diff/base incluye generados, SQL/roles, sesión/cookies, errores, privacidad, selectores y fixtures. Hallazgos corregidos: exclusión de MANAGED en /register, distinción indisponibilidad de consentimiento, igualdad SSR usuario/sesión, scope del alert E2E, cleanup de membresía propia y provisión del rol en restore portable, shutdown SIGTERM/idempotente y restitución temprana de credenciales QA. Playwright por defecto usa SIGKILL ([documentación oficial](https://playwright.dev/docs/test-webserver)); se configuró SIGTERM/10 s y se comprobó NOLOGIN tras E2E y LOGIN/password idénticos ante fallo de startup. El fixture Edge agotó readiness antes de HTTP en una corrida; CLI arrancó en repetición y E2E/integración final aprobaron. next-env generado y artefactos crudos quedan fuera del commit. No merge ni cierre del issue.
