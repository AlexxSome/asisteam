# MIG-22 · Ensayo de corte y recuperación (#166)

[Seguro] Base `develop@4b9a8afe5524359afaa27ec0dcaf3a72181afbeb`, rama `codex/166-ensayo-corte-recuperacion`, fecha 2026-10-08. Dependencias #158/#161/#164/#165 integradas. Este entregable ejecuta fixtures sintéticos locales y mantiene pendientes la provisión, volumen, responsables nominados, SLA y validación de proveedores externos de #145/#147. No ejecuta un corte productivo.

[Seguro] La estrategia implementada es **snapshot completo durante mantenimiento**, después de migrar identidad/archivos/ejecutores en el origen. La primera admisión de login, refresh, API, uploads, jobs o billing en destino cuenta como primera escritura. Después de ella, el origen queda congelado y la recuperación conserva el destino actual; si requiere otra DB, copia su snapshot final íntegro a una instalación nueva en cuarentena. Un snapshot anterior sirve para comparación, no sustituye credenciales, consentimientos, ledger ni archivos posteriores.

[Seguro] [Runbook ejecutable](runbook.md) delimita admisión/drenaje por superficie, responsables por rol, gates de abortar, traspaso de scheduler, eventos de contratos existentes, snapshot/copia/final delta y recuperación. [Tooling privado](../../../packages/db/scripts/cutover.mjs) verifica bloqueo CONNECT y sesiones, inventario de 44 tablas, catálogo, modos NATIVE/NEST/WORKER, hashes completos y destino sin historia. Importa atómicamente con operador separado y revalida FK/R1/asistencia; roles de runtime no adquieren grants. Una discrepancia revierte la importación.

[Seguro] [Ensayo](../../../apps/api/test/cutover-rehearsal.mjs), integrado al [gate PostgreSQL independiente](../../../apps/api/test/independent-postgres.integration.mjs) de `ci:backend`, prueba congelación con sesión activa, abortar antes de escrituras, cambios posteriores por HTTP Nest, dos workers concurrentes, lease trasladado, fallo de persistencia MP con 503, caída de API, snapshot final, copia S3 y recuperación con replay. El proveedor MP/HIBP se simula; PostgreSQL y S3 son servicios locales reales. El reloj de negocio de jobs se fija al mediodía Chile únicamente en las DB del fixture; la duración de recuperación usa reloj monotónico real. Chromium contra destino independiente y suites canónicas se conservan en el gate existente.

