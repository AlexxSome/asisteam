# Épica #144 · Migración a Nest: trazabilidad y aceptación

[Seguro] Reconciliación del **10-10-2026 (America/Santiago)**, base `develop@0477c97e1fc72ab0413792146b966964c017b376` (merge de [PR207](https://github.com/AlexxSome/asisteam/pull/207)). La [épica #144](https://github.com/AlexxSome/asisteam/issues/144) sigue abierta: el reemplazo técnico del repositorio está integrado; la aceptación externa y el corte real siguen **NO-GO**.

[Seguro] GitHub registra #145–#167 CLOSED y #168 OPEN en esta fecha. El cierre administrativo acredita estado del issue, no aceptación de proveedor, producto u operación. Las evidencias de cada hito conservan su fecha y entorno; sus referencias a Supabase describen la transición histórica. El candidato vigente y sus gates se describen en [MIG-24](../issue-168/README.md), con PostgreSQL/Auth/S3 sintéticos propios.

## Entregables de ejecución

[Seguro] La columna de alcance identifica el entregable integrado y sus límites documentados. Esta tabla no declara nuevas corridas de pruebas ni convierte las propuestas de MIG-01 en decisiones aceptadas.

| Issue / evidencia del hito | Entregable | Alcance y límite vigente |
| --- | --- | --- |
| [#145](https://github.com/AlexxSome/asisteam/issues/145) · [MIG-01](../issue-145/README.md) | Inventario, ADR y decisiones | Propuestas/inventario entregados; proveedor, presupuesto y responsables pendientes |
| [#146](https://github.com/AlexxSome/asisteam/issues/146) · [MIG-02](../issue-146/README.md) | Nest/Node24 | Runtime y runbook incorporados |
| [#147](https://github.com/AlexxSome/asisteam/issues/147) · [MIG-03](../issue-147/README.md) | CI y staging | Workflow y staging Docker sintético; provisión externa pendiente |
| [#148](https://github.com/AlexxSome/asisteam/issues/148) · [MIG-04](../issue-148/README.md) | OpenAPI y api-client | Contrato/cliente generados, comprobados en ci:checks |
| [#149](https://github.com/AlexxSome/asisteam/issues/149) · [MIG-05](../issue-149/README.md) | Sesión y contexto RLS | Transición histórica reemplazada por Auth/contexto nativos |
| [#150](https://github.com/AlexxSome/asisteam/issues/150) · [MIG-06](../issue-150/README.md) | Portabilidad | Ensayo sintético; tooling nativo vigente en ci:backend |
| [#151](https://github.com/AlexxSome/asisteam/issues/151) · [MIG-07](../issue-151/README.md) | Grupos y perfil | HTTP Nest, selector y consumidores web |
| [#152](https://github.com/AlexxSome/asisteam/issues/152) · [MIG-08](../issue-152/README.md) | Integrantes, apoderados y consentimiento | HTTP Nest y reglas R1/V1–V6 |
| [#153](https://github.com/AlexxSome/asisteam/issues/153) · [MIG-09](../issue-153/README.md) | Invitaciones y MANAGED | HTTP Nest/Auth y activación transaccional |
| [#154](https://github.com/AlexxSome/asisteam/issues/154) · [MIG-10](../issue-154/README.md) | Actividades y series | HTTP Nest y recurrencia canónica |
| [#155](https://github.com/AlexxSome/asisteam/issues/155) · [MIG-11](../issue-155/README.md) | Asistencia | ADMIN/COACH, lote, concurrencia y upsert |
| [#156](https://github.com/AlexxSome/asisteam/issues/156) · [MIG-12](../issue-156/README.md) | Historial y reportes | Métrica SQL/core, visibilidad, períodos Chile |
| [#157](https://github.com/AlexxSome/asisteam/issues/157) · [MIG-13](../issue-157/README.md) | Worker y mayoría de edad | Leases/ledger duraderos, ejecutor único e idempotencia |
| [#158](https://github.com/AlexxSome/asisteam/issues/158) · [MIG-14](../issue-158/README.md) | Billing y Mercado Pago | Nest/webhook y replay; contrato/recibos externos pendientes |
| [#159](https://github.com/AlexxSome/asisteam/issues/159) · [MIG-15](../issue-159/README.md) | Anuncios y push | Worker/Nest, opt-in y recibos sintéticos; entrega externa pendiente |
| [#160](https://github.com/AlexxSome/asisteam/issues/160) · [MIG-16](../issue-160/README.md) | QR | Firma, caducidad e idempotencia HTTP |
| [#161](https://github.com/AlexxSome/asisteam/issues/161) · [MIG-17](../issue-161/README.md) | Storage privado | S3 local y permisos/checksums; residencia/provisión externas pendientes |
| [#162](https://github.com/AlexxSome/asisteam/issues/162) · [MIG-18](../issue-162/README.md) | Auth nativo | Contraseña, recovery, refresh y cookies del servidor |
| [#163](https://github.com/AlexxSome/asisteam/issues/163) · [MIG-19](../issue-163/README.md) | Google/Apple | Vinculación segura con OIDC simulado; proveedores reales pendientes |
| [#164](https://github.com/AlexxSome/asisteam/issues/164) · [MIG-20](../issue-164/README.md) | Importación de identidad | Ensayo histórico, IDs/sesiones preservados; retiro externo pendiente |
| [#165](https://github.com/AlexxSome/asisteam/issues/165) · [MIG-21](../issue-165/README.md) | PostgreSQL17 independiente | Migraciones propias, RLS, catálogo/tipos, backup/PITR |
| [#166](https://github.com/AlexxSome/asisteam/issues/166) · [MIG-22](../issue-166/README.md) | Corte y recuperación | Ensayo snapshot/delta sin pérdida; ventana y RPO/RTO externos pendientes |
| [#167](https://github.com/AlexxSome/asisteam/issues/167) · [MIG-23](../issue-167/README.md) | Seguridad, paridad y carga | Calificación técnica sintética; aceptación humana/proveedores/carga pendientes |
| [#168](https://github.com/AlexxSome/asisteam/issues/168) · [MIG-24](../issue-168/README.md) | Retiro y documentación | Repositorio nativo integrado en PR207; corte real NO-GO, issue OPEN |

## Criterios de cierre de #144

| Criterio original | Evidencia técnica disponible | Estado de aceptación |
| --- | --- | --- |
| Contratos, permisos, dominio, identidad, datos/archivos e integraciones aceptados | Matriz de hitos anterior; [cobertura de retiro](../issue-168/README.md#cobertura-y-retiro), OpenAPI y gates nativos | PENDIENTE: cuentas/contratos reales, responsables y aceptación de MIG-01/MIG-24 |
| V1–V6/R1/COACH/multirol/concurrencia y SQL↔core con roles de destino | ci:backend: 40 suites/1646 aserciones SQL, 50 guards, batería canónica compartida 77.8/null; PostgreSQL17 real en Docker y roles propios | Evidencia sintética disponible; comprobación en el destino externo autorizado PENDIENTE |
| Paridad de páginas/flujos e integraciones externas de prueba | 39 páginas, [mapa web](../issue-168/native-web-coverage.md), 84 integraciones obligatorias; matriz Playwright/axe completa | PENDIENTE: contratos/recibos externos, lector de pantalla, zoom nativo, axe incomplete y asistencia a una mano |
| Backup/restauración, rollback, RPO/RTO y observación medidos y aceptados | [MIG-22](../issue-166/README.md), [runbook](../issue-166/runbook.md), backup/PITR y recuperación hacia adelante en ci:backend | Ensayo disponible; RPO/RTO aprobados, infraestructura/carga y observabilidad externas PENDIENTES |
| Cero dependencias runtime Supabase, incluidos receptores antiguos; historia y ledger íntegros | ci:retirement sobre fuentes/tooling/lock/artefactos, mapas SQL/integración e inventario histórico de MIG-24 | Retiro técnico del repositorio entregado; inventario/traspaso/apagado de receptores remotos PENDIENTE, sin ejecutar |
| Docs/AGENTS vigentes y roadmap actualizado | [README](../../../README.md), [AGENTS](../../../AGENTS.md), docs01–14/sistema visual y [roadmap](../../09-roadmap.md#11-migración-nest--épica-144) | Estado técnico reconciliado; calendario móvil/beta/corte sin fecha comprometida |

[Seguro] Los cuatro gates required de PR207 y su agregador aprobaron sobre `29671e6c8bfd28abc93ee436009e5924a65921d4` en [CI38021296066](https://github.com/AlexxSome/asisteam/actions/runs/38021296066). Esa evidencia histórica no sustituye el CI del PR de esta reconciliación. [Snapshot seguro](github-evidence.json) conserva estados/SHA/checks, sin comentarios privados, credenciales ni datos de producto.

## Verificación reproducible del candidato

```sh
pnpm ci:checks
pnpm ci:backend
pnpm ci:staging
pnpm ci:extended
pnpm ci:qualification
```

[Seguro] Ejecutar en secuencia con Node24.16.0, pnpm10.33.2, Docker y Chromium. Los runners preparan y eliminan únicamente sus fixtures sintéticos. Los resultados de esta ejecución se registran en [evidencia](verification.md), con base/diff, PASS/FAIL/omisiones y distinción entre pruebas locales y CI remoto. Las integraciones web omitidas en unidades deben ejecutarse sin omisiones en backend. `ci:qualification` puede aprobar técnicamente y conservar `acceptance=NO-GO`.

[Seguro] La consulta administrativa de `repos/AlexxSome/asisteam/branches/develop/protection` respondió **404 Branch not protected** el 10-10-2026. El workflow agrega los cuatro jobs en `required`, pero la protección de develop no los exige actualmente. Configurar esa protección requiere una decisión administrativa del titular; este PR no cambia permisos ni reglas del repositorio.

## Handoff pendiente para completar la épica

[Seguro] La [matriz operacional MIG-24](../issue-168/operational-acceptance.md) es el registro canónico de responsables, inputs, aceptación y secuencia de corte. No se duplica una autorización GO en esta épica. Cada gate exige evidencia, fecha y responsable nominado; una ausencia conserva NO-GO.

1. Confirmar destino PostgreSQL17/S3, residencia, presupuesto, capacidad/pools y equipo; verificar configuración privada del entorno autorizado.
2. Completar contratos reales de prueba y recibos de Resend, Google/Apple, Mercado Pago, HIBP y push, incluidas URLs/reintentos de suscripciones existentes.
3. Aceptar carga representativa y validaciones humanas/legales de producto indicadas en MIG-23/MIG-24.
4. Acordar RPO/RTO, backups cifrados/retención/restauración, alertas/on-call y ventana; inventariar todos los writers y receptores remotos.
5. Obtener decisión GO humana para el procedimiento externo exacto; ejecutar corte/observación y reconciliar escrituras, objetos, identidad, eventos y ledger con una única autoridad.
6. Registrar esa aceptación en MIG-24 y revaluar los seis criterios anteriores antes de cerrar #168/#144.

[Seguro] Este trabajo entrega trazabilidad revisable de la épica. No ejecuta corte/deploy ni apagado remoto, no acepta gastos/SLA, no modifica dominio/UI/migraciones y no cierra la épica. Móvil Java/Swift, FCM/APNs, offline, CSV y nuevas capacidades continúan en su planificación independiente.
