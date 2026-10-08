# MIG-13 · Worker y mayoría de edad (#157)

[Seguro] Base `e3a7f7235798c982825be9310c47bc220c11c936` de `origin/develop`, rama `codex/157-worker-mayoria-edad`. Fecha de entrega: 2026-10-07. Dependencias #147/#149/#152 verificadas cerradas e integradas. El grafo se reextrajo sobre esta base (635 archivos, 2890 nodos); código localizado con graphify. Se preserva el cambio ajeno en `apps/web/next-env.d.ts`.

[Seguro] [Worker Nest](../../../apps/worker/README.md), servicio Resend/logger compartidos con API y [migración](../../../supabase/migrations/20261008010000_majority_worker.sql) conservan RPC, historia, avisos ATHLETE/GUARDIAN/ADMIN y `job_runs`. Las funciones nuevas y cola son privadas. Jobs sin propietario/BYPASSRLS accede únicamente a funciones autorizadas; cliente/API no puede leer cola ni destinatarios. Invitaciones usa el mismo servicio de correo conservando texto, timeout y clave existente.

## Agenda y exclusión

[Seguro] El worker consulta cada segundo; PostgreSQL decide fecha/hora Chile, nunca el reloj del contenedor. Encola una tarea por fecha desde 00:30 local. Una hora inexistente en primavera ejecuta al primer instante posterior; el retroceso DST conserva la clave por fecha. Reiniciar tarde procesa a todos los adultos pendientes, aun si perdió días. Los reintentos de correo se ejecutan independientemente a cualquier hora, sin repetir la transición.

[Seguro] Tasks usa PK fecha y lease/token de un minuto, con `SKIP LOCKED`. La confirmación verifica token vigente y bloquea la fila; la RPC canónica, su advisory lock, `job_runs` y finalización de tarea comparten transacción. Una caída antes de completar permite reclamar; una caída durante la transacción revierte todo; una confirmación vieja se rechaza. El job mantiene el histórico INACTIVE y consentimientos. La autorización evalúa edad Chile y corta visibilidad desde el cumpleaños aun antes de 00:30.

[Seguro] La instalación conserva LEGACY. Las RPC públicas antiguas toman lock compartido del estado y rechazan ejecución/claim tras DRAINING. El operador toma lock exclusivo al cortar, por lo que espera transacciones antiguas activas. SQL impide al worker reclamar hasta WORKER, y desprograma exclusivamente el cron de mayoría de edad; anuncios continúa en su hito #159.

## Handoff operativo

[Seguro] Ejecutar con rol de migración/operador, fuera de clientes y con secretos del gestor. No activar el corte externo con este PR automáticamente.

1. Aplicar migración; comprobar worker compilado, rol mínimo, salida Resend y monitor. Mantener LEGACY mientras se valida el artefacto.
2. Ejecutar `select app_private.majority_handoff('DRAINING');`. Verificar ausencia de `cron.job` con jobname `guardianship-majority`. Nuevas llamadas al legado fallan; worker aún no reclama.
3. Detener/retirar todas las instancias/versiones de la Edge `guardianship-majority`, bloquear invocación directa y esperar que terminen/aborten sus solicitudes al proveedor. Comprobar solicitudes pg_net anteriores y ejecución Edge/proveedor: **no activar si queda un proceso suspendido, envío en curso o resultado incierto sin conciliar**. Conservar evidencia operativa sin PII/tokens.
4. Esperar al menos 11 minutos desde DRAINING. El legado usa lease de 10 minutos, lotes de cinco correos con timeout HTTP de 10 segundos por correo y separación de 600 ms: ≤52,4 segundos de transporte esperado. El minuto adicional cubre ese lote; no acredita la terminación de un proceso suspendido ni de una petición DB sin timeout. La retirada del punto 3 es obligatoria.
5. Tras comprobar esa retirada, ejecutar `select app_private.majority_handoff('WORKER', true);`. El booleano constituye la constancia del operador; SQL verifica plazo, modo y ausencia de cron. Sin esa constancia, el plazo por sí solo no permite activar.
6. Iniciar/continuar worker; verificar transición del día, backlog decreciente y alertas. Entregas antiguas reclamadas sin payload durable se bloquean para conciliación, evitando reenviarlas automáticamente.

[Seguro] SQL garantiza exclusión de transacciones/claims y cercado de confirmaciones; el procedimiento garantiza quiescencia de las solicitudes externas antiguas. No puede cancelar HTTP ya enviado ni demostrar ausencia de un proceso Edge mediante un booleano. La garantía de no duplicar exige cumplir ambos. El control no permite volver a LEGACY por un cambio de flag: ante fallo, detener worker y restaurar su artefacto compatible manteniendo cola/ledger; recuperar leases y seguir con un único ejecutor.

## Entrega, idempotencia y operación

[Seguro] Cada correo conserva `guardianship-majority-<delivery_id>` y congela en PostgreSQL el payload completo antes de contactar Resend. Reintenta el mismo cuerpo aunque cambie nombre/email/remitente o se despliegue otra versión. El acuse se cerca con claim token; un fallo o pérdida de acuse mantiene pendiente. Backoff exponencial de 60 segundos a una hora; exclusión global de claims cada 600 ms entre réplicas. El ritmo por defecto es ≤1 solicitud/s.

