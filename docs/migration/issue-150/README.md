# MIG-06 · Ensayo de portabilidad SQL, credenciales y archivos (#150)

[Seguro] Base `9f1aeec508de5352b4f03ff7eedf3460ba710554` de `origin/develop`, que integra #145–#149; rama `codex/150-ensayo-portabilidad`. Fecha 2026-10-07. Worktree aislado: conserva el trabajo local ajeno. El commit de entrega se identifica en Git/PR; los informes registran la base y el diff pendiente verificado.

[Seguro] [Runner](../../../scripts/migration/portability/run.mjs), [bootstrap](../../../scripts/migration/portability/bootstrap.sql), [fixtures](../../../scripts/migration/portability/fixtures.sql) y [verificaciones](../../../scripts/migration/portability/verify.sql) ensayan un destino PostgreSQL 17.9 independiente, sin servicios Supabase, red ni puertos publicados. Los esquemas SQL `auth` y `storage` se conservan como **compatibilidad temporal**. No equivale a retirar Auth/Storage ni a desplegar la API de producto sobre el destino.

## Reproducir y revisar evidencia

```sh
# Node 24.16.0, pnpm 10.33.2, Docker; desde la raíz del checkout.
pnpm install --frozen-lockfile
pnpm exec supabase start
pnpm exec supabase migration up --local
pnpm migration:portability
# Prueba negativa: debe terminar con código 1 y cleanup PASS.
PORTABILITY_FAIL_AFTER=local-storage-export pnpm migration:portability
pnpm ci:checks
pnpm ci:backend
```

[Seguro] El origen está fijado a `supabase_db_asisteam` y API `http://127.0.0.1:54321`; no acepta DSN/cloud ni lee `.env`. Solo exporta **esquema** del stack local. Crea una DB vacía temporal `mig150_<UUID>` y tres cuentas sintéticas propias mediante GoTrue; lee exclusivamente sus UUIDs y filas, nunca exporta filas ajenas. La DB temporal recibe cinco perfiles ACTIVE/INVITED/MANAGED, dos grupos, guardianship/consentimiento, suscripción/factura sintéticas, diez registros canónicos y objetos propios. Ningún proveedor externo recibe solicitudes.

[Seguro] Los archivos temporales usan directorio 0700/archivos 0600. El dump privado contiene hashes sintéticos; manifiesto privado contiene clave, tamaño, SHA-256 y mapa Auth UUID → perfil UUID. Se eliminan al terminar. `.ci-results/portability.json` y `portability-fault.json` conservan únicamente versiones, base, etapas, tiempos, conteos y resultados; no contienen emails, passwords, hashes de contraseña, UUIDs personales, tokens, claves ni SQL/logs crudos. Los digests de filas permanecen en memoria. La evidencia adjunta se selecciona de estos JSON seguros.

[Seguro] Cleanup actúa solo sobre nombres/UUIDs/keys generados por la corrida: borra sus objetos, cuentas sin historia de dominio local, DB temporal y contenedor/volumen propio. Resuelve la respuesta ambigua de alta por email sintético único y comprueba ausencia posterior. Cada recurso se intenta aunque otro falle. No ejecuta reset, purga global, deshabilitación de RLS ni borrado de historia del usuario. El fallo inyectado tras exportar objetos comprueba esta ruta. No ejecutar la prueba mientras se usen sus recursos temporales para revisión manual.

## Compatibilidad y transformaciones necesarias

