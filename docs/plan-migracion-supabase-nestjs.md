# Plan de migración de Supabase a Node.js y NestJS — antecedente histórico

[Seguro] **Estado: propuesta inicial del 2026-10-05, conservada como antecedente histórico.** Los inventarios, estimaciones y decisiones propuestas de este documento corresponden a ese corte; no acreditan el estado actual de implementación ni la aceptación de decisiones de producto, infraestructura o presupuesto.

[Seguro] **Seguimiento posterior:** la [épica #144](https://github.com/AlexxSome/asisteam/issues/144) reúne los entregables MIG-01–MIG-24. Sus avances y límites se documentan por issue, desde el [inventario y propuestas MIG-01](migration/issue-145/README.md) y su [ADR-001](migration/issue-145/adr-001.md), hasta entregas como [invitaciones y activación MANAGED MIG-09](migration/issue-153/README.md). Para arquitectura y contratos aplicables, consultar [doc 06](06-arquitectura-y-stack.md) y [doc 07](07-api-y-backend.md) junto con la evidencia del entregable correspondiente; este plan conserva la propuesta original.

[Seguro] **Proyecto:** Asisteam. **Fecha:** 2026-10-05. **Alcance solicitado:** planificación del reemplazo de Supabase. Esta planificación establece el destino y los pasos de migración; el sistema actual sigue operando según los documentos 02, 04, 06, 07, 08 y 11 hasta ejecutar y validar cada etapa.

[Probable] El riesgo principal es retirar las garantías de Supabase antes de tener sus equivalentes. NestJS aporta la capa de aplicación, pero la migración también debe resolver identidad, autorización por grupo, almacenamiento, tareas, backups y operación. La estrategia propuesta introduce primero la API NestJS sobre el PostgreSQL actual y retira los servicios de Supabase por etapas, manteniendo una única base autorizada para escrituras en cada momento.

## 1 Resultado esperado y alcance

[Probable] El resultado será un backend independiente de Supabase: API REST versionada en NestJS, PostgreSQL gestionado fuera de Supabase, autenticación propia del backend con bibliotecas mantenidas, almacenamiento privado compatible con S3 y un worker Node.js para tareas. Next.js, PostgreSQL, los identificadores del dominio y las reglas de producto se conservan.

[Seguro] El alcance existente incluye ADMIN, ATHLETE, GUARDIAN y COACH por membresía, invitaciones, cuentas MANAGED, consentimientos, grupos, integrantes, actividades, asistencia, reportes, perfil, billing Mercado Pago, anuncios, QR y login Google/Apple. Las capacidades autorizadas en #55–#59 deben mantenerse. Móvil Java/Swift, migración de Expo a FCM/APNs, offline y nuevas funciones P1/P2 siguen su planificación separada.

[Probable] La salida completa se considerará entregada cuando la aplicación y sus jobs no necesiten Auth, PostgREST, Edge Functions, Storage, claves, URLs ni servicios alojados en Supabase. Conservar procedimientos, vistas y RLS de PostgreSQL es compatible con ese objetivo: esas capacidades pertenecen a PostgreSQL y protegen el dominio.

## 2 Punto de partida verificado

[Seguro] El inventario estático del checkout local al 2026-10-05 muestra lo siguiente. Los conteos describen archivos y referencias de código; no prueban qué está desplegado en producción.

| Evidencia | Magnitud | Consecuencia para la migración |
| --- | ---: | --- |
| [Seguro] `supabase/migrations/*.sql` | 33 archivos | Revisar esquema, roles, grants, políticas, triggers, vistas y extensiones; las migraciones contienen dependencias de `auth`, `storage`, `pg_cron` y `pg_net`. |
| [Seguro] Nombres distintos de funciones declaradas en esas migraciones | 121 | Incluyen helpers y funciones internas; no equivalen a 121 endpoints públicos que haya que reescribir. |
| [Seguro] `supabase/functions/*/index.ts` | 6 | Migrar `send-invitation`, `accept-invitation`, `guardianship-majority`, `subscription-billing`, `mercadopago-webhook` y `send-announcement-push`. |
| [Seguro] Nombres literales usados por `.rpc()` en código web sin tests/fixtures | 45 | Construir una matriz operación → endpoint Nest → SQL → permiso → prueba. Incluye lecturas y escrituras. |
| [Seguro] Archivos web sin tests/fixtures que contienen `supabase` | 50 | El desacople incluye páginas, Server Actions, middleware, callbacks y utilidades, además del cliente de datos. |
| [Seguro] `apps/web/src/app/**/page.tsx` | 39 | Mantener recorridos y estados de UI con la cobertura de doc 05 y QA #120. |
| [Seguro] Scripts y CI versionados | Vitest, typecheck, build y Playwright; sin `.github` ni script `lint` | Crear los checks remotos y el lint; no asumir que ya existen. |

[Seguro] Hay FK y triggers sobre `auth.users`, uso de `auth.uid()` y helpers como `auth_user_id()`. Por eso un dump de las tablas de negocio no basta para obtener un PostgreSQL independiente. Además, los objetos de Storage requieren transferencia separada del backup de base, como documenta [Supabase](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

## 3 Arquitectura propuesta

[Probable] Usar un monolito modular NestJS y un worker que reutilice sus servicios. Así se separa el tráfico HTTP de tareas con reintentos sin introducir microservicios ni otra base de datos.

| Componente | Elección propuesta | Responsabilidad |
| --- | --- | --- |
| [Probable] Runtime y framework | Node.js 24 LTS y NestJS 12, con versiones exactas fijadas en el lockfile | API y worker; comprobar compatibilidad de adaptadores en la primera etapa. |
| [Probable] Acceso a datos | Driver `pg`, repositorios tipados y SQL parametrizado | Reutilizar vistas y funciones SQL, controlar transacciones y contexto de autorización. |
| [Probable] Persistencia | PostgreSQL 17 gestionado, próximo a la API | RLS, constraints, triggers, SQL de métricas, backups y recuperación. El proveedor se selecciona en la fase 0. |
| [Probable] Web | Next.js en Vercel, consumiendo Nest mediante Server Actions y código de servidor | Mantener las cookies de sesión fuera de JavaScript y el contrato de UI existente. |
| [Probable] Contratos | OpenAPI y cliente TypeScript; Zod desde `packages/core` | DTO explícitos, errores y paginación; contratos utilizables después por Java/Swift. |
| [Probable] Identidad | Módulo Nest con credenciales, identidades OAuth y sesiones separadas del perfil de dominio | Registro, login, recovery, refresh, revocación, Google/Apple y vinculación segura. |
| [Probable] Archivos | Bucket privado compatible con S3 y autorización desde Nest | Avatares, permisos existentes, límites de carga y URLs firmadas breves. |
| [Probable] Tareas | Worker Nest, agenda y cola persistidas en PostgreSQL con leases | Mayoría de edad, entrega de avisos, reintentos y exclusión entre réplicas. |
| [Probable] Integraciones | Resend, Mercado Pago, Sentry y transporte Expo actual | Mantener los contratos existentes; preservar push nativo como trabajo separado. |

[Seguro] Node.js 24 figura como LTS en el [calendario oficial](https://nodejs.org/en/about/previous-releases). La [guía actual de NestJS](https://docs.nestjs.com/migration-guide) describe NestJS 12 y sus requisitos de runtime/CLI. [Probable] Elegir ESM permite alinear el nuevo backend con `packages/core`, que ya declara `type: module`; el build debe probar ese consumo antes de migrar módulos.

[Probable] La estructura propuesta se integrará al pnpm/Turborepo existente:

```text
apps/
  web/                     # Next.js existente
  api/                     # NestJS: controladores, servicios y repositorios
  worker/                  # NestJS: agenda y consumidores de tareas
packages/
  core/                    # Zod, métricas, constantes y tipos de dominio
  db/                      # SQL, migraciones y tipos de persistencia al completar la salida
  api-client/              # Cliente HTTP generado desde OpenAPI
supabase/                  # Compatibilidad durante la transición; archivo histórico al cerrar
```

[Probable] Los módulos de API serán `auth`, `users`, `groups`, `memberships`, `guardianships`, `consents`, `invitations`, `activities`, `attendance`, `reports`, `billing`, `announcements`, `check-in` y `files`. Los controladores traducirán HTTP; los servicios coordinarán casos de uso; PostgreSQL conservará las invariantes y métricas que ya garantiza. Cada regla tendrá un responsable explícito para evitar dos implementaciones divergentes.

## 4 Garantías que deben sobrevivir

- [Seguro] **Aislamiento:** ninguna operación permite acceder a otro grupo; permisos por membership ACTIVE, nunca un rol global en el JWT. ADMIN+ATHLETE sigue teniendo dos membresías y COACH conserva estados sin notas ni desmarcado.
- [Seguro] **Privacidad:** V1–V6 siguen vigentes. Los DTO de terceros excluyen contacto, fecha de nacimiento, notas y datos de apoderados; los toggles de estadísticas parten en `false`.
- [Seguro] **Menores:** R1 exige apoderado y consentimiento vigente antes de activar. MANAGED no adquiere credenciales ni capacidad de login por ser migrado. Cambiar de proveedor de identidad conserva `public.users.id` y todo su historial.
- [Seguro] **Concurrencia:** conservar locks de último ADMIN, capacidad de billing, altas/aprobaciones y unicidad de asistencia. Un lote de hasta 500 registros es transaccional; una acción dividida en varios lotes conserva los previamente confirmados.
- [Seguro] **Métricas:** conservar la fórmula, half-up a un decimal, denominador cero → `null`, actividades convocadas, fecha de ingreso y límites en America/Santiago. El ejemplo canónico continúa dando 77.8 %.
- [Seguro] **Historia:** no borrar consentimientos, vínculos, membresías, facturas ni asistencia para simplificar la migración.
- [Seguro] **Contratos:** mensajes en español, códigos estables y distinción 401/403/404/409/422/429 según las reglas de cada operación; ocultar recursos ajenos mediante 404 cuando corresponda.

[Probable] RLS se mantendrá como defensa junto a guards y verificaciones del servicio. El rol de conexión de la API tendrá privilegios mínimos, no será propietario de tablas ni tendrá `BYPASSRLS`. Los propietarios de tablas y los roles con `BYPASSRLS` pueden omitir RLS según la [documentación de PostgreSQL](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), por lo que probar con un usuario privilegiado no valida aislamiento.

[Probable] Toda consulta autenticada, incluso de lectura, usará una transacción en una única conexión del pool. Nest verificará la sesión/token, resolverá identidad → perfil y establecerá contexto local de transacción para los helpers/políticas. El contexto se eliminará al terminar. Mientras se conserve Supabase Auth, un adaptador traducirá la identidad verificada a lo esperado por `auth.uid()`; después los helpers usarán el contexto independiente de proveedor. No se aceptarán actor ni claims de autorización proporcionados por el cliente.

[Probable] Las funciones `SECURITY DEFINER` se auditarán por propietario, `search_path`, grants y verificación interna del actor. Los jobs y webhooks tendrán un rol separado con acceso solo a sus funciones necesarias. Se probará reutilización de conexiones entre usuarios/grupos y acceso de tareas sin identidad; una pérdida de contexto debe fallar cerrada.

## 5 Fases y cronograma

[Suposición] La estimación usa dos desarrolladores backend/full-stack a tiempo completo, apoyo parcial de QA/operación, alcance funcional estable y disponibilidad de las cuentas externas. Reserva **12–16 semanas** para la salida completa, incluyendo ensayos y estabilización. Con un desarrollador, la referencia inicial es **20–28 semanas**. Son rangos de planificación que se recalibran después de la fase 0; no son compromisos de entrega.

| Fase | Duración estimada | Trabajo y entregables | Criterio de salida |
| --- | --- | --- | --- |
| [Suposición] 0 Inventario y decisiones | 1 semana | Matriz completa de operaciones/consumidores; estado real de producción; volumen DB/archivos; proveedor, presupuesto, disponibilidad y ventana de corte; ADR del nuevo stack. | [Probable] Cada flujo actual tiene destino, prueba y dueño; hay estrategia de identidad y corte según datos reales. |
| [Suposición] 1 Base de Nest e infraestructura | 1 semana | `apps/api`, configuración validada, ESM, conexión PostgreSQL, OpenAPI, healthchecks, errores, logging sin PII, staging sintético y CI con lint/typecheck/build/tests. | [Probable] Un despliegue reproducible consume `packages/core`, ejecuta migraciones y pasa smoke tests. |
| [Suposición] 2 Sesión temporal y autorización | 1–2 semanas | Validar tokens del Auth existente; adaptar contexto de RLS; guards por grupo y proyecciones por rol; diseñar el módulo de identidad definitivo. | [Probable] Negativos V1–V6, COACH/multirol, pooling y accesos sin sesión pasan usando los roles de runtime. |
| [Suposición] 3 Dominio principal y web | 3 semanas | Grupos/perfil; invitaciones/consentimientos; integrantes/apoderados; actividades/series; asistencia, historial y reportes. Migrar clientes web por módulo y conservar SQL transaccional existente. | [Probable] Cada módulo pasa contrato, integración, concurrencia, pgTAP y recorrido web antes de cambiar su tráfico. |
| [Suposición] 4 Integraciones y worker | 2 semanas | Portar las seis Edge Functions a Nest; Mercado Pago, Resend, anuncios/push y QR; cola PostgreSQL, agenda, leases y métricas de fallos/reintentos. | [Probable] Webhooks repetidos, ejecución duplicada y fallos de proveedor preservan consistencia sin duplicar efectos. |
| [Suposición] 5 Archivos e identidad independientes | 2–3 semanas | Cambiar primero archivos y permisos al storage nuevo; implementar registro/recovery/sesiones/OAuth; importar identidades/credenciales compatibles; cambiar middleware/callbacks y flujos MANAGED/invitación; adaptar FK/triggers/helpers y retirar Auth. | [Probable] Avatares autorizados y login email/social, renovación, revocación, consentimiento y vinculación funcionan sin Auth/Storage de Supabase ni perfiles duplicados. |
| [Suposición] 6 PostgreSQL independiente | 1 semana | Preparar baseline SQL portable; restaurar fuera de Supabase; adaptar tipos y scripts; ejecutar reconciliación de datos y archivos y un ensayo de corte. | [Probable] Conteos/IDs/invariantes y checksums coinciden; API/worker operan sin servicios Supabase. |
| [Suposición] 7 Corte y estabilización | 1–2 semanas | QA completa, carga, restauración/rollback, corte de tráfico y observación; actualizar docs y retirar dependencias/configuración activas. | [Probable] Pasan los gates de cierre y el período de observación acordado en fase 0. |

[Probable] El rango total contempla que parte del diseño de identidad y la preparación de Storage se puedan adelantar. Las dependencias de seguridad, aceptación de módulo y corte siguen siendo secuenciales: adelantar trabajo no permite saltarse sus gates. El hito parcial verificable es **API Nest atendiendo el dominio principal, con Supabase aún como Auth/DB**, después de las fases 0–3; no representa todavía la salida completa.

[Seguro] La meta original 2026-11-13 queda a 39 días desde la fecha de este plan. [Probable] Una migración completa de este alcance compite con esa meta y con el trabajo móvil ya pendiente. Si ambos siguen siendo objetivos, hay que replanificar la entrega; no usar la estimación original de construir un MVP Nest desde cero como duración de esta migración.

## 6 Cómo migrar cada capacidad

### API y frontend

[Probable] La matriz de contrato tendrá operación, ruta actual, página/código, implementación SQL/Edge, endpoint `/api/v1/...`, request/response, permiso, efecto transaccional, error y pruebas. Doc 07 aporta la notación lógica, pero las rutas se concretarán contra los flujos implementados y doc 05 para no fabricar endpoints de historias pendientes.

[Probable] Empezar con grupos/perfil como primer recorrido completo, después onboarding de menores/invitaciones, actividades y asistencia, y finalmente reportes e integraciones. Cada módulo web cambia a `packages/api-client` cuando su gate pasa. Las Server Actions quedan como capa de UI y sesión, sin duplicar reglas de dominio.

[Probable] El cambio de transporte tendrá una bandera de servidor por módulo. Durante la coexistencia, ambos transportes escribirán en la misma base y llamarán a la misma implementación transaccional; una operación tendrá un único ejecutor. Comparar lecturas en paralelo es admisible sobre fixtures sintéticos; duplicar writes, envío de correos, checkout o jobs para comparar resultados no lo es.

[Probable] Se preservarán DTO por rol, límites de paginación, filtros en hora de Chile y errores vigentes. Los esquemas OpenAPI y el cliente se generarán en CI con control de divergencia. Las apps Java/Swift podrán consumir después esos contratos; no ejecutarán paquetes TypeScript ni recibirán directamente tipos internos de tablas.

### Identidades y sesiones

[Probable] El corte definitivo de Auth requiere que todos los consumidores de PostgREST/Edge hayan cambiado a Nest y que los archivos ya se autoricen y sirvan desde el nuevo storage. Este orden evita dejar clientes o buckets que todavía exijan tokens del proveedor retirado. La base puede continuar temporalmente alojada en Supabase porque la API ya controla su conexión y contexto de autorización.

[Probable] Durante la transición, Nest aceptará solo tokens del emisor configurado y verificará firma, emisor, audiencia, expiración y revocación según el mecanismo soportado. Los roles del JWT no reemplazan la consulta de memberships. Se documentará la relación entre el UUID de identidad actual y el UUID del perfil antes de importar nada.

[Probable] El destino separará credenciales, sesiones y vínculos OAuth del perfil. Las nuevas contraseñas usarán Argon2id; los hashes actuales se preservarán solo si la prueba de exportación/verificación confirma compatibilidad, con actualización gradual al autenticarse. Cuando una cuenta no tenga un hash portable, el plan de corte incluirá recuperación segura. No se prometerá continuidad de sesiones ni contraseñas sin ese ensayo.

[Probable] Las sesiones web usarán cookies HttpOnly, Secure y SameSite=Lax mediante la capa de servidor de Next. Los tokens no irán a localStorage. El backend implementará rotación y hash de refresh, detección de reutilización, revocación de familia, cierre de sesión, límite de intentos y protección CSRF/origin en los endpoints que autentiquen con cookies. JWT/refresh para clientes nativos quedará especificado sin implementar las apps.

[Probable] Recovery e invitaciones tendrán tokens de alta entropía, almacenados como hash, uso único, expiración y pruebas de concurrencia. Las invitaciones existentes conservarán su expiración de 7 días; el recovery mantendrá el contrato de expiración documentado. Un enlace ya emitido tendrá soporte temporal o un procedimiento explícito de reemisión. Consumir el token y guardar el efecto deberá ser atómico.

[Probable] Google/Apple requerirán PKCE cuando corresponda, `state`/`nonce`, validación del emisor y callback allowlist. La vinculación conservará el identificador estable del proveedor y las asociaciones actuales, incluidos correos privados de Apple; no fusionará perfiles solo por coincidencia de email. Registrar/activar perfiles MANAGED o INVITED será un caso de uso transaccional que sustituya los triggers de `auth.users` y conserve consentimientos.

[Probable] El corte de Auth invalidará las sesiones anteriores y pedirá login nuevo, salvo que un ensayo demuestre una transferencia segura. Nuevos registros, cambios de contraseña, recovery y linking tendrán un único proveedor escritor durante todo el período. La reversión de Auth exigirá congelar esas operaciones y reconciliar identidades/credenciales creadas o modificadas después del corte; una bandera por sí sola no resuelve esa divergencia.

### Funciones, tareas e integraciones

| Función actual | Destino Nest | Prueba decisiva |
| --- | --- | --- |
| [Probable] `send-invitation` | Servicio de invitaciones y entrega de correo | [Seguro] ADMIN del grupo, límite 50/día/grupo, token único/expiración y reintentos sin duplicación del efecto. |
| [Probable] `accept-invitation` | Caso de uso de aceptación/registro | [Seguro] Cuenta existente/nueva, consentimiento, aceptación concurrente, replay y anti-enumeración. |
| [Probable] `guardianship-majority` | Job y consumidor de avisos | [Seguro] Pérdida de visibilidad al cumplir 18 en Chile, transición conservada aunque falle el correo e idempotencia. |
| [Probable] `subscription-billing` | Servicio de billing | [Seguro] Precio/cupo calculados en servidor, reserva única y conciliación de creación remota incierta. |
| [Probable] `mercadopago-webhook` | Endpoint firmado y conciliación | [Seguro] Firma y consulta al proveedor; retorno web no acredita pago, duplicados/antiguos no regresan el ledger. |
| [Probable] `send-announcement-push` | Consumidor de entregas | [Seguro] Opt-in, límites, leases, tokens inválidos y reintentos; conservar Expo mientras siga siendo el transporte autorizado. |

[Seguro] La documentación de permisos exige la transición diaria de mayoría de edad a las 00:30 America/Santiago y chequeo de edad al autorizar. El SQL actual programa el dispatcher cada 10 minutos. [Probable] La fase 0 resolverá esa diferencia: separar la agenda del cambio diario y el reintento de entregas, mantener el chequeo de edad en las lecturas y probar días con cambio de horario.

[Probable] El worker conservará `job_runs` y las colas/leases existentes cuando sean portables. Un lock o lease persistido y claves únicas impedirán que varias réplicas o un despliegue ejecuten el mismo efecto. Habrá recuperación de tareas vencidas, registro mínimo de intentos, alarma de pendientes y una forma operativa de reintentar. Deshabilitar el scheduler anterior precederá a habilitar el nuevo como único ejecutor.

[Probable] QR conservará firma, vigencia, permisos de emisión y llegada propia e idempotencia. Los QR ya emitidos se agotarán antes de retirar las claves antiguas, o se soportarán explícitamente por su vigencia máxima; no se aceptarán con una validación debilitada.

### Base de datos y archivos

[Probable] Primero probar las 33 migraciones en el stack actual para obtener una referencia; después preparar un baseline portable con historial documentado. Separar tablas de dominio, identidad y metadatos de archivos; sustituir FK/triggers de `auth.users`, dependencias de `auth.uid()`, políticas `storage.objects` y dispatchers `pg_net`. Revisar grants y propietarios, extensiones disponibles, funciones `SECURITY DEFINER`, vistas y dependencias antes de restaurar.

[Probable] Las futuras migraciones se ejecutarán con un rol de despliegue distinto al rol de API. Durante la transición seguirá la generación de tipos Supabase donde aún se use. Al retirar ese transporte, `packages/db` tendrá tipos de persistencia obtenidos del esquema destino y `api-client` tendrá los DTO de OpenAPI; la base y el contrato HTTP tendrán checks de divergencia independientes. El frontend dejará de importar el tipo `Database` de Supabase.

[Probable] Migrar archivos con un manifiesto de objeto, propietario, tamaño, tipo y checksum. Conservar el contrato de permisos del avatar: no convertir el bucket en público ni exponer claves de objetos de terceros. Actualizar referencias a URLs antiguas mediante un adaptador o migración, validar descargas autorizadas y rechazos, y preservar el endpoint de avatar usado por la web cuando facilite compatibilidad.

## 7 Corte de producción y reversión

[Suposición] El estado de producción, los volúmenes y el SLA todavía deben confirmarse. Se contemplan dos estrategias; escoger una en fase 0 cambia la complejidad y duración del corte.

| Situación | Estrategia propuesta |
| --- | --- |
| [Suposición] Solo entornos de desarrollo y datos sintéticos | [Probable] Preparar el entorno nuevo desde baseline y fixtures, trasladar la evidencia sintética que se requiera y cambiar configuración tras QA. No tratar la limpieza como autorización para borrar historia existente. |
| [Suposición] Usuarios o datos reales y ventana de mantenimiento aceptable | [Probable] Ensayar exportación/restauración y medir duración; detener todos los escritores, copiar snapshot final de DB/Auth y objetos pendientes, reconciliar, hacer smoke y habilitar el destino como único escritor. |
| [Suposición] Producción sin ventana suficiente para el volumen medido | [Probable] Diseñar replicación/CDC unidireccional, seguimiento de cambios en identidades y archivos y breve congelación final. Añadir una estimación específica; no asumir que está cubierto por el rango base. |

[Probable] La congelación debe incluir UI/API antiguas y nuevas, refresh/recovery/registro/linking, workers, cron y escritura desde webhooks. Eventos entrantes tendrán recepción duradera por un único handler que permita reprocesarlos, o un mecanismo de reintento del proveedor previamente comprobado; no devolver éxito antes de persistir. Revisar en particular URLs de suscripciones ya creadas en Mercado Pago y mantener un receptor/forwarder controlado en la URL antigua mientras existan eventos destinados a ella.

[Probable] La fase 0 comprobará con contratos de prueba existentes que sus notificaciones pueden cambiar al receptor nuevo. Si algún contrato sigue necesitando una URL alojada en Supabase, ese receptor mantiene una dependencia activa y puede extender la fecha de retirada total; la API Nest podrá estar entregada antes. El cierre completo exige resolver esa entrega de eventos y ensayar su continuidad, no solo cambiar la URL de los contratos nuevos.

[Probable] El runbook de corte identificará responsables, pasos ejecutables, tiempos medidos, claves/configuración, backups cifrados, pruebas y criterios de abortar. RPO, RTO y duración de observación se acordarán según negocio y ensayo. No asumir pérdida de datos aceptable sin fijarlos.

[Probable] Antes de la primera escritura en PostgreSQL nuevo se puede abortar y reabrir el origen íntegro. Después de la primera escritura, la reversión exige congelar el destino y trasladar/reconciliar los cambios al origen con un procedimiento ensayado, además de identidades, objetos y efectos de proveedores. Si ese procedimiento no cabe dentro del RTO, la respuesta será reparar hacia adelante en el destino. Nunca apuntar al snapshot viejo dejando atrás la asistencia, consentimientos o pagos recibidos después del corte.

[Probable] Supabase se conservará restringido y sin escritores durante la observación y la ventana de reversión fijadas. El cierre seguirá la retención acordada: preservar exportaciones e historia necesarias, cambiar destinos de eventos, retirar secretos y eliminar dependencias activas cuando haya aceptación operativa. Mantener Supabase autohospedado solo cambia el proveedor de hosting y no cumpliría esta salida completa.

## 8 Validación y criterios de cierre

[Probable] Cada fase entregará evidencia con commit, entorno y PASS/FAIL/PENDIENTE. Las verificaciones existentes de [QA #120](qa/issue-120/README.md) se adaptarán al backend destino; una integración omitida no equivale a PASS.

| Gate | Comprobación requerida |
| --- | --- |
| [Probable] Contrato | Endpoints/DTO/errores/paginación cubren la matriz y los flujos implementados; cliente generado no diverge. |
| [Probable] Autorización | Negativos entre tenants/roles, V1–V6, COACH y multirol; acceso propio/apoderado válido; conexiones alternadas y contexto ausente usando roles de runtime reales. |
| [Probable] Dominio | R1, último ADMIN y cupos con concurrencia; consentimientos/revocación; MANAGED→ACTIVE; series con asistencia; upsert/lotes y conservación de historia. |
| [Probable] Identidad | Registro/login/recovery/OAuth; claims inválidos; refresh reutilizado; logout; enlace de cuentas; sesiones anteriores y tokens ya emitidos. |
| [Probable] Métricas | Misma batería canónica Vitest y pgTAP en ambos entornos; 77.8 %, denominador cero y cortes de Chile sin diferencia. |
| [Probable] Integraciones | Mercado Pago con sandbox/configuración de prueba, firma/replay/reembolso/cancelación/resultado incierto; correos y push con reintentos/opt-in. Los mocks no sustituyen esta verificación externa. |
| [Probable] Archivos y datos | Conteos y checksums por tabla/grupo, integridad de IDs/FK y restricciones, ledger/consentimientos intactos, checksums y permisos de objetos. |
| [Probable] UI | Recorridos de las 39 páginas según doc 05; pruebas Playwright/axe, asistencia a 375 px y revisión manual de estados y accesibilidad pendientes. |
| [Probable] Operación | Build/despliegue reproducible, backup/restauración y rollback ensayados, una instancia lógica de cada job, alertas y logs sin PII. |
| [Probable] Rendimiento | Medir baseline y destino bajo el mismo volumen/carga; reportes p95 ≤ 500 ms conforme al umbral del canon. Dimensionar pool y controlar saturación antes de añadir cache. |
| [Probable] Desacople | Cero llamadas activas a Supabase desde web/API/worker, cero dependencias/configuración Supabase de runtime y cero receptores de webhooks dependientes de esa plataforma. Un forwarder temporal con fecha de retiro es un hito de transición, no el cierre completo. |

[Probable] En cierre se actualizarán doc 06 (stack/operación), doc 07 (API/auth/errores), doc 04 (identidad/persistencia), doc 09 (fechas/dependencias), doc 11 (proveedores/controles), docs 12–14 (billing/anuncios/QR), doc 05 y sistema visual para los estados que cambien, más AGENTS.md. Las reglas de producto se conservarán; la actualización describirá evidencia real de lo entregado.

## 9 Trabajo inicial para convertir el plan en ejecución

1. [Probable] **Inventario y ADR:** registrar todas las operaciones públicas/internas y consumidores, decisión de salida completa, proveedor de PostgreSQL/containers/storage, modelo de identidad y criterios de corte. Responsable propuesto: backend y responsable de producto.
2. [Probable] **Base ejecutable:** crear API Nest y CI/staging, fijar Node/dependencias, compilar `packages/core`, ejecutar migraciones, exponer healthcheck y una primera lectura autorizada. Responsable propuesto: backend y operación.
3. [Probable] **Prueba de seguridad vertical:** implementar sesión temporal, contexto PostgreSQL y permisos para un recorrido grupos/perfil; probar dos grupos, cuatro roles, multirol y reutilización del pool. Responsable propuesto: backend/full-stack y QA.
4. [Probable] **Ensayo de portabilidad:** restaurar datos sintéticos en PostgreSQL independiente, verificar las dependencias de `auth`/`storage` y probar importación de credenciales y un avatar. Responsable propuesto: backend y operación.

[Probable] Estos cuatro entregables reducen primero las incertidumbres que pueden cambiar el resto del cronograma. Tras ellos se convierten las fases restantes en issues con alcance, dependencia, evidencia y criterio de aceptación; la creación de issues y la implementación pertenecen al siguiente trabajo de ejecución.

## 10 Riesgos y presupuesto por resolver

| Riesgo | Mitigación propuesta |
| --- | --- |
| [Probable] RLS omitida por el rol Nest o por un procedimiento privilegiado | Rol mínimo, auditoría de funciones/grants y tests con roles de runtime, incluyendo pool. |
| [Probable] Pérdida de identidad o perfil duplicado | Mapa de UUID/proveedor, ensayos de hashes/OAuth, conservar perfil y evitar merging automático por email. |
| [Probable] Duplicación de cobros, correos o tareas | Un escritor/ejecutor, reservas e idempotencia existentes, leases y conciliación de efectos inciertos. |
| [Probable] Restauración incompleta por dependencias Supabase | Baseline portable y ensayo sobre PostgreSQL destino, con datos y objetos reconciliados. |
| [Probable] Reversión que pierda escrituras recientes | Congelación, procedimiento de cambios posteriores al corte o recuperación hacia adelante. |
| [Probable] Carga operativa y plazo superiores a lo esperado | Provider gestionado, gates por fase, apoyo de operación y ajuste tras inventario. |

[Suposición] No hay presupuesto, volumen ni requisitos de disponibilidad confirmados para cotizar. [Probable] La fase 0 comparará costo total de API/worker, PostgreSQL, backups/PITR, archivos/egress, correo, observabilidad, staging y convivencia temporal con Supabase, además de horas de operación. No trasladar a este plan los precios históricos de doc 06 como cotización actual ni prometer ahorro por cambiar de framework.

## 11 Referencias

- [Seguro] [Arquitectura actual y ruta de salida](06-arquitectura-y-stack.md), [permisos](02-roles-y-permisos.md), [modelo](04-modelo-de-datos.md), [API](07-api-y-backend.md), [métricas](08-reportes-y-estadisticas.md), [roadmap](09-roadmap.md) y [seguridad y privacidad](11-legal-seguridad-privacidad.md).
- [Seguro] [Pantallas y límites de implementación](05-pantallas.md), [billing](12-suscripciones-saas.md), [anuncios](13-anuncios.md), [QR](14-asistencia-qr.md) y [QA #120](qa/issue-120/README.md).
- [Seguro] [Versiones Node.js](https://nodejs.org/en/about/previous-releases), [guía de NestJS](https://docs.nestjs.com/migration-guide), [RLS de PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) y [alcance de exportación/restauración Supabase](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

## 12 Seguimiento en GitHub

[Seguro] La [épica #144](https://github.com/AlexxSome/asisteam/issues/144) reúne los 24 entregables MIG-01–MIG-24, publicados como issues #145–#168 y vinculados como sub-issues. Cada entregable tiene alcance, dependencias concretas, criterios de aceptación y validación; la épica contiene la lista completa y los gates de cierre.

[Probable] Comenzar por [MIG-01 — Inventario y decisiones #145](https://github.com/AlexxSome/asisteam/issues/145), que confirma producción, equipo, infraestructura y estrategia de corte antes de fijar las fechas de ejecución.
