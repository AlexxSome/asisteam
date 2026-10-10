# Reparaciones posteriores al CI rojo — evidencia local pendiente de entrega

[Seguro] Rama `codex/168-retiro-tecnico-supabase`, base `develop@847a666b081353382cf60550030660db4821b43c`, head publicado `6ffbf2d5e3b40b550b33d9c69047e9945d71869d`. Estos resultados incluyen el diff local verificado antes de crear el commit de reparación; no son evidencia de CI remoto verde.

| Verificación | Resultado actual | Alcance y límite |
|---|---|---|
| Lint | PASS | Repetido tras retirar Chromium su fixture temporal; el intento concurrente tuvo ENOENT |
| Typecheck web | PASS | Se preservó exactamente el cambio ajeno de next-env.d.ts |
| git diff --check | PASS | Cambios seguidos por Git; no sustituye revisión ni CI |
| Reemplazo de 39 suites web archivadas | 472 PASS / 0 omitidas | 466 casos originales, equivalencia en native-web-coverage.md/json |
| Web normal | 950 PASS / 0 FAIL / 80 omitidas | Las 80 integraciones condicionadas no cuentan como aprobadas ni retiradas |
| API unit | 21 PASS / 0 omitidas | Fixture JWT/config nativos; comprobación previa al consolidado |
| Integraciones API/worker | 18 PASS / 0 FAIL / 0 omitidas en 15 archivos | PostgreSQL sintético aislado, ejecución final 44,258 s; incluye billing corregido |
| PostgreSQL independiente | PASS | 50 pgTAP, métrica SQL/core, tipos/hashes, roles mínimos, RLS y dominio, carga, Chromium, freeze/abort/delta/forward recovery, backup lógico y PITR |
| Logout Chromium | PASS | Access/refresh de familia saliente revocados, otro dispositivo conservado, logout anónimo idempotente |
| CI remoto | Pendiente del head de reparación | El head inicial 6ffbf2d falló; comprobar el nuevo head en PR206 |
| CI backend incremental | PASS | 17 gates aprobados y 1 fallo inyectado esperado; pgTAP íntegro, 80 integraciones PASS/0 omitidas y guards SQL/módulos |
| CI checks / bundle productivo | PASS | 13 checks y 6 gates de retiro aprobados; API unit ya no requiere generated legacy |
| CI staging sintético | PASS | 21 gates y 1 fallo inyectado esperado con rollback/cleanup verificados; sin deploy real |
| Retiro completo / lockfile final | PENDIENTE | Tooling/deps/SQL/80 suites de origen siguen en CI para preservar cobertura; no es retiro terminado |
| Corte real | NO-GO | No autorizado ni ejecutado; gates externos #166/#167 pendientes |

[Seguro] El primer consolidado backend tuvo 17 PASS y fallo por import de relay eliminado; se corrigió el consumidor y el consolidado final quedó 18/18. El primer ensayo independiente detectó ausencia de Content-Type JSON en el envío directo del webhook; se corrigió y el ensayo final aprobó todos sus gates. Billing conserva pruebas de firmas/replay, creación concurrente/resultado incierto, ledger/paginación, permisos y reintento de factura tras fallo de persistencia: el fallo se inyecta mediante triggers exclusivamente en la base desechable, sin modo LEGACY.

[Seguro] El [resultado saneado](rework-results.json) registra counts/gates sin credenciales. El [inventario de cobertura pendiente](pending-integration-coverage.json) registra los 80 casos exactos y sus assertions/RPC para una reconciliación verificable. No se eliminan esas suites para lograr verde.

[Seguro] Bloqueo de navegación: graphify no enumera todo SQL/fixtures/tooling ni sus consumidores. La skill exige «Si graphify no está disponible o no identifica archivos necesarios, explica la limitación y pide autorización para una alternativa de navegación antes de usarla». La excepción acotada solicitada sigue pendiente. No se usaron git ls-files/rg como alternativa. La propuesta de reemplazo completo `/tmp/issue168-native-backend.patch` queda sin aplicar para no reducir cobertura. La reparación incremental de `scripts/ci/backend.mjs` mantiene los gates de origen y usa fixture nativo desechable para las 15 suites portadas. Exige ≥1646 assertions de origen y 50 nativas (incluidas las 27 métricas originales trasladadas), 80 integraciones sin omisiones y logout de navegador.

[Seguro] El cambio ajeno apps/web/next-env.d.ts coincide byte a byte con la copia original del usuario. Esta matriz se generó antes del commit/push de reparación, que se registra en el PR; no hubo merge, cierre ni destrucción de recursos remotos. Continúa pendiente auto-revisión integral del retiro final; los hallazgos introducidos que detectaron los checks de esta reparación se corrigieron y verificaron.
