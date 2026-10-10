# Verificación de la reconciliación #144

[Seguro] Fecha **10-10-2026, America/Santiago**. Rama `codex/144-reconciliar-migracion-nest`, base/runtime probado `0477c97e1fc72ab0413792146b966964c017b376`, con diff documental pendiente. Node24.16.0, pnpm10.33.2, Docker29.3.1, macOS arm64. Los reportes identifican esa base; no se presentan como una ejecución del SHA posterior que contiene esta evidencia.

[Seguro] [Resultados saneados y hashes de documentos](local-evidence.json) conserva estados/tiempos/conteos y el alcance de cada runner. No incluye reportes crudos de navegador, logs, PII, snapshots, sesiones, tokens ni configuración privada. Los únicos FAIL son inyecciones deliberadas con `expected=true`, verificadas por su recuperación/detección.

| Comando / verificación | Resultado | Alcance |
| --- | --- | --- |
| `pnpm ci:checks` | PASS | 13 gates: lint, generación, tipos, build, contratos, retiro y unidades core150/web950; web84 omitidas únicamente aquí |
| `pnpm ci:backend` | PASS | 40 suites SQL/1646 aserciones, 50 guards; API/Worker/Auth/Storage/QR/billing/push, backup/PITR/corte/portabilidad; 84/84 integraciones web sin omisiones |
| `pnpm ci:staging` | PASS | PostgreSQL y roles reales en Docker sintético, dos artefactos, rollback automático y cleanup propio; fallo de artefacto deliberado detectado |
| `node scripts/ci/probe.mjs` | PASS | Tres FAIL esperados detectados: SQL, TS2322 y SDK prohibido; fuentes temporales retiradas |
| `pnpm ci:extended` | PASS | 46 recorridos Nest responsive/axe +1 fallo de transporte; cero omitidos |
| `pnpm ci:qualification` | PASS técnico / NO-GO | Cuatro informes de la misma base; carga sintética 500 ATHLETE/5000 registros, 192 solicitudes/ocho celdas, p95 máximo90.76ms (umbral500ms) |
| Snapshot GitHub y vínculos documentales | PASS | 25 issues (#144–#168), 23 CLOSED/2 OPEN; cinco checks históricos SUCCESS de PR207 y merge/base coincidentes; enlaces locales existentes |
| Auto-revisión y `git diff --check` | PASS | Diff de este issue limitado a documentación/evidencia; sin cambios de runtime, SQL, tipos ni UI |
| CI remoto de este PR | Consultar los checks del PR publicado | Ejecución independiente; el PASS histórico de PR207 y los gates locales no la sustituyen |
| Proveedores/QA humana/carga productiva/corte | PENDIENTE / NO-GO | Inputs exactos y responsables en la matriz operacional MIG-24 |

[Seguro] Navegación estructural mediante graphify: el grafo inicial aún incluía código retirado; `graphify update . --force --no-cluster` lo reconstruyó sobre la base vigente (3274 nodos/13366 aristas). Los documentos nuevos siguen el directorio de evidencia `docs/migration/issue-N` y las referencias canónicas del issue/AGENTS; no se usó búsqueda alternativa de código.

[Seguro] Auto-revisión: comprobados los 24 vínculos de hitos, los seis criterios originales, estados públicos y distinción entre transición histórica y candidato vigente. La consulta de protección de develop devolvió404 «Branch not protected»; no se alteraron reglas administrativas. Se preserva el cambio ajeno original de `apps/web/next-env.d.ts` (ruta de tipos `.next/dev`) fuera del commit, aunque los builds regeneren ese archivo.

[Seguro] No hay autorización GO ni evidencia externa nueva. El retiro técnico del repositorio está entregado por MIG-24, pero #144/#168 permanecen abiertos y el corte, apagado remoto, aceptación legal/operacional y calendario de lanzamiento requieren completar su handoff. Este PR aporta trazabilidad; no declara cerrada la épica.
