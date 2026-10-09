# MIG-23 · Seguridad, paridad y carga del destino (#167)

[Seguro] Base `develop@26a1d8a3ac61f48e7cda957436b9faadb657d892`, rama `codex/167-seguridad-paridad-carga`, fecha 2026-10-08. Dependencias MIG-03/MIG-12…MIG-22 integradas en esta base. Los resultados corresponden a fixtures sintéticos; el cierre de aceptación de #167 y el corte #168 siguen **NO-GO** hasta completar los gates externos y humanos de esta matriz.

## Gate reproducible

```sh
pnpm install --frozen-lockfile
pnpm ci:checks
pnpm ci:backend
pnpm ci:staging
pnpm ci:extended
pnpm ci:qualification
```

[Seguro] Node24.16.0, pnpm10.33.2, Docker y Chromium requeridos. Ejecutar en secuencia: builds, smokes Next y E2E comparten cachés y puertos. El gate backend añade [calificación del destino](../../../apps/api/test/destination-qualification.mjs) dentro del [ensayo PostgreSQL independiente](../../../apps/api/test/independent-postgres.integration.mjs). Usa PostgreSQL17 real, roles separados y sesiones Nest nativas sin runtime Supabase. El helper prepara y elimina únicamente sus propias filas en la DB efímera del ensayo; no recibe URLs externas ni altera SQL/grants/tipos de producto.

[Seguro] Fixture de carga: 500 ATHLETE activos, 5.000 registros nuevos (diez convocatorias con seis PRESENT, un LATE, dos ABSENT y un EXCUSED), 100 filas por página. Ocho celdas: reporte/estadísticas × SQL/HTTP Nest × concurrencia 1/4, 24 solicitudes por celda, pools de dos conexiones. Cada respuesta se compara con la RPC canónica bajo el rol real `asisteam_api` y el mismo contexto de identidad. Los sondeos del worker ejecutan métricas simultáneamente; las pruebas de dos réplicas/claim/replay del backend verifican ejecución e idempotencia de jobs por separado.

[Seguro] p95 incluye espera del pool y overhead del transporte; cada celda exige ≤500ms y sondeos worker <2.000ms. Fallos bloquean `ci:backend`/CI required y conservan las mediciones completadas con estado FAIL. Se comprueba también que el pool de referencia queda sin solicitudes pendientes, conexiones observadas ≤2 por pool y readiness posterior. Los límites de conexiones son del fixture (servidor 40), no una capacidad acordada de producción.

[Seguro] La referencia de carga es SQL canónico en **el mismo destino**, con BEGIN/ROLLBACK y GUC de identidad. La suite MIG-12 adicional compara SQL bajo `authenticated` del origen con HTTP Nest en el mismo fixture de 500. No son una comparación end-to-end del HTTP Supabase desplegado contra un destino desplegado. No se atribuyen sus diferencias de latencia a un proveedor ni a una mejora productiva; esa medición queda pendiente con volumen/infraestructura/carga acordados.

## Matriz de requisitos y evidencia

| Requisito | Gate técnico / cobertura | Resultado local |
| --- | --- | --- |
| R1 / V1–V6 / aislamiento | pgTAP destino y completo, HTTP members/consents/reports/session RLS; menor sin consentimiento rechazado, toggles independientes, permisos y proyección sin PII | PASS local |
| SQL↔core / 77.8/null | Nueve casos canónicos compartidos; períodos Chile, historial propio/apoderado y reporte | PASS local |
| COACH/multirol/concurrencia | Destino nativo: ADMIN+ATHLETE, notas/desmarcado COACH403, ocho writes concurrentes sin duplicación y V3 al cumplir 18 mediante reloj efímero restaurado, doce identidades alternadas sobre pool 2; HTTP attendance0/1/500/501 y rollback | PASS local |
| Auth/social | Chromium nativo sobre DB independiente, cookies/CSRF/refresh/logout/recovery; suites HTTP/social locales con proveedor OIDC simulado | PASS local; proveedores reales PENDIENTES |
| Pool/worker/carga | Ocho celdas ×24requests, asserts p95≤500ms, worker simultáneo, dos réplicas/ledger y presupuesto de conexiones | PASS local; carga acordada PENDIENTE |
| Recuperación e integraciones | Corte antes/después de writes, snapshot44 tablas/59 FK/S3, durable-before-ack 503, replay, restauración lógica/PITR; billing/push/storage/QR HTTP | PASS local; proveedores simulados/locales |
| QA120 actual / teclado /375px | Suite Nest completa, todos los transportes de dominio, invitaciones y Storage activados, sin filtros; full responsive/axe 320/375/768/1024/1440, fallos de red y recarga | PASS local |
| Gates base PR | lint/generación/typecheck/build, core 150, web 932, API/SDK/worker; 81 opt-in web separadas del gate unitario | PASS checks/backend; 81/81 opt-in ejecutadas |