[Seguro] Resend conserva idempotency keys durante **24 horas** y exige mismo payload ([documentación primaria](https://resend.com/changelog/idempotency-keys)). Tras **23 horas desde el primer intento**, el worker bloquea cualquier envío incierto sin repetir automáticamente una clave vencida. No se garantiza entrega automática ante una caída prolongada. No borrar recibos ni resetear primera fecha/clave para reintentar.

[Seguro] Para conciliación, usar operador y recibos privados, fuera de logs/artefactos: consultar evidencia del proveedor. Si hubo aceptación, registrar `sent_at` con su evidencia; si existe prueba de que no hubo envío, habilitar de forma controlada un nuevo intento con payload estable y documentar la decisión. Si el resultado sigue incierto, mantener bloqueado. Para reintentos ordinarios dentro de 23 h, operador puede adelantar `retry_at`; no altera token ni borra historia. Para reiniciar tareas, esperar/expirar exclusivamente un lease vencido; nunca marcar completado manualmente para ocultar un fallo.

[Seguro] Cada tick publica solo contadores `pending`, `blocked`, `retries`, `oldest_seconds` y `transition_overdue`. Evento `worker_backlog` si blocked>0, antigüedad>600 s o falta ledger desde 00:35 Chile; `worker_failed` ante DB/proveedor. Configurar el monitor de logs para alertar ante esos eventos y ausencia de `worker_tick`/`worker_backlog` durante 120 s; no incluir cuerpos, SQL, errores, emails/nombres, keys, tokens ni URL de conexión. Estas señales están implementadas; la conexión a un canal externo queda pendiente del despliegue, sin crear un destinatario por inferencia.

## Evidencia

[Seguro] Entorno local macOS arm64, Node24.16.0, pnpm10.33.2, Docker29.3.1, Supabase local sintético/PostgreSQL17. Los resultados finales se registran abajo; ningún mock ni integración omitida se presenta como entrega externa.

| Verificación | Resultado |
| --- | --- |
| CI checks completo: lint/typecheck/build/contrato/unitarias | PASS; core 150, web 885; 81 integraciones web omitidas allí y ejecutadas abajo |
| Unitarias worker | PASS: 5, 0 omitidas |
| pgTAP worker/pupilos | PASS: 91 assertions; transición real por lease, handoff reforzado, DST y cambio de día |
| Dos workers + crash de proceso + proveedor HTTP fallido + acuse perdido | PASS: misma clave y payload, una aceptación; SIGTERM probado en contenedor |
| Tipos regenerados desde base local | PASS: contrato público idéntico (solo funciones privadas nuevas); comparación normalizada por whitespace |
| Backend local | FAIL por pgTAP send_invitations #15 ajeno; todos los módulos HTTP Nest PASS, portabilidad PG17.9 y tipos PASS |
| Integraciones Edge separadas tras ese fallo | PASS: 81/81, 0 omitidas (52,65 s) |
| CI remoto | PENDIENTE al commit; verificar checks del PR |
| Contenedor worker y señales | PASS: PostgreSQL con rol jobs mínimo, solo lectura, SIGTERM exit 0; digest sha256:5022c2346ded8db831c91fdd0582cf84ef55eeda55ee0c52cf663970430a0cb6 |
| Resend real / corte externo / monitor externo | PENDIENTE: no hay cuenta/destinatario sintético autorizado/configurado para el proveedor externo |

[Seguro] El fallo local de `send_invitations.test.sql` #15 procede de su aserción global de tabla vacía: hay una fila de cuota para grupo QA120 fijo `01200000-0000-4000-8000-000000005000`, creado 2026-10-05 y con última invitación 2026-10-07 14:36 UTC, previa a esta ejecución. Las integraciones Nest usan grupos UUID aleatorios y eliminan explícitamente su cuota; el worker no toca esa tabla. El archivo exacto de origin/develop reproduce FAIL15; al excluir esa fila únicamente dentro de BEGIN/ROLLBACK, sus 51 assertions pasan y la fila se restaura. No se cambia el test ajeno ni se limpia el fixture del usuario. Backend CI permanece FAIL en ese stack contaminado; las 81 Edge se ejecutaron separadamente para no omitirlas.

[Seguro] Portabilidad conserva allowlist exacta de las tres firmas que referencian cron/net/vault: una función adicional falla el gate. En PG17.9 independiente se ejecuta y verifica LEGACY→DRAINING→WORKER sin pg_cron; se retiran únicamente los dos dispatchers antiguos del fixture destino. La auto-revisión corrigió el caso de tarea del día anterior que intenta completar antes de 00:30 del nuevo día y la configuración que podía detener transición por falta de secretos de correo. Sus checks afectados se repitieron PASS.

[Seguro] Pruebas y runners se agregan a `ci:checks` y `ci:backend`. El PR no cierra el issue ni ejecuta corte, merge o limpieza. La provisión externa de #147 continúa pendiente y no se deduce de estos tests.