| Elemento | Evidencia y transformación del ensayo | Trabajo de salida completa |
| --- | --- | --- |
| `public` / `app_private` | [Seguro] Dump SQL con `--no-owner`; tablas, constraints, policies, RLS, grants actuales y contenido sintético reconciliados. Restauración estricta con `ON_ERROR_STOP`, sin ignorar errores | [Probable] #165 deberá fijar migrator/owners mínimos y retirar dependencias finales; no otorgar ownership/BYPASSRLS al runtime |
| Roles / ACLs | [Seguro] Bootstrap crea roles de compatibilidad **NOLOGIN/NOBYPASSRLS**, API hereda authenticated con SET false; jobs/webhook separados. Se omiten únicamente defaults futuros de `supabase_admin` / `supabase_auth_admin` (18 en esta base): el postgres local no puede alterarlos. Grants actuales se conservan y comparan | [Probable] #165 define default privileges del migrator de destino; los roles Supabase no quedan como credenciales activas |
| `extensions.pgcrypto` | [Seguro] Se crea antes de restaurar, en el namespace existente; digest, crypt y SQL de negocio funcionan en PostgreSQL 17.9 vanilla | [Probable] Comprobar disponibilidad/versión/grants en el proveedor gestionado elegido; este contenedor no acredita RDS ni otra oferta |
| `auth.users` / `auth.uid()` / `auth.sessions` | [Seguro] FK, helpers y funciones PostgreSQL de compatibilidad se restauran; se conserva Auth UUID → `public.users.id`. MANAGED permanece sin credenciales. No se exportan sesiones previas | [Probable] #162–#164 reemplazan identidad/sesión/registro, renovación/recovery, triggers de invitación y FK; el esquema por sí solo no implementa GoTrue |
| Storage | [Seguro] Esquema/metadata y ruta canónica `/profile/avatar/AuthUUID/UUID.png` se conservan; bytes se exportan por HTTP real local y copian a directorio privado separado con manifiesto/SHA-256 | [Probable] #161 debe importar a S3 privado y probar autorización, revocación y URLs firmadas. El directorio no simula esas capacidades |
| `pg_cron` / `pg_net` / Vault | [Seguro] Extensiones/servicios ausentes en destino. La invocación de cron falla como se espera; dos funciones conservan referencias net/Vault: `dispatch_guardianship_majority()` y `dispatch_announcement_push()`; se detectan por catálogo y se eliminan solo del ensayo destino | [Probable] #157/#159 deben sustituir despacho con worker, agenda, secretos, leases y único ejecutor. Ledger/funciones de dominio se conservan; no habilitar ambos ejecutores |

[Seguro] Seeds de tipos de sistema y catálogo billing se recrean únicamente en la DB vacía del fixture. La inmovilidad de tipos se suspende durante esa siembra y se reinstala antes del dump; la restauración y verificaciones usan todos los triggers activos. No se modifican las 34 migraciones productivas, las reglas V1–V6/R1 ni los tipos TS de DB. No hay nueva migración de dominio que regenerar; backend sigue comprobando los tipos vigentes contra Supabase local.

## Credenciales e identidades

[Seguro] GoTrue local v2.192.0 emite tres hashes bcrypt `$2a$`, exportados/importados intactos. En el PostgreSQL destino `extensions.crypt` verifica la contraseña sintética correcta y rechaza una incorrecta. Las variantes de prefijo `$2b$`/`$2y$` del fixture ASCII no verifican en **este verificador pgcrypto**, y hash ausente/malformado/algoritmo no soportado requieren recovery o un verificador de destino probado. No se modifica el prefijo para aceptar credenciales ni se inventa una contraseña. Esto no afirma incompatibilidad universal de bcrypt ni promete continuidad de password/login Nest.

[Seguro] Las identidades email se exportan de GoTrue. Google/Apple son registros sintéticos de transporte: se conserva `(provider, provider_id)` → Auth UUID → perfil; el mismo subject en providers distintos no fusiona personas. No se prueba consentimiento/callback/token de Google/Apple ni se enlaza por email. OAuth real pertenece a #163; la importación completa y el corte Auth a #164.

[Seguro] La verificación de hash no ejecuta login/recovery independiente, rotación/revocación de refresh, rehash de contraseña ni sesiones anteriores. La política vigente de [doc11](../../11-legal-seguridad-privacidad.md) sigue aplicando: #162 deberá probar rehash y parámetros del nuevo verificador, límites Unicode/longitud y recovery de un solo uso. No se conservan JWT/refresh GoTrue en el destino por inferencia.

