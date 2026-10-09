# Runbook MIG-22 · Mantenimiento, corte y recuperación

[Seguro] Aplicable a un origen con #157–#165 completos y autoridad NATIVE/NEST/WORKER, Storage ya copiado a privado y todo consumidor web/API en Nest. Para un origen con GoTrue/Edge/pg_cron activos, ejecutar primero los handoffs de [Auth](../issue-164/README.md), [billing](../issue-158/README.md), [worker](../issue-157/README.md), [anuncios](../issue-159/README.md) y [Storage](../issue-161/README.md). La herramienta falla si el catálogo no es portable; no elimina esquemas auth/storage, convierte hashes ni transforma filas por inferencia. Preparar una copia de origen compatible y reconciliar su catálogo según [MIG-21](../../../packages/db/README.md) antes de programar la ventana.

## 0. Acta y gates antes de mantenimiento

[Seguro] Registrar en canal privado: SHA/digests de artefactos y esquema, entorno/proveedor, volumen/conteos por tabla/grupo, inventario de escritores y réplicas, operadores nominados y suplentes, duración máxima, RPO/RTO acordados, umbral para recuperar hacia adelante, backup cifrado probado, puntos de recuperación, rutas/redes/secretos y evidencia de proveedor. El informe público conserva solo estados, tiempos, conteos y booleans. PII, sujetos OAuth, credenciales, contratos, recibos y snapshot no se adjuntan al PR.

[Probable] Roles propuestos: mando del corte decide GO/ABORT/RECOVER; operador DB congela/importa; responsable plataforma retira instancias y cambia rutas; responsable billing confirma contratos/eventos; QA verifica paridad y conservación. Nombres/aceptación de SLA siguen PENDIENTES; ninguna persona está asignada por inferencia. Producción permanece NO-GO sin completar el acta y #167.

[Seguro] Ensayar con volumen representativo y medir cada paso y recuperación. Snapshot completo es elegible solo si tiempo de congelación+snapshot+archivos+restauración+reconciliación+QA cabe en mantenimiento/RTO acordados, con margen explícito aceptado. Los umbrales propuestos de #145 no son acuerdos. Si falla este gate, replanificar antes de producción; CDC requiere diseño y ensayo propios, no un cambio de bandera.

## 1. Cerrar admisión y drenar todos los escritores

| Superficie | Acción ejecutable del operador | Evidencia de quiescencia |
| --- | --- | --- |
| UI/Next/proxy | [Seguro] Activar mantenimiento en ingress/hosting; bloquear Server Actions/proxy y desplegar artefacto que no redirija al origen por fallback. Detener todas las instancias/versiones que recibían tráfico | Rutas login/register/recovery/callback/invitación/check-in y cambios de dominio no admiten nuevas solicitudes; conexiones activas=0 |
| API/Auth | [Seguro] Detener contenedores/servicios; bloquear ingreso directo, clientes antiguos y endpoints Auth; drenar requests/transactions antes de cambiar DB | Pools cerrados, requests activos=0; no login/refresh/recovery/linking en ninguna autoridad |
| Jobs/cron/Edge | [Seguro] Detener todas las réplicas de worker; verificar `majority_executor`/`announcement_executor` WORKER. Confirmar cron legado desprogramado y Edge retirada según sus handoffs | Scheduler único; leases/payloads/keys/primer intento preservados; envíos HTTP anteriores terminados o inciertos registrados |
| Billing y webhook | [Seguro] Cerrar checkout/sync/cancel; drenar creaciones remotas/reservas inciertas; conservar ambas URLs de contrato como relay sin ejecutor propio. Durante indisponibilidad responder 503 | Backlog de eventos/consultas proveedor conciliado; ninguna respuesta 2xx sin commit; firma/HMAC e IDs verificados al replay |
| Archivos | [Seguro] Cerrar cargas al Storage antiguo/S3 y vencimiento/denegación de URLs de carga ya emitidas; detener escritores directos de bucket | Inventario final completo, incluidos uploads huérfanos; referencias/owner/tamaño/tipo/SHA correctos |
| Operadores/migrador/otros | [Seguro] Detener migraciones, imports, consolas y jobs manuales; inventariar cada login DB, no solo los seis roles conocidos | Operador de copia es único con sesión privada; ningún script administrativo escribe |

