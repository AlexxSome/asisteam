# MIG-24 (#168): retiro completo del repositorio

[Seguro] El candidato usa exclusivamente Next → Nest/Auth nativo → PostgreSQL17/RLS y Worker/S3 privados. Se retiran SDK/CLI/dependencias, configuración, Edge Functions, fixtures y tooling del proveedor, incluidos sus imports de desarrollo y CI. Las reglas de dominio y cobertura vigente se trasladan; no se declara el corte real completado.

## Base y entrega

Rama `codex/168-retiro-completo-supabase`, base sincronizada `develop@13a0a643431f480e1ddf4c83022c8083c31beb68`. Esa base incorpora PR [#206](https://github.com/AlexxSome/asisteam/pull/206): su CI rojo inicial `6ffbf2d` se reparó en `402036c10af8dc1a506e4e183a389b618946ba3c`, con [CI verde](https://github.com/AlexxSome/asisteam/actions/runs/38013511084), antes del merge. La evidencia de ese hito es histórica; los informes del nuevo PR corresponden al retiro final y se verifican en su propio SHA.

## Cobertura y retiro

| Requisito | Implementación y evidencia |
|---|---|
| Retirar runtime/dev/CLI/fixtures | Manifests y lockfile sin proveedor; `supabase/`, fixture de origen API y tipos/tooling de origen retirados. [Inventario histórico con hashes](source-retirement-manifest.json) |
| Mantener SQL/RLS/domain | 40 suites/1646 aserciones en `packages/db/tests/domain`; [equivalencia SQL](sql-native-coverage.json). Fixture propio PostgreSQL, sin schemas/servicios del proveedor |
| Mantener métrica/guards | 50 guards independientes, incluidas las 27 métricas originales trasladadas; casos canónicos compartidos con core |
| Mantener integraciones | 16 archivos, 80 casos y **628 aserciones originales**, invocan Nest/Auth y SQL/RLS real; [mapa reconciliado](pending-integration-coverage.json). Cuatro casos adicionales conservan recuperación ACTIVE/INVITED, expiración, reset/login/replay/logout |
| Mantener unidades y UI | 39 suites web portadas en el hito anterior ([mapa](native-web-coverage.md)); handlers vigentes prueban controladores Nest y motor Worker/core, sin importar código retirado |
| Evitar retorno a producto | `ci:retirement`: manifests/lock, fuentes y tooling, 39 trazas Next, rutas y bundles server/browser/API/Worker; siete gates. Probe verifica detección del SDK prohibido |
| Catálogo y recuperación | Migración incremental 0002 retira entrypoints/autoridades anteriores; generador propio, catálogo actual, freeze/delta/forward recovery, backup/PITR. Baseline0001 inmutable conserva historial de migración; un guard inspecciona todas las rutinas instaladas tras 0002 y exige ausencia de branches/entrypoints del proveedor |

[Seguro] Auth/register/claim/emisión de invitaciones y writes de dominio pasan por endpoints reales Nest, con JWT/cookies, actor transaccional y roles mínimos. SQL directo se usa solo para fixtures/aserciones internas bajo contexto nativo. Las respuestas externas Resend/Mercado Pago/Expo son sintéticas; no acreditan sus contratos remotos. Las fixtures se eliminan como una base completa de propiedad del ensayo, sin borrar historia del producto.

## Verificación y límites

[Resultados del retiro final](rework-evidence.md) registra comandos, PASS/FAIL/omisiones y el alcance. CI exige los gates existentes y la cobertura íntegra; las 84 integraciones omitidas en unidades se ejecutan obligatoriamente sin omisiones en backend. Los reportes `.ci-results` generados por runners identifican SHA/fecha/entorno; una ejecución local con diff conserva su base y se identifica como working tree, no como commit publicado.

[Seguro] La navegación alternativa acotada fue autorizada mediante «has lo que falta»; la restricción anterior ya no bloquea el inventario final. Los archivos locales ignorados del proveedor se conservaron fuera del repositorio sin revelar sus valores; no entran al commit. El cambio ajeno `apps/web/next-env.d.ts` se preserva byte a byte y se excluye del commit.

[Seguro] Producción continúa **NO-GO**. La [matriz de aceptación y runbook](operational-acceptance.md) identifica responsables/ventana, destino, carga acordada, contratos reales, observabilidad, legal/QA humano y RPO/RTO que faltan. #166/#167 cerrados administrativamente no acreditan esa aceptación. No se ejecuta corte/deploy, apagado remoto, merge ni cierre de #168.

[Seguro] `billing_legacy_groups` conserva grupos con cupos anteriores por la decisión de negocio de #56 (doc12); no representa un transporte ni una autoridad del proveedor. Las claves de configuración retiradas solo aparecen en guards que rechazan usarlas y en pruebas negativas; no habilitan runtime.
