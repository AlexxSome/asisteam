# #209 · Aceptación de desarrollo del stack nativo

[Seguro] Responsable y aprobador de desarrollo: Alex (`@AlexxSome`), según [#209](https://github.com/AlexxSome/asisteam/issues/209). La entrega técnica de MIG-24 se integró en #207; #168 y #144 están cerrados administrativamente. El trabajo operacional transferido permanece en #209. Este registro no acepta desarrollo en nombre de Alex ni autoriza producción.

[Seguro] Stack vigente: React19/Vite7/React Router7 Data Mode → Nest/Node24/Auth propio → PostgreSQL17 y S3 privado, con Worker separado. La mención a Next.js en #209 corresponde al stack anterior; manda [doc06](../../06-arquitectura-y-stack.md) y el [runbook WEB-10](../../web-migration/issue-222/README.md). Los inventarios históricos MIG-24 conservan sus resultados originales.

## Artefacto y alcance de esta ejecución

| Campo | Valor |
|---|---|
| Fuente de producto | `4bcf32005b8cb2dae5e5ae3904b1b7c18f7d04ae` (develop, merge #242) |
| Rama de preparación | `codex/209-aceptacion-desarrollo` |
| Runtime | Node `24.16.0`, pnpm `10.33.2` |
| Ensayo automatizado | `local-synthetic`, fixtures Docker desechables propiedad de cada runner |
| Destino de aceptación de desarrollo | `dev209-local-persistent`, instalación local aislada y persistente elegida expresamente por Alex en este Mac; web `http://127.0.0.1:3149` |
| Origen de datos del ensayo | Instalaciones nuevas con datos sintéticos; no se transfieren datos reales |
| Decisión de desarrollo | PENDIENTE de Alex |
| Producción | **NO-GO** |

[Seguro] La preparación entrega [tooling local persistente](../../../deploy/development/README.md), documentación y evidencia; no cambia código de producto, SQL, UI ni workflows. Los informes identifican el SHA de producto anterior y la ejecución local. Un documento modificado en el árbol de trabajo no convierte ese SHA en el commit de entrega de la documentación. El [manifiesto](artifact-manifest.json) registra los bytes construidos de web/API/Worker y el árbol de fuentes validado.

## Instalación local y evidencia del destino

[Seguro] [Runbook ejecutable](../../../deploy/development/README.md): `node deploy/development/local.mjs up`, `verify` y `serve`. PostgreSQL/S3 tienen volúmenes propios con etiqueta209; secretos distintos por rol permanecen fuera de Git en `.qa/issue-209/`, directorio700/archivos600. PG dispone de límite1GiB/2CPU, S3 de512MiB/2CPU; pool API2 y Worker2. Es capacidad configurada para desarrollo, sin medir aún su adecuación bajo la carga que Alex elija.

[Seguro] El 16-10-2026 se ejecutó `up → verify → up → serve → verify-flows → Ctrl+C → stop → up → verify → serve → verify-flows`. Antes de añadir la carga, los dos clubes y el objeto privado existente conservaron el mismo hash de marcador `5aace9f2b163f5bd672cc86565f273120499f8c80ba9223928b49ff62eb7b79f`. No se borraron tablas, consentimientos, cuentas ni volúmenes. Un segundo `serve` fue rechazado mientras estaba activo el primero. [verification.json](verification.json) registra permisos/ledger; [smoke.json](smoke.json), Auth/V6 y conservación; [browser.json](browser.json), login real375px y cookie HttpOnly. Las cuentas adultas y su aceptación de términos fueron sembradas como fixtures, no como consentimiento humano ni prueba de registro; contraseñas solo en `.qa/issue-209/accounts.json` privado.

[Seguro] Web/API/Worker usan el build local identificado por el manifiesto, con servicios en primer plano y datos persistentes. Deben detenerse antes de reconstruir/cambiar de rama. El servidor web devuelve200 a la navegación browser de login y al HTML legal; un `fetch` marcado CORS puede obtener404 para el shell por el contrato del gateway. Esta instalación permite revisar desarrollo; no satisface por sí sola todos los criterios de #209.

## Carga, backups y ventana aprobados

[Seguro] Alex adoptó el escenario500 ATHLETE/5.000 registros, concurrencia1y4 y p95≤500ms para desarrollo. `node deploy/development/load.mjs` conserva datos sintéticos nuevos en el grupo A; utiliza un plan ACADEMY sembrado como fixture, sin pago ni receipt real. [load.json](load.json) registra192solicitudes en ocho celdas SQL/HTTP equivalentes, cero errores, p50/p95, CPU/memoria y conexiones; p95máximo407,29ms. Este resultado corresponde al Mac, no al ensayo efímero de qualification.

[Seguro] Alex adoptó RPO15min/RTO60min, backups cifrados cada15min y retención30d, con disponibilidad de esta noche hasta07:30 del16-10-2026 America/Santiago. Se inició un scheduler local separado con corte en `2026-10-16T10:30:00.000Z`, cadencia900s, sin notificaciones ni dependencia de otro agente. [backup-schedule.json](backup-schedule.json) registra la ventana; [scheduler-start.json](scheduler-start.json) comprueba proceso activo y primer backup programado. Falta observar la noche completa. Suspender el Mac/Docker o terminar el proceso interrumpe la cadencia; el RPO sostenido continúa **PENDIENTE**.

[Seguro] [backup.json](backup.json) registra el archivo cifrado (AES-256-GCM, clave privada separada600); [restore.json](restore.json) acredita restauración aislada del dataset completo, reconciliación del dump lógico/ledger y objeto, rechazo de ciphertext alterado y3,79s frente al RTO3600s adoptado. El ensayo se identifica por `archiveSha256` de restore.json; los archivos generados después conservan su propia procedencia y no se declaran restaurados por ese ensayo. [backup-behavior.json](backup-behavior.json) verifica parada de ventana, liberación de bloqueo, expiración de un archivo propio autenticado31d y preservación de archivo ajeno al patrón. Solo se destruyeron fixtures nuevos de restauración; el destino persistente conserva su historia.

[Seguro] Los archivos/claves permanecen en el mismo Mac; falta copia privada fuera de ese disco. El backup tiene snapshot transaccional DB y rechaza cambios de inventario/ETags S3 durante la captura, pero no prueba atomicidad entre DB/S3 ante escrituras concurrentes previas a ese inventario. El dataset del ensayo era sintético y estable. PITR está validado por CI en una fixture separada y sigue pendiente en el destino persistente. Estos límites impiden declarar continuidad operacional completa.

## Correspondencia con CI

[Seguro] La fuente de producto permanece en el SHA indicado. Los scripts nuevos están en `deploy/development`; backend no los importa y los Dockerfiles de API/web copian únicamente sus módulos `apps/`, `packages/` y manifests, sin `deploy/development` ni `.qa`. Por ello backend y staging aprobados conservan sus inputs. Tras añadir backup/load se repitió `ci:checks` íntegro (incluye lint/retirada), se ejecutó el probe y se repitió extended. [validated-tooling.json](validated-tooling.json) fija los hashes de los cuatro scripts nuevos verificados por las pruebas del destino. Documentación/resultados se actualizan después sin alterar fuentes de runtime.

[Seguro] El [intento inválido de extended](ci-orchestration-failure.json) falló conTS6053 porque el operador ejecutó a la vez el probe, que crea/retira un archivo TypeScript intencionadamente inválido, y el build de extended. Se conservaron el fallo y su causa; la repetición se hace con probe terminado, sin builds ni mutaciones simultáneas. No se modifican assertions ni CI para obtener verde.

[Seguro] `.github/workflows/ci.yml` aplica a todos los PR, sin filtros de archivos ni matriz. Se usan sus scripts íntegros en Node24.16.0/pnpm10.33.2, con `pnpm install --frozen-lockfile` e instalación Chromium del job backend. La máquina local es macOS arm64; GitHub usa Ubuntu24.04. No se presenta esta ejecución como CI remoto. Los contenedores son locales, efímeros y sintéticos; `ci:staging` no despliega en staging externo.

| Job/paso | Comando | Resultado y evidencia |
|---|---|---|
| Preparación | `pnpm install --frozen-lockfile` | PASS; lockfile vigente sin modificaciones |
| Backend: navegador | `pnpm --filter @asisteam/web exec playwright install --with-deps chromium` | PASS |
| checks | `pnpm ci:checks` | PASS final:lint/contratos/tipos/build/infra/bundle/retirada;154core+503web sin omisiones y API/Worker/SDK; [checks.json](checks.json) |
| backend | `pnpm ci:backend` | PASS:40 suites/1.646 SQL, guards nativos,84 integraciones sin omisiones; [backend.json](backend.json) |
| backend: detección de fallos | `node scripts/ci/probe.mjs` | PASS: cuatro fallos esperados detectados; [controlled-failure.json](controlled-failure.json) |
| staging | `pnpm ci:staging` | PASS: roles, imágenes y rollback API/web, limpieza propia; [staging.json](staging.json) |
| extended | `pnpm ci:extended` | PASS secuencial:68 matrizNest+42 paridad+1 transporte, cero omisiones; [extended.json](extended.json) |
| qualification | `pnpm ci:qualification` | PASS técnico; aceptación NO-GO separada; [qualification.json](qualification.json) |
| required | Conjunción de checks/backend/probe/staging/extended/qualification | PASS local; [ci-summary.json](ci-summary.json); no se afirma CI remoto |
| Artefactos GitHub | upload/download de JSON sanitizados | N/A local: transporte interno de GitHub; se conservan los mismos reportes localmente |

[Seguro] `.github/workflows/extended.yml` solo se dispara manualmente o por horario semanal; no agrega otro job al PR. Su comando ya se reproduce con `ci:extended`. Los FAIL esperados por los probes se conservan como tales y solo cuentan como detección correcta cuando el runner verifica explícitamente el rechazo y termina PASS. Los datos crudos de navegador/proveedores, credenciales, dumps y tokens no se copian a esta carpeta.

## Bitácora de los diez pasos

[Seguro] Cada estado corresponde al criterio operacional completo del paso. Un PASS sintético adjunto no cambia un PENDIENTE operacional. Fecha de preparación: 2026-10-16, zona America/Santiago. Responsable de preparación técnica: Codex; aceptación y decisiones: Alex. No se usa N/A operacional sin justificación y aceptación de Alex.

| Paso | Responsable | Fecha | SHA / entorno | Estado | Evidencia disponible | Acción siguiente |
|---|---|---|---|---|---|---|
| 1. Artefacto/regresión | Codex prepara; Alex acepta | 2026-10-16 | SHA de producto anterior / local-synthetic | PENDIENTE aceptación | Tabla de CI y manifiesto de esta carpeta; destino local usa ese build | Completar gates finales y aceptación del artefacto por Alex |
| 2. PostgreSQL destino | Codex verifica; Alex acepta | 2026-10-16 | dev209-local-persistent | PENDIENTE aceptación | [verification.json](verification.json):17, ledger5 migraciones, roles mínimos y rechazo DDL42501; [smoke.json](smoke.json): tenant propio200/ajeno404 | Alex acepta capacidad local y resultado; TLS remoto no aplica al loopback, sin declarar C-09 completo |
| 3. Datos/objetos | Codex verifica; Alex acepta | 2026-10-16 | Instalación nueva dev209 | PENDIENTE | Dos cuentas adultas/dos clubes sintéticos y un objeto privado; hash idéntico tras reinicio; anónimo403 | Completar conjunto menor/apoderado/consentimiento/asistencia en destino y aceptar cifrado/retención; R1/V1–V6 completos siguen probados por CI en fixtures separados |
| 4. Auth/proveedores | Codex verifica; Alex acepta | 2026-10-16 | dev209 y CI separados | PENDIENTE | Login/refresh/logout/revocación y cookie HttpOnly reales en dev209 ([smoke](smoke.json), [browser](browser.json)); proveedores sin credenciales | Recovery/invitación/claim y proveedores requieren configurar integración del destino y receipts; no equivalen a CI simulado |
| 5. Worker/notificaciones | Codex verifica; Alex acepta | 2026-10-16 | dev209-local-persistent | PENDIENTE | Un supervisor con bloqueo exclusivo, API/Worker/web separados, Worker reiniciado y ticks sin backlog; backend comprueba leases/reintentos | Medir recuperación de job interrumpido y recepción real del transporte en destino; completar inventario inferior |
| 6. Rendimiento | Codex mide; Alex acepta | 2026-10-16 | dev209-local-persistent | PASS técnico; aceptación pendiente | [load.json](load.json): escenario aprobado500/5000,192solicitudes/8celdas, cero errores, p50/p95 y CPU/memoria/conexiones; p95máx407,29ms≤500 | Alex acepta resultados medidos; no se establece SLA productivo |
| 7. Observabilidad | Alex | Pendiente | dev209; sin panel/canal designado | PENDIENTE | Logs sanitizados y health/ready200 en destino; sin alerta externa recibida | Designar paneles, receptor, umbrales/canal; provocar fallo, recibir alerta y comprobar resolución/scrubbing |
| 8. Continuidad | Codex prepara/mide; Alex acepta | 2026-10-16 | dev209-local-persistent | PARCIAL | Objetivos aprobados RPO15min/RTO60min, backup cifrado15min/retención30d; [restore.json](restore.json): restauración aislada3,79s con dump/objetos completos | Observar cronología/RPO; definir copia externa/clave, PITR del destino y aceptar límites de consistencia/cifrado host |
| 9. Ventana/autoridad | Alex | 2026-10-16 | dev209-local-persistent | PARCIAL | Disponibilidad autorizada desde esta sesión hasta07:30 America/Santiago16-10-2026 para backups; coordinador Alex; instalación nueva sin traslado | GO/NO-GO final de desarrollo pendiente; esta ventana de backup no autoriza corte/traslado ni producción |
| 10. Producto/legal | Alex | Pendiente | Sin aceptación humana | PENDIENTE | Extended automatiza roles/axe/teclado/viewports | Ejecutar guion humano inferior y revisar C-01…C-20; registrar hallazgos y aceptación explícita |

## Proveedores y procesos del destino

| Integración | Modo comprobado por automatización | Estado de integración externa | Evidencia que falta (Alex) |
|---|---|---|---|
| Auth propio | CI: todos los flujos; dev209: login/refresh/logout/revocación, cookie opaca real | PARCIAL destino local | [smoke.json](smoke.json), [browser.json](browser.json); recovery/invitación/claim requieren Resend del destino; sin publicar enlaces ni cookies |
| Google | Transporte sintético de contrato | PENDIENTE | Credenciales/redirect del entorno, login/vinculación e IDs conservados |
| Apple | Transporte sintético de contrato | PENDIENTE | Credenciales/redirect del entorno, login/vinculación e IDs conservados |
| Resend | Transporte sintético | PENDIENTE | Destinatario de prueba autorizado, recibo de recepción y recuperación completada; redactar dirección/token |
| Mercado Pago | Transporte sintético de firma/reintento/idempotencia | PENDIENTE sandbox | Inventario de receptores; mismo evento recibido dos veces y un solo efecto durable; receipt sanitizado |
| Push existente | Transporte sintético de opt-in/reintento/recibo | PENDIENTE | Cliente compatible, credenciales y receipt de entrega autorizados; FCM/APNs continúa fuera de alcance |
| S3 privado | Servidor compatible local persistente elegido; datos sintéticos | PARCIAL destino local | Objeto privado conservado tras reinicio, anónimo403; cifrado/retención aún sin aceptar |
| Sentry/alertas | Verificaciones locales de logging/readiness | PENDIENTE | Panel/canal, alerta recibida por Alex, diagnóstico y resolución con PII eliminada |

[Seguro] La configuración de referencia es `apps/api/.env.example`, los contratos de [doc07](../../07-api-y-backend.md) y el runbook WEB-10. Registrar solo nombres de configuración y evidencia sanitizada. La disponibilidad de una variable o una respuesta simulada no demuestra credenciales válidas ni recepción externa. El destino local tiene una API, un Worker y un gateway web bajo el supervisor. El Worker hace polling cada1s; transición de mayoría se reclama para00:30 America/Santiago mediante la autoridad SQL canónica, y anuncios/recibos se procesan con sus leases. No se configuraron schedulers externos ni receptores remotos de billing. Este inventario debe ampliarse si se conectan integraciones; no se modifica ningún receptor productivo.

## Guion de aceptación humana

1. Alex registra el SHA del artefacto, URL/origen de desarrollo autorizado y cuentas sintéticas por rol: ADMIN, ATHLETE, GUARDIAN, COACH y ADMIN+ATHLETE, con grupos A y B independientes.
2. Recorre acceso/recuperación/invitaciones/claim, grupos, integrantes/apoderados y consentimiento. Intenta activar un menor sin consentimiento y confirma rechazo; verifica que PENDING no entra a la asistencia ni reportes.
3. Recorre actividades/series, toma/corrección de asistencia, historial/reportes y toggles. Confirma 6 PRESENT +1 LATE +2 ABSENT +1 EXCUSED →77,8 %, y denominador cero →«Sin datos». COACH no edita notas ni desmarca. Verifica V1–V6 y rechazo A→B en respuestas y UI.
4. Recorre billing sandbox, anuncios/opt-in, QR y login social cuando estén configurados; registra por separado cualquier dependencia pendiente. La mayoría de edad se prueba con reloj/fixture controlado y pérdida de visibilidad del apoderado, sin modificar usuarios reales.
5. Usa teclado y lector de pantalla real, zoom nativo200 % y asistencia en375 px a una mano. Registra dispositivo, navegador, pasos, resultado y problemas; axe/teclado automatizados no reemplazan esta observación.
6. Completa la checklist siguiente, el procedimiento de soporte/canal/responsable y los hallazgos reproducibles. Una transferencia de pendiente requiere issue vinculado, motivo, responsable y aceptación de Alex. Firma la decisión limitada a desarrollo con fecha, SHA, entorno y límites.

## Checklist legal de desarrollo

[Seguro] El estado canónico de [doc11 §8](../../11-legal-seguridad-privacidad.md#8-checklist-de-cumplimiento-pre-lanzamiento-p0) es Pendiente en los veinte puntos. Aquí se conserva ese estado hasta registrar evidencia y revisión competente. Responsable de seguimiento: Alex; los roles TL/DEV del documento son sugeridos, no personas ya asignadas. Esta tabla organiza pendientes y no constituye asesoría ni aceptación legal.

| ID | Criterio de doc11 | Estado | Evidencia/revisión pendiente y siguiente acción |
|---|---|---|---|
| C-01 | Política/Términos públicos y versionados | PENDIENTE | Alex valida contenido/versión y revisión legal del snapshot público; #107 conserva esta dependencia |
| C-02 | Consentimiento de registro adulto | PENDIENTE | Registrar recorrido del destino con checkbox obligatorio y versión/timestamp persistidos |
| C-03 | Consentimiento del apoderado | PENDIENTE | Adjuntar negativo de menor sin consentimiento y positivo con consentimiento vigente en destino |
| C-04 | V5 en respuestas API | PENDIENTE | Revisar respuestas sanitizadas ATHLETE/GUARDIAN sin PII/notas/apoderados de terceros |
| C-05 | Scoping group_id | PENDIENTE | Adjuntar rechazo403/404 entre grupos independientes en destino |
| C-06 | MANAGED sin acceso | PENDIENTE | Adjuntar intentos negativos por las vías de autenticación habilitadas |
| C-07 | Menor por código permanece PENDING | PENDIENTE | Recorrido sin aparición en asistencia/reportes hasta apoderado y confirmación ADMIN |
| C-08 | Mayoría de edad y pérdida de acceso | PENDIENTE | Scheduler único diario y prueba controlada de vínculo INACTIVE/deactivated_at y acceso revocado |
| C-09 | TLS/HSTS | PENDIENTE | Elegir destino HTTPS y comprobar grado A y contenido mixto; loopback de fixture no satisface el criterio |
| C-10 | Hashing y ausencia de contraseñas en logs | PENDIENTE | Revisión de configuración instalada y evidencia de logs sanitizados del destino |
| C-11 | Rate limiting | PENDIENTE | Reproducir429 controlado en login/recovery/código del destino |
| C-12 | Supresión/anonimización | PENDIENTE | Ensayo sintético de solicitud y agregados consistentes en entorno autorizado |
| C-13 | Borrado de grupo y gracia30 días | PENDIENTE | Ensayo de ocultación, recuperación y purga según criterio; registrar cualquier falta sin inferir implementación |
| C-14 | Backup cifrado/restauración | PENDIENTE | Destino/retención/cifrado y restauración con cola de supresiones; vincular gate8 |
| C-15 | Incidentes/contacto de notificación | PENDIENTE | Alex asigna responsables y canal; aprobación del runbook y contactos por revisión competente |
| C-16 | Registro de actividades de tratamiento | PENDIENTE | Responsable legal mantiene finalidades, categorías y retenciones en registro interno aprobado |
| C-17 | recorded_by/recorded_at | PENDIENTE | Consultar evidencia del destino para todas las vías de escritura de asistencia |
| C-18 | Toggles false por defecto | PENDIENTE | Grupo nuevo sin exposición a ATHLETE/GUARDIAN; adjuntar prueba del destino |
| C-19 | Escaneo de dependencias CI | PENDIENTE | Verificar configuración activa y ausencia de críticas abiertas; lint/build verde no demuestra este criterio |
| C-20 | Expiración de invitaciones | PENDIENTE | Token expirado rechazado y estado EXPIRED en destino, sin publicar el token |

## Datos que Alex debe completar para ejecutar y aceptar

- Destino: Alex eligió instalación local aislada persistente; aceptar capacidad local y registrar si se requiere más adelante un destino remoto. No se ha aprobado uno remoto.
- Carga y umbral: Alex adoptó500 ATHLETE/5.000 registros/concurrencia1 y4/p95≤500ms; medición local PASS, aceptación del resultado pendiente. No es SLA productivo.
- Continuidad: Alex adoptó RPO15min/RTO60min, backup cifrado cada15min y retención30d; restauración lógica local PASS. Faltan observación sostenida, copia externa/clave, soporte PITR del destino y aceptación de límites.
- Observabilidad: paneles, indicadores/umbrales, canal y receptor operativo; credenciales de proveedores en un gestor externo.
- Ensayo: Alex informó disponibilidad nocturna hasta07:30 America/Santiago del16-10-2026. El scheduler local se limita a2026-10-16T10:30Z; no prolonga garantía ni autoriza traslado. La instalación es nueva y sintética; falta aceptación final y suplente si corresponde.
- Aceptación: recorridos por rol, revisión humana/accesibilidad y legal, resultados por paso y decisión GO/NO-GO de desarrollo firmada por Alex.

[Seguro] Hasta completar esos campos y evidencias, #209 permanece abierto. Producción conserva sus gates propios y **NO-GO**; no se ejecuta corte, deploy real, apagado de receptores ni transferencia de datos reales.