[Seguro] `docker compose stop`/retirada de servicios se aplica al proyecto exacto del entorno y a todas sus réplicas; revisar IDs de instancia antes de hacerlo. No hay un comando universal para Vercel/proveedor no elegido. Los controles externos deben constar en el acta y ejecutarse en el ensayo externo. Un flag de UI, espera fija o resultado SQL no prueba ausencia de un proceso suspendido ni cancela HTTP ya enviado.

[Seguro] Operador DB, tras drenar servicios, ejecutar en **origen** en conexión propia (nunca incluir URL en argumento, logs o repositorio). El bloqueo CONNECT no mata sesiones existentes; se inspeccionan y se terminan solo las escritoras del entorno autorizado después de drenar. Revocar también roles adicionales inventariados. La herramienta comprueba los roles propios pero no puede descubrir todos los escritores de un proveedor.

```sql
-- Sustituir origin_db por el nombre verificado, sin reutilizarlo en otro entorno.
REVOKE CONNECT ON DATABASE origin_db FROM PUBLIC,
  asisteam_migrator,asisteam_api,asisteam_jobs,asisteam_auth,
  asisteam_invitation,asisteam_billing;
SELECT usename,state,count(*) FROM pg_stat_activity
WHERE datname=current_database() AND pid<>pg_backend_pid()
GROUP BY usename,state;
-- Tras investigar/drain de cada sesión, terminar escritoras conocidas:
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE datname=current_database() AND pid<>pg_backend_pid()
AND usename IN ('asisteam_migrator','asisteam_api','asisteam_jobs',
 'asisteam_auth','asisteam_invitation','asisteam_billing');
SELECT mode FROM app_private.auth_authority; -- NATIVE
SELECT mode FROM app_private.billing_transport; -- NEST
SELECT mode FROM app_private.majority_executor; -- WORKER
SELECT mode FROM app_private.announcement_executor; -- WORKER
```

[Seguro] Abortar aquí si quedan writers/scheduler/envíos inciertos sin conciliar, contratos sin receptor/reintento acreditado, bucket con nuevas cargas o DB en modo incorrecto. Billing conserva reservas de resultado incierto; jamás repetir POST remoto automáticamente ni liberar una reserva sin evidencia de ausencia remota. Correo incierto fuera de 23 h permanece bloqueado según #157, con misma key/payload/fecha; no resetearlo para convertir el gate en verde.

## 2. Snapshot final, instalación y reconciliación

[Seguro] Provisionar una DB **nueva**, todavía inaccesible al runtime, con bootstrap/roles/migrador de MIG-21, aplicar baseline y cerrar la sesión de despliegue. Revocar CONNECT a PUBLIC y los seis roles igual que en origen. El operador de restauración requiere sesión administrativa SUPERUSER en la DB aislada; runtime continúa sin ownership/BYPASSRLS. Si el proveedor gestionado no ofrece esta capacidad, detenerse y ensayar un método de bulk restore equivalente con su proveedor antes del corte. No conceder SUPERUSER al API para sortearlo.

[Seguro] El snapshot contiene las 44 tablas public/app_private, incluidos UUIDs, hashes, OAuth, familias/revocaciones, import ledger, consentimiento, reservas/facturas, cola/leases y archivos de manifiesto. `db_migrations` se instala por migrador y verifica independientemente; no sustituir su historia. Snapshots JSON y manifiestos se guardan en directorio privado0700/archivo 0600, cifrados externamente; límite del tooling 64 MB al leer. No adjuntar digests de filas/credenciales ni plaintext. Export requiere catálogo exacto y versiones actuales: cualquier divergencia necesita reconciliación explícita, no ignorarla.