[Seguro] La matriz QA reutiliza los recorridos de [#120](../../qa/issue-120/README.md) y [#100](../../qa/issue-100/README.md): acceso/menores/MANAGED/series/asistencia/reportes/perfil/anuncios/QR/billing, cinco roles, teclado, errores y breakpoints. Conserva las 39 páginas del inventario; una suite no certifica cada combinación ruta/rol/estado. Auth nativo sobre DB independiente se comprueba en su smoke separado; la matriz responsive usa Nest para dominio sobre Supabase local y Auth de transición. Esa diferencia de entorno queda explícita.

## Evidencia segura

[Seguro] `.ci-results` contiene estados, conteos, versiones, tiempos y commit. Los reportes crudos Playwright/Vitest, snapshots, PII, SQL, UUIDs de fixtures, cookies/JWT y claves no se adjuntan. La evidencia seleccionada y su manifest SHA-256 se guardan en `evidence/`; el manifest identifica fuentes verificadas y permite distinguir pruebas del checkout con cambios de la base indicada. El workflow Extended QA acepta dispatch de la rama seleccionada y conserva el schedule sobre develop. `ci:qualification` agrega los cuatro runners del mismo commit, exige las ocho celdas válidas y deja la aceptación NO-GO; falta/omisión/commit obsoleto/latencia fuera del presupuesto produce FAIL, verificado con pruebas negativas.

[Seguro] La primera corrida QA detectó contaminación del namespace persistente: single tenía tres atletas y fallaban conteos/locators; nueve tests solo-Nest se omitían en la pasada legacy. El runner ahora crea cuentas/UUID/códigos sintéticos propios por corrida, sin modificar fixtures anteriores. El test MIG-08 desactiva solo las membresías que creó para conservar historia sin alterar la nómina siguiente. La selección legacy excluye archivos Nest que luego se ejecutan explícitamente y en la matriz completa; no se presenta esa exclusión como cobertura. Se mantienen conteos, assertions y timeouts. [Intentos iniciales sanitizados](evidence/initial-attempts.json).

## Gates de aceptación y bloqueo de salida

| Gate previo al cierre/corte | Evidencia requerida | Responsable propuesto | Estado |
| --- | --- | --- | --- |
| Volumen/carga representativos y comparación HTTP origen/destino | Tamaño/history por club, tasa/picos, réplicas, pools, recursos/proveedor, duración de prueba y perfil aceptado; p95≤500ms o resolución del bloqueo | Producto + operación | PENDIENTE / NO-GO |
| Resend/Google/Apple/MP/HIBP/push de prueba | Cuentas/configuración sandbox; correo recibido, login/link real, webhook/reintento/reconciliación y entrega push con recibo | Operación + QA | PENDIENTE / NO-GO; mocks no son PASS externo |
| Lector de pantalla y zoom nativo 200% | Escuchar tablas/errores/foco con VoiceOver/NVDA, navegador/SO/versión y resultado por paso | QA + producto | PENDIENTE / NO-GO |
| Axe incomplete / foco exhaustivo | Revisar reglas/targets y colores renderizados; registrar disposición de cada pendiente en la corrida actual | QA | PENDIENTE / NO-GO |
| Asistencia a una mano | Teléfono/persona representativa,20 deportistas, estados mixtos/corrección, tiempo <60 s y errores | Producto + QA | PENDIENTE / NO-GO |
| Operación/MIG-22 | Responsables nominados, RPO/RTO aceptados, cifrado/retención/provisión y mantenimiento representativo | Titular + operación | PENDIENTE / NO-GO, según [#166](../issue-166/README.md) |

[Seguro] No existe aceptación humana o de carga productiva aportada en esta ejecución. El guion de [#100](../../qa/issue-100/README.md#guion-humano-pendiente) sigue siendo ejecutable; registrar cada paso con fecha, plataforma/lector y PASS/FAIL, sin credenciales. Un PASS local o CI no cambia estos estados. No se publican gastos, se hace merge, se cierra el issue ni se ejecuta corte productivo como parte de esta entrega.

## Resultados finales locales

[Seguro] `ci:qualification` terminó technicalStatus=PASS y acceptance=NO-GO. Checks/backend/staging/extended PASS: core 150, web 932 (81 omitidas solo en unitarias y ejecutadas 81/81 en integración), matriz completa Nest 46/46 sin omisiones; 92 ejecuciones QA sumadas entre las pasadas de ambos transportes y módulos. El nuevo runner/agregador pasó cuatro pruebas, incluidos negativos de evidencia. Lint y typecheck se repitieron al final. Backend completo pasó antes del negativo V3 añadido; el ensayo independiente completo posterior volvió a PASS con V3, carga, Chromium, corte, backup/PITR y cleanup. No se declara una nueva corrida completa de backend después de esa adición.

[Seguro] [Evidencia de carga](evidence/independent-postgres.json): 192 solicitudes, cero errores, p95 máximo 86.09 ms. Sondeos worker, pool y readiness PASS. PostgreSQL 17.9, Node 24.16.0, pnpm 10.33.2, Docker 29.3.1; Chromium Playwright 1.63.0/axe 4.13.0 en macOS arm64. Latencias locales sintéticas, sin SLA productivo aceptado.

| Operación | Concurrencia | SQL canónico p95 ms | Nest HTTP p95 ms |
| --- | --- | --- | --- |
| report | 1 | 36.02 | 41.03 |
| report | 4 | 74.76 | 86.09 |
| stats | 1 | 45.68 | 51.25 |
| stats | 4 | 69.87 | 80.03 |

[Seguro] [Axe](evidence/accessibility.json): 58 análisis, cero violaciones automáticas; 44 análisis con aria-valid-attr-value incomplete y tres con color-contrast incomplete. Disposición humana pendiente. [Asistencia375px](evidence/attendance-mig11-375.png) y [reporte375px con null](evidence/reports-mig12-375.png) revisados visualmente: controles/textos/estado y tabla contenida; no equivalen a lector, zoom nativo ni prueba a una mano.

[Seguro] Auto-revisión acotada al diff: solo fixtures/harness/gates y documentación, sin SQL/grants/RPC/types de producto. V3 avanza el reloj Chile de la DB efímera y restaura pg_get_functiondef en finally; conserva inmutabilidad de birthdate y constraints. El cambio ajeno original en next-env.d.ts se preserva fuera del commit. `git diff --check` PASS. CI remoto del SHA publicado se registra por separado; no se hereda el PASS de un PR anterior.
