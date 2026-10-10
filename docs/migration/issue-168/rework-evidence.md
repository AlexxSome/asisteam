# Retiro final — evidencia 10-10-2026

[Seguro] Rama `codex/168-retiro-completo-supabase`, base `develop@13a0a643431f480e1ddf4c83022c8083c31beb68`. Los ensayos locales corresponden al diff de esta rama, con PostgreSQL/Auth/Nest/Worker/S3 sintéticos propios. El CI remoto se vincula al SHA final del PR; no se extrapola desde PR206.

| Comando / gate | Resultado verificado | Alcance |
|---|---|---|
| `pnpm install --frozen-lockfile` | PASS | Manifests/lock sin SDK/CLI Supabase |
| `pnpm ci:backend` | PASS | 18 casos API/Worker; 84 integraciones (80 originales/628 aserciones +4 recovery), cero omitidas; 40 suites SQL/1646 aserciones, 50 guards nativas; tipos/catálogo, carga sintética, logout/social, backup/PITR y forward recovery |
| `pnpm ci:checks` | PASS | Lint/contratos/tipos/build, core150 y web950 PASS; web84 omitidas en unidades se ejecutan en backend; Worker/API/cliente y siete gates del artefacto |
| `pnpm ci:staging` | PASS | Publicación/rollback/roles y PostgreSQL reales en Docker sintético; fallo de artefacto inexistente esperado y cleanup |
| `node scripts/ci/probe.mjs` | PASS (tres fallos esperados detectados) | Exige detectar fallo SQL, TS2322 y SDK prohibido; informes separados de los gates positivos |
| `pnpm ci:extended` | 46 + 1 PASS / 0 omitidas | Matriz completa con IP sintética por contexto y caché .qa aislada; capacidades, roles, viewports, axe/teclado y fallos transporte |
| `pnpm ci:qualification` | PASS técnico / NO-GO operacional | Exige suites y métricas del mismo SHA; carga sintética no acredita volumen externo acordado |
| CI remoto final | Resultado autoritativo en [checks del head de PR207](https://github.com/AlexxSome/asisteam/pull/207/checks) | Checks/backend/staging y QA extendida son gates obligatorios de required; la evidencia local no los sustituye |
| Corte real | NO-GO | [Inputs externos exactos](operational-acceptance.md); no autorizado ni ejecutado |

[Seguro] [Informes locales saneados](full-retirement-results.json) registran el diff verificado, la base y cada gate. El SHA final y su CI se verifican en el nuevo PR.

## Fallos encontrados y reparados

- El primer retirement encontró archivos locales ignorados del proveedor. Se conservaron en respaldo privado fuera del repositorio, sin leer/publicar secretos. El gate final exige que no exista el directorio fuente.
- Un build productivo concurrente compartía `.next` con QA. Cachés/metadatos/reportes QA pasan a `.qa`, con archivos privados; lint excluye solo artefactos generados.
- El barrido QA completo agotó el límite real de Auth porque todos los casos gastaban la cuota de una IP. Cada contexto representa ahora un cliente sintético distinto; el límite de producto permanece activo. El barrido fallido no se registra como PASS.
- La equivalencia HU-GEN-03 detectó que recovery rechazaba INVITED con credenciales existentes. La recuperación nativa permite ACTIVE/INVITED con credenciales, mantiene MANAGED bloqueado y no activa memberships/consentimientos por recuperar; se verifican expiración/replay/login/logout.
- `pg_terminate_backend` responde antes de finalizar algunas sesiones. El ensayo espera de forma acotada que salgan todos los writers; el guard de snapshot sigue exigiendo cero conexiones.
- El probe SQL necesita instalar pgTAP en su transacción propia antes de `ok(false)`; se corrigió para detectar una aserción fallida real y conservar su reporte negativo separado.

[Seguro] [Mapa SQL](sql-native-coverage.json), [mapa 80/628](pending-integration-coverage.json) y [manifiesto de retiro](source-retirement-manifest.json) preservan el vínculo origen→equivalente nativo. El baseline SQL0001 se conserva inmutable como historial; 0002 instala el catálogo vigente sin entrypoints del proveedor. Las referencias en evidencias anteriores son historia fechada, no código/tooling/configuración activa.

[Seguro] PR206 quedó reparado/verde en `402036c10af8dc1a506e4e183a389b618946ba3c` y se integró en `13a0a64`; [CI histórico](https://github.com/AlexxSome/asisteam/actions/runs/38013511084). Su `rework-results.json` anterior conserva esa evidencia local histórica y no representa este retiro final. No hubo merge automático ni cierre de #168.

[Seguro] Carga sintética final: 500 ATHLETE, 5000 registros nuevos, 192 solicitudes en ocho celdas, p95 máximo local 160.33 ms (umbral 500 ms). Es una medición del ensayo, no una garantía para el destino externo.

[Seguro] Auto-revisión del diff: se corrigieron scripts individuales de invitaciones para crear su propia fixture, selección de integraciones cuando se pasan solo flags, limpieza idempotente, aislamiento QA/IP y separación de informes negativos. `test:invitations` pasó sus 16 casos con cero omisiones. La comprobación del esquema instalado tras0002 impide rutinas con autoridad LEGACY, helpers o roles del proveedor.

[Seguro] QA extendida se integra al workflow de PR y al agregador required. GitHub no permite dispatch del antiguo workflow extended.yml porque aún no existe en la rama predeterminada; el nuevo gate verifica un checkout limpio de este PR sin merge ni cambios a la rama base.