```sh
# Variables privadas suministradas por el gestor: CUTOVER_OPERATOR_URL,
# CUTOVER_SNAPSHOT_PATH (ruta privada), CUTOVER_ACK.
# CUTOVER_ACK=isolated-target-all-writers-frozen
node packages/db/scripts/cutover.mjs export
# Cambiar CUTOVER_OPERATOR_URL exclusivamente al destino nuevo/cuarentenado.
node packages/db/scripts/cutover.mjs restore
node packages/db/scripts/cutover.mjs verify
# Volver al origen, aún congelado, y verificar el mismo snapshot final.
node packages/db/scripts/cutover.mjs verify
```

[Seguro] Cerrar las consolas SQL de inspección/despliegue antes de cada invocación: la herramienta exige una única conexión de operador y rechaza cualquier otra sesión del entorno. El último `verify` utiliza URL de origen y el snapshot exportado antes de abrir destino; si origen cambió durante la copia, detenerse y repetir la congelación/reconciliación. No reutilizar una copia inicial como snapshot final de una recuperación posterior.

[Seguro] Importación es una transacción de operador: copia sin volver a disparar efectos de negocio, comprueba todos los hashes/IDs/columnas, CHECK/unique, cada FK, R1 y relación ATHLETE/grupo de asistencia antes del commit. `SET LOCAL session_replication_role` se limita a esa transacción administrativa; rollback restaura datos/settings si falla. El destino con cualquier historia ajena a los seeds iniciales se rechaza. Nunca ejecutar restore sobre la base que recibió escrituras. Una segunda recuperación necesita otra instalación vacía.

[Seguro] Archivos iniciales/delta se reconcilian mediante MIG-17 con bucket privado y manifiesto nuevo por pasada. Repetir tras congelar todos los escritores y comparar inventario completo, referencias activas, propietario, tipo/tamaño/bytes/SHA, incluyendo huérfanos de commit incierto. Storage S3 actual puede mantenerse como autoridad al mover DB; no regresar a su snapshot viejo. Si cambian buckets, copiar todo el manifiesto final y verificar bytes/privacidad antes de abrir referencias. El ensayo MIG-22 copia entre dos buckets S3 reales locales; copia externa y permisos del proveedor requieren su propia evidencia.

[Seguro] Comparar conteos por tabla/grupo, IDs/FK, consentimiento vigente/revocado, ledger/timestamps/keys, import map/UUID, credenciales nuevas/reemplazadas, OAuth y sesiones revocadas, métricas canónicas 77.8/null y permisos V1–V6/R1. Ejecutar gate backend y QA representativa #167. No admitir destino ante checksums diferentes, datos faltantes, política/grant discrepante, import parcial o evento declarado aceptado sin persistencia.

## 3. Primera admisión y scheduler

[Seguro] Con origen bloqueado y destino reconciliado, apuntar **todas** las conexiones de API/Auth/invitaciones/billing/worker a la misma DB destino; conservar issuer/secret/clients OAuth y S3 actuales. Configurar Next `ASISTEAM_DATABASE_MODE=independent`, AUTH y todos los transportes=nest. Restaurar artefacto Nest compatible y readiness antes de abrir ingress. No activar Edge/cron viejo. Conceder CONNECT solo a runtime en destino; migrador queda cerrado salvo sesión autorizada puntual.

```sql
-- Solo en destino, manteniendo origen congelado.
GRANT CONNECT ON DATABASE destination_db TO asisteam_api,asisteam_jobs,
 asisteam_auth,asisteam_invitation,asisteam_billing;
```

[Seguro] Iniciar un conjunto de workers destino con su misma cola; varias réplicas comparten leases. Registrar cada fecha/job/receipt y comprobar que ninguna instancia origen ejecuta. Un lease trasladado aún vigente no se reclama; al expirar, exactamente un sucesor puede finalizar y su token cerca confirmaciones anteriores. No borrar/adelantar leases en producción para acelerar un ensayo.