[Seguro] Fuentes primarias consultadas el 2026-10-07: Supabase documenta bcrypt en `auth.users.encrypted_password` ([password security](https://supabase.com/docs/guides/auth/password-security)); PostgreSQL17 documenta `crypt` y variante 2a ([pgcrypto](https://www.postgresql.org/docs/17/pgcrypto.html)). Supabase distingue restaurar metadata Storage de transferir bytes ([restauración](https://supabase.com/docs/guides/self-hosting/restore-from-platform)). Los resultados concretos de variantes/origen/destino proceden del ensayo, no de una promesa del proveedor.

## Cronograma y ventana recalibrados

[Seguro] La referencia de 12–16 semanas/dos desarrolladores o 20–28/uno y ventana de dos horas de MIG-01 eran supuestos. El ensayo resuelve portabilidad **SQL con compatibilidad**, transporte de bcrypt2a y bytes sintéticos; no resuelve autenticación independiente, worker ni autorización S3. Faltan proveedor, volumen y capacidad del equipo: no hay evidencia para convertir esos rangos en fecha comprometida.

[Probable] Se ajusta el camino crítico de salida: #157/#159 sustituyen los dos dispatchers **antes** de apagar cron/DB origen; #161 mueve archivos **antes** de #164; #162/#163/#164 prueban login/recovery/OAuth y sustituyen la frontera `auth` **antes** de que #165 declare PostgreSQL libre de dependencias Supabase. #166 ensaya corte/reconciliación sobre el esquema final y volumen aprobado; un PASS de este ensayo no adelanta el corte ni elimina esos hitos.

[Probable] La ventana de dos horas se retira como valor de planificación utilizable y se sustituye por: `congelar + drenar jobs/efectos + exportar DB + importar DB + reconciliar + transferir/reconciliar objetos + smoke de roles/login + admisión + margen medido`. #166 debe medir cada término, su solapamiento permitido y validarlo con operación; después se fija la ventana. Antes de primeras escrituras puede volver al origen intacto; después se necesita congelación/reconciliación de cambios, nunca restaurar solo un snapshot antiguo.

[Seguro] Los tiempos del fixture en [portability.json](portability.json) son una entrada reproducible para la planificación: ~0.5 MB de dump y 204 bytes/3 objetos locales. No son throughput de producción, RPO/RTO, latencia/egress cloud ni prueba de ventana de dos horas. No extrapolar segundos de este fixture a GB/usuarios reales. El cronograma permanece condicionado a los gates anteriores, sin activar móvil/offline/FCM/APNs ni features nuevas.

## Validación, revisión y límites

[Seguro] El ensayo comprueba conteos/contenido SHA-256 de todas las tablas, constraints/FK/unique, policies/grants/RLS, roles mínimos, propio/grupo ajeno/anon, R1 menor con consentimiento, historia append-only y métrica 77.8/null. La siembra incluye ledger pagado sintético, sin llamada Mercado Pago. El mapa de avatar se contrasta con `storage.objects`, Auth/perfil y `users.avatar_url`; checksum corrupto y objeto ausente se detectan. El runner es una prueba de compatibilidad del alcance; las suites canónicas completas se siguen ejecutando en `ci:backend`.

[Seguro] Auto-revisión del diff #150: bootstrap y grants, protección del origen, SQL parametrizado por literales escapados/UUIDs propios, privacidad de logs/artefactos, rutas y consentimientos, readiness TCP del PostgreSQL definitivo y cleanup normal/fallo. Los cambios se limitan a tooling, fixtures y documentación; UI/contratos de producto y migraciones no cambian. Navegación exclusivamente graphify, con extracción SQL en /private/tmp (213 nodos/617 enlaces).

[Seguro] [checks.json](checks.json), [backend.json](backend.json), [portability.json](portability.json) y [portability-fault.json](portability-fault.json) distinguen gates locales y el fallo controlado de cleanup. El CI remoto se informa desde el PR; evidencia local no confirma despliegue. El informe se actualiza al cerrar la verificación de este diff. No se mergea ni cierra #150 automáticamente.

## Resultados locales del diff final

| Check | Resultado |
| --- | --- |
| Gates `ci:checks` | [Seguro] PASS lint, typecheck, build, generación OpenAPI y Next→SDK→Nest. Core150, web830, API/cliente PASS; 81 integraciones omitidas en unitarias y ejecutadas aparte |
| Ensayo PostgreSQL17 independiente | [Seguro] PASS 16 etapas; 63 tablas/15 no vacías reconciliadas y catálogo preservado. Runner34.48s; export dump0.30s, import1.39s, reconciliación12.52s |
| Objetos | [Seguro] PASS3 objetos/204bytes; HTTP Storage local real, manifiesto/mapa/checksums y copia privada; export0.55s/import0.35s. S3/URLs/autorización de destino pendientes #161 |
| Credenciales | [Seguro] PASS3 bcrypt2a reales transportados y verificados en pgcrypto; contraseñas incorrectas rechazadas. 2b/2y/ausente/malformado/algoritmo no soportado no verifican en este ensayo |
| Fallo controlado | [Seguro] FAIL esperado tras objetos, cleanup PASS; gate `portability-cleanup-after-failure` PASS |
| API sesión/RLS y tipos | [Seguro] PASS2 integraciones de #149; tipos generados coinciden con `packages/db` |
| pgTAP completo | [Seguro] FAIL preexistente: 1 en `send_invitations.test.sql` (cuota/caso15 documentado en #149). Gate local backend permanece rojo; CI efímero PASS (ver abajo) |
| Reproducción de base | [Seguro] [baseline-pgtap.json](baseline-pgtap.json): mismo fallo1 con archivo exacto de `9f1aeec`; sin cambios en supabase/ ni tipos DB frente a esa base |
| Integraciones reales producto/Edge | [Seguro] [product-integrations.json](product-integrations.json) PASS81/81, cero omitidas,57.66s; ejecutadas aparte porque backend se detiene en pgTAP |
| Auto-revisión/lint final/diff | [Seguro] PASS diff limitado a #150; trabajo ajeno intacto |
| Playwright/UI y proveedor cloud | [Seguro] OMITIDOS: no hay cambios UI, despliegue ni provisión externa en este ensayo |

[Seguro] La entrega es revisable mediante PR. El pgTAP local existente sigue fallando, mientras que el gate remoto con DB efímera limpia pasa; no se atribuye una causa al contraste sin evidencia adicional. Los casos de login/recovery/OAuth/S3 y el corte real pertenecen a #161–#166 y no se presentan como PASS de #150. El valor de este entregable es el ensayo reproducible y la lista concreta de incompatibilidades/gates, no una migración de producción.

## CI remoto sobre el commit de implementación

[Seguro] [Run37631241378](https://github.com/AlexxSome/asisteam/actions/runs/37631241378), commit `cd0305cbcdde9ab459d109cb84fb1a16867c558d`: **checks, backend, staging y required PASS**; [resumen](remote-ci.json). Backend267s, checks124s y staging79s, dentro de12min/job. La corrección documental posterior conserva el código ensayado; el estado del nuevo SHA se consulta en el PR, sin heredar automáticamente este PASS.

[Seguro] [Backend remoto](remote-backend.json) confirma pgTAP completo PASS, tipos coincidentes, integración sesión/RLS y81/81 integraciones de producto,0 omitidas. [Portabilidad remota](remote-portability.json) confirma las16 etapas del ensayo; [fallo/cleanup](remote-portability-fault.json) conserva el FAIL inyectado esperado y cleanup PASS. No se adjuntan logs crudos ni credenciales.

[Seguro] La reproducción del archivo base demuestra que el fallo local de cuota ya existía fuera del diff #150 **en ese stack local**. CI limpio no lo reproduce. Esta evidencia no identifica su causa ni autoriza presentarlo como defecto SQL global, fallo remoto o riesgo introducido por este PR. Los resultados locales se mantienen como FAIL en su propio entorno; no se reemplazan ni ocultan con el PASS remoto.