## Reproducción

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter @asisteam/api --filter @asisteam/worker
docker build -f scripts/migration/storage/Dockerfile.fixture -t asisteam-storage-fixture:161 .
node apps/api/test/independent-postgres.integration.mjs
pnpm ci:checks
pnpm ci:backend
pnpm ci:staging
```

[Seguro] Docker/Node24/pnpm10.33.2/Chromium requeridos; el ensayo no recibe una DB externa. Crea PostgreSQL y dos S3 propios, solo puertos loopback, credenciales aleatorias temporales; elimina únicamente sus recursos. No correr al mismo tiempo que otro smoke Next/build/typegen. `.ci-results/cutover.json` y `independent-postgres.json` contienen únicamente conteos, nombres de check/tabla, tiempos y estados; snapshots, UUIDs, hashes de filas/contraseñas, claves, tokens, bytes y logs permanecen privados.

## Verificación local final

[Seguro] Corrida del 2026-10-08 (America/Santiago), contra la base indicada y los cambios de este issue. Los JSON conservan el SHA del checkout de cada corrida; `evidence/verification.json` identifica los archivos verificados por SHA-256. Fallos con `expected: true` son inyecciones deliberadas cuyos gates de recuperación terminaron PASS.

| Verificación | Resultado y evidencia |
| --- | --- |
| `pnpm ci:checks` | [Seguro] PASS: lint, generación, typecheck, build, contratos y suites unitarias; [reporte](evidence/checks.json) |
| `pnpm ci:backend` | [Seguro] PASS: pgTAP completo, tipos, HTTP/browser nativos, 81/81 integraciones de producto sin omisiones; [reporte](evidence/backend.json) |
| `pnpm ci:staging` | [Seguro] PASS en contenedores locales, incluida recuperación automática ante fallo inyectado; [reporte](evidence/staging.json) |
| PostgreSQL independiente | [Seguro] PASS: 50 casos pgTAP destino, 9 casos canónicos, Chromium, backup y PITR; [reporte](evidence/independent-postgres.json) |
| Corte MIG-22 | [Seguro] Cinco fases PASS; 44 tablas, 59 FK, dos objetos, cero escrituras confirmadas perdidas y recuperación sintética de 0.745 s; [reporte](evidence/cutover.json) |
| Primer CI remoto | [Seguro] Checks/staging PASS; backend falló antes de las fases MIG-22. [Probable] Build MinIO en frío excedió 120 s. Se movió al gate de compilación dedicado y se revalidó backend local; [evidencia](evidence/remote-first-attempt.json). Resultado remoto de corrección pendiente de publicar. |
| Auto-revisión | [Seguro] Se revisó exclusivamente el diff del issue; CI prepara MinIO en su gate dedicado antes del ensayo, evitando compilar Go dentro del límite de 120 s del helper DB; las correcciones de drenaje, atomicidad, manejo de sesiones y reloj del fixture quedaron verificadas en la corrida final. No se modifica esquema, tipos ni UI. |

## Evidencia y aceptación externa

[Seguro] Resultados finales y evidencia sanitizada se registran en `evidence/`. Las mediciones pertenecen exclusivamente al tamaño del fixture. El presupuesto de recuperación de 60 s es una aserción del ensayo; no se presenta como RTO aceptado de producción. RPO local se expresa como escrituras confirmadas perdidas=0, no como garantía de WAL/PITR del proveedor.

| Gate externo previo a producción | Responsable propuesto | Estado |
| --- | --- | --- |
| Volumen DB/objetos, ventana, tasas de eventos y capacidad de importación medidos | Operación + desarrollador | PENDIENTE |
| Nombres de mando del corte, operador DB, web/API/Auth/worker, QA y billing | Titular del proyecto | PENDIENTE |
| RPO/RTO y mantenimiento acordados; ensayo con volumen representativo | Producto + operación | PENDIENTE, sin heredar ≤15min/≤4h propuestos en #145 |
| Contratos MP por URL antigua/nueva, reintentos reales, reconciliación paginada/recibos sandbox | Billing + operación | PENDIENTE; no se atribuye a mocks |
| Resend/OAuth/HIBP y controles efectivos de congelación del proveedor | Operación + QA | PENDIENTE |
| Privacidad, backups cifrados/restaurables/PITR y retención externa | Operación | PENDIENTE |
| CI remoto del SHA publicado y QA/carga #167 | Desarrollador + QA | PENDIENTE a publicación |

[Seguro] Estos pendientes replanifican explícitamente el corte productivo de #168: no hay fecha ni autorización de gasto nueva. Si el volumen/SLA no admite la copia completa dentro del mantenimiento acordado, detener el plan snapshot y abrir una decisión de CDC específica que incluya identidad, objetos y efectos externos; este cambio no implementa CDC genérico ni declara esa estrategia ensayada.

## Corrección del CI del PR #204

[Seguro] El SHA `bde3341` aprobó MIG-22 en GitHub dos veces, pero el backend completo falló en un smoke nativo y una corrida de reportes. El usuario solicitó corregir el CI, incluyendo sus harness existentes. Se preservan todos los gates, datos de negocio, assertions y timeouts; no se cambia SQL ni comportamiento de producto.

[Seguro] El smoke sincroniza cada formulario con el commit de su handler React 19 antes de llenar/enviar y deja ejecutar los efectos de react-hook-form durante dos frames. El marcador DOM se usa solo en este harness del stack fijado; si cambia, la espera falla en lugar de saltar validación. El estrés `AUTH_SMOKE_SLOW_BROWSER=1 node apps/web/scripts/native-auth-smoke.mjs` retarda chunks 500 ms y aplica CPU ×6: observó los cinco formularios inicialmente sin handler y pasó el flujo completo. [Evidencia](evidence/native-auth-stress.json). [Probable] Esa ventana explica los clicks perdidos antes de llegar a Nest; no se atribuye el antiguo `lastActionStatus` a la fase siguiente, porque antes quedaba obsoleto. El diagnóstico ahora limpia estado por fase y publica solo counts/booleans/códigos, nunca texto/URLs/credenciales de página.

[Seguro] Reportes carga 500 atletas en una DB sintética nueva y ahora ejecuta `ANALYZE` antes de iniciar mediciones; antes dependía de estadísticas/autovacuum asíncronos. Comparación secuencial: llamadas `getGroupStats` de 1416.12/1392.31 ms sin estadísticas pasan a 55.69/54.79 ms con ellas. PG conserva límite de 3000 ms y cliente de 10000 ms; mismas comparaciones SQL/HTTP, V1–V6, métricas y paginación. [Evidencia](evidence/reports-planner-comparison.json). [Probable] Los planes sin estadísticas acercaban el runner lento al límite; el ensayo no redefine un SLA productivo.

[Seguro] ESLint, estrés de navegador, comparación secuencial de reportes y backend completo posterior a ambas correcciones PASS, incluidas 81/81 integraciones sin omisiones; [corrida final local](evidence/backend-ci-fix.json). Los resultados anteriores permanecen fechados; la aprobación del SHA publicado se comprueba por separado en GitHub.