[Seguro] Ambas URLs MP, incluidas notification_url fijadas en contratos existentes, apuntan al único motor destino. Relay conserva firma/body/IDs y solo propaga 200 después del commit. Durante pausa responde 503 para reintento; el ensayo acredita reintento de **proveedor simulado**, no la política real de MP. Antes de producción acreditar sandbox por contrato anterior/nuevo, recibos de replay y reconciliación paginada de facturas/pagos. Si no se demuestra retry real, escoger y ensayar una recepción duradera antes de aceptar; no afirmar que existe una inbox en esta entrega. No retirar la URL Supabase mientras un contrato/reintento dependa de ella (#158/#168).

[Seguro] Registrar hora de primera escritura de cualquier superficie. Desde entonces ABORT al origen queda prohibido. Observar errores/backlog/latencia/pool, recibos proveedor y diferencias; criterios operativos del acta deciden continuar o recuperar. No interpretar retorno web/AUTHORIZED como PAID. No resetear ledger, cuotas, miembros, historial o keys durante observación.

## 4. Fallo y decisión de recuperación

| Momento | Ruta permitida | Condiciones |
| --- | --- | --- |
| Antes de toda escritura en destino | [Seguro] ABORT: descartar destino en cuarentena, verificar snapshot de origen intacto, reabrir solo origen y su scheduler | No login/refresh/job/upload/evento/operador ha escrito en destino; Auth no se revierte a LEGACY |
| Después de primera escritura, DB intacta | [Seguro] RECOVER_FORWARD: cerrar admisión/efectos, restaurar artefacto compatible contra DB/S3 actuales, reconciliar inciertos y reabrir | Deltas intactos, permisos y contratos compatibles, un escritor/ejecutor; dentro del RTO acordado |
| DB requiere reemplazo | [Seguro] Congelar destino; snapshot final/PITR en otra DB, reconciliar todos los commits/deltas/bytes, verificar y cambiar conexiones | Snapshot viejo solo sirve como comparación; ningún commit aceptado falta; origen permanece cerrado |
| Retorno a GoTrue/Edge/Storage anterior | [Seguro] NO-GO por bandera: nueva migración de todas las credenciales/vínculos/deltas, contratos y scheduler | #164 no ofrece reverse de Auth; hashes Argon2 y linking nuevos no se presuponen compatibles |
| Backup incompleto, deltas irrecuperables o RTO superado | [Seguro] Mantener mantenimiento, escalar al mando y replanificar recuperación/corte; declarar pérdida/pendiente real si existe | No declarar RPO 0 ni abrir origen para ocultar el fallo |

[Seguro] La recuperación ensayada congela destino después de nuevas cuentas/contraseña/asistencia/consentimientos/avatar/factura/job, demuestra diferencias con snapshot inicial, copia las 44 tablas/objetos completos a una DB nueva, compara hashes/FK/IDs y prueba login con contraseña posterior; la vieja deja de autenticar. Un evento que recibió 503 se reenvía con firma fresca, termina PAID y replay no duplica factura. La copia conserva el lease antes de reclamar su sucesor. Se prueba recuperación hacia adelante, no reverse automático a Supabase.

## 5. Medición y acta de salida

[Seguro] Medir inicio/cierre de admisión, drenaje, snapshot, bytes, copia/restauración, reconciliación, primera escritura, detección/freeze/recuperación/readiness y reapertura. RTO=interrupción desde fallo hasta disponibilidad comprobada; RPO=commits aceptados faltantes respecto del último estado durable reconciliado. El ensayo local mide su ruta desde iniciar recuperación hasta verificaciones finales, con presupuesto interno 60 s y cero commits confirmados perdidos. No incluye detección humana/provisión gestionada/volumen real; no equivale a RTO productivo.

[Seguro] Si cualquier medición externa supera el acuerdo, cambiar ventana/plan y repetir antes de producción. Acta pública: SHA/entorno/fecha, PASS/FAIL/PENDIENTE por gate, conteos/tiempos y límites. Acta privada: firmas de responsables y manifiestos/recibos cifrados. Mantener origen cerrado y backups por retención acordada durante observación; retirada definitiva/limpieza pertenece a #168 y no se ejecuta aquí.
