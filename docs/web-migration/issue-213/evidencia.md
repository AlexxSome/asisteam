# Evidencia WEB-01 (#213)

[Seguro] Corrida local del 10-10-2026 (UTC:11-10,00:19–00:27), macOS arm64, Node24.16.0/pnpm10.33.2; fixtures PostgreSQL17/S3/Nest/Worker propios y Chromium Playwright. Código ejecutado: `db1396d490c481209a81a67fde0104c4fbfe248c`; la documentación de este PR estaba pendiente de commit durante los gates. No hubo cambios de runtime. [verification.json](verification.json) retiene reportes sanitizados con fechas/SHA/tests/omisiones; el SHA final del PR tendrá su propio CI remoto. Esta evidencia no se atribuye por adelantado a ese SHA ni a la SPA objetivo.

| Verificación ejecutada | Resultado observado |
|---|---|
| Baseline por Git SHA | PASS:210 hashes exactos;39 páginas/39 códigos y rutas doc05;21 archivos/47 funciones Server Actions;3 handlers |
| Contrato compilado canónico | PASS:88/88 operaciones, métodos y paths iguales a baseline; sin operaciones duplicadas |
| Links locales nuevos / diff | PASS: archivos referenciados existen; git diff --check; solo documentación en diff final |
| Versiones de ADR | PASS metadatos de engines/peers npm y resoluciones React/TS actuales; instalación/build del frontend Vite **pendiente WEB-03** |
| `pnpm ci:checks` | PASS:13 checks; lint, tipos/contratos/build/artefacto,150 core +961 web.84 integraciones opt-in OMITIDAS en web-unit; no se cuentan como PASS aquí |
| `pnpm ci:backend` | PASS:14 checks;40 suites/1646 aserciones SQL +50 guards nativas,84 integraciones web sin omisiones, APIs/Worker/Auth/OAuth, tipos/catálogo/backup/PITR. Portability failure deliberado detectado y cleanup verificado |
| `pnpm ci:staging` | PASS:22 registros de comprobación; dos artefactos Docker propios, roles, publicación y rollback, privacidad de logs, PostgreSQL real local y cleanup. Un fallo de deploy deliberado esperado recuperado |
| `pnpm ci:extended` | PASS:47 recorridos Playwright/axe de la matriz nativa +1 prueba de fallos de transporte;0 omitidos |
| `node scripts/ci/probe.mjs` | PASS: detecta tres FAIL esperados de pgTAP, tipos y retiro de runtime, retira sondas propias. No son fallos de esta entrega |
| `pnpm ci:qualification` | PASS técnico: cuatro suites y carga;500 atletas/5000 registros,8 celdas/192 requests, p95 máximo213.58ms. Aceptación sigue **NO-GO** |
| CI remoto del SHA final | Pendiente al versionar esta evidencia; consultar checks del PR. No se declara PASS remoto desde resultados locales |
| Paridad React/Vite, proveedores externos, QA humana y operación | OMITIDO en WEB-01; corresponde a hitos WEB-02…10 y #100/#170/#209. Sin corte/deploy productivo |

[Seguro] Se revisó exclusivamente el diff de este issue: inventario/ADR/matriz/evidencia y enlaces/decisión en docs05/06/07/09. Se corrigió la extracción inicial para contemplar objetos de contratos anidados (88 operaciones comprobadas); no hubo cambio de producto para obtener PASS. Se corrigió en doc07 la vigencia de accessJWT a15min, sustentada por TokenVerifier/AuthTokens actuales. No se eliminó ningún caso vigente ni se omitieron hooks.

[Seguro] `next-env.d.ts` se regeneró al iniciar Next QA y se restauró a su contenido de la base tras los checks; se excluye del commit. Las sondas de probe y contenedores propios se limpiaron por sus runners. No se persistieron sesiones/PII/logs crudos/snapshots de DB ni se copiaron artefactos completos de browser. No se requiere actualizar tipos DB, SQL o sistema visual: esta entrega no modifica esos contratos ni UI.

[Seguro] Límites materiales: las pruebas anteriores ejercitan el stack Next/Nest vigente con datos sintéticos, no la migración React todavía no implementada. Axe automático no demuestra lector/zoom nativo/pasada a una mano; proveedores simulados no demuestran recepción real ni capacidad del entorno de desarrollo de #209. La matriz de aceptación futura conserva esos gates y production NO-GO.
