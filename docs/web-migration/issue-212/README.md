# Épica #212 · Aceptación técnica de la migración web

[Seguro] La planificación de #212 partía de Next16. Las diez entregas WEB-01…10 están integradas en `develop`; el corte revisado es `62052bafd09423968600c6b248b35ccdb8c0c0c4` (PR #232, 12-10-2026). React19/Vite7/React Router7 Data Mode es la web definitiva en `apps/web`. Esta reconciliación reúne requisitos y evidencia del artefacto final. Producción continúa **NO-GO** y #209/#170/#181 conservan sus pendientes.

## Entregas y procedencia

[Seguro] Estado consultado en GitHub el 12-10-2026: #213–#222 están CLOSED y los PR siguientes están MERGED a `develop`. La aceptación usa también sus contratos, pruebas y runbooks enlazados; el estado administrativo por sí solo no acredita paridad.

| Tarea | Resultado y evidencia | PR integrado | Merge SHA |
|---|---|---|---|
| WEB-01 #213 | [Inventario de 39 páginas, responsabilidades y ADR](../issue-213/README.md) | [#223](https://github.com/AlexxSome/asisteam/pull/223) | `3e09d19a72bb1572ff959c53ca4bf1e6439dc965` |
| WEB-02 #214 | [Sesión opaca, CSRF, refresh y callbacks Nest](../issue-214/README.md) | [#224](https://github.com/AlexxSome/asisteam/pull/224) | `75bed49d0eb205b4f930c5dd34a22d9fef6ee72c` |
| WEB-03 #215 | [Base Vite/Data Mode y frontera browser](../issue-215/README.md) | [#225](https://github.com/AlexxSome/asisteam/pull/225) | `7c4c6f4837e2329e12917e2e4a328b341b73fe1c` |
| WEB-04 #216 | [Acceso, invitaciones, consentimiento y legal](../issue-216/README.md) | [#226](https://github.com/AlexxSome/asisteam/pull/226) | `8ed9359241430a446f2c7a53a002e2a4231f7739` |
| WEB-05 #217 | [Grupos, shell, inicio por roles y perfil](../issue-217/README.md) | [#227](https://github.com/AlexxSome/asisteam/pull/227) | `df0246d32add77ea260d1363f1ed1a3c50ab31ce` |
| WEB-06 #218 | [Integrantes, apoderados, menores y gestión de invitaciones](../issue-218/README.md) | [#228](https://github.com/AlexxSome/asisteam/pull/228) | `731d4f0b2baa8abab47777fa44ad992db44a39c6` |
| WEB-07 #219 | [Actividades, asistencia, historiales y reportes](../issue-219/README.md) | [#229](https://github.com/AlexxSome/asisteam/pull/229) | `47d1e26536bf435979b0c88e477adfe263b811dc` |
| WEB-08 #220 | [Billing, anuncios y QR autorizados](../issue-220/README.md) | [#230](https://github.com/AlexxSome/asisteam/pull/230) | `e63e05cb9adfc11e209ebd23031b973e9afeb038` |
| WEB-09 #221 | [Proxy, artefacto estático, paridad y rollback](../issue-221/README.md) | [#231](https://github.com/AlexxSome/asisteam/pull/231) | `d2f5101c7342a733cfe144ecaa79bce22b317d69` |
| WEB-10 #222 | [Retiro de Next y transferencia de cobertura](../issue-222/README.md) | [#232](https://github.com/AlexxSome/asisteam/pull/232) | `62052bafd09423968600c6b248b35ccdb8c0c0c4` |

## Matriz del gate de la épica

| Requisito de #212 | Evidencia final y verificación |
|---|---|
| Tareas técnicas, rutas, roles y estados con documentación reconciliada | Tabla anterior; [39 destinos conservados y logout técnico](../issue-222/rutas.json); [doc05](../../05-pantallas.md) mantiene códigos, permisos y brechas. [Sistema visual](../../12-sistema-visual.md) conserva contratos de estado. QA extended recorre roles ADMIN/COACH/ATHLETE/GUARDIAN/multirol y estados de módulos. |
| Frontend definitivo sin dependencia/runtime Next | `ci:retirement` verifica fuentes, manifests/lockfile y artefactos. `ci:checks` construye `apps/web/dist`; infraestructura verifica hashes/procedencia, proxy/fallback/caché y aislamiento. El probe exige rechazar una importación Next introducida deliberadamente y limpiarla. |
| Sesión, callbacks e imágenes privadas en backend/infra | [WEB-02](../issue-214/README.md) y [WEB-10](../issue-222/README.md): cookie HttpOnly/Secure/SameSite=Lax, credenciales cifradas en Nest/PostgreSQL, CSRF/origen, refresh atómico, Google/Apple y alias binario autorizado `/profile/avatar/:owner/:file`. Integraciones backend y smokes Chromium prueban login/refresh/logout/OAuth y S3 sintéticos. |
| Cuatro gates requeridos y calificación del artefacto final | [verification.json](verification.json) registra resultados locales y procedencia. CI conserva checks/backend/staging/extended → qualification → required; los comandos completos están abajo. Cada reporte identifica el SHA y distingue fallos inyectados esperados de fallos reales. |
| RLS, métrica, menores, responsive y axe conservados | Backend exige 40 suites/1646 aserciones SQL, ≥50 guards nativas/métrica y 84 integraciones de producto (80 originales+4 recuperación). [Cobertura final](../issue-222/coverage.json) relaciona 783 plantillas con sus aserciones vigentes, 0 pendientes. Extended ejecuta 47 regresiones previas, 41 SPA y 1 fallo/recuperación; no confundir plantillas, expansiones ni recuentos con equivalencia funcional. |
| Configuración, desarrollo y rollback ensayados; aceptación externa identificada | [Runbook definitivo](../issue-222/README.md) y [arquitectura](../../06-arquitectura-y-stack.md) fijan toolchain/configuración/mismo origen. Staging ensaya imágenes inmutables, actualización/rollback, sesión/asset anterior y limpieza propia sin rebobinar datos. La tabla de pendientes siguiente conserva responsables y evidencia faltante. |

[Seguro] La equivalencia conserva el producto existente y sus permisos: R1/V1–V6, historia, consentimiento, métrica por grupo, Worker con leases/ledger y capacidades #55–#59. Las diferencias de plataforma aceptadas en el [ADR](../issue-213/ADR.md) quedan explícitas: vistas privadas y formularios requieren JavaScript; navegación conocida entrega shell200 mientras API/loader conserva el error HTTP; legal versionado continúa legible sin JavaScript. Router administra loaders/actions/fetchers/revalidación y Nest mantiene la autoridad de sesión/datos.

## Reproducción del CI aplicable

[Seguro] `.github/workflows/ci.yml` aplica a todo PR a `develop`, sin filtros ni matriz que permitan omitir jobs. Node24.16.0 y pnpm10.33.2; PostgreSQL17 y S3 son fixtures Docker desechables con datos sintéticos. El runner local es macOS/arm64 con Docker Linux; el remoto usa Ubuntu24.04. La validación local registra esa diferencia y no se presenta como ejecución remota.

```sh
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
pnpm --filter @asisteam/web exec playwright install --with-deps chromium
pnpm ci:checks
pnpm ci:backend
node scripts/ci/probe.mjs
pnpm ci:staging
pnpm ci:extended
pnpm ci:qualification
```

| Job/check | Correspondencia local | Evidencia sanitizada |
|---|---|---|
| checks | `pnpm ci:checks` | `.ci-results/checks.json`, `vite-bundle.json`, `retirement.json` |
| backend | `pnpm ci:backend` y `node scripts/ci/probe.mjs` | `backend.json`, `independent-postgres.json`, `domain-sql.json`, `controlled-failure.json`, smokes Auth/social |
| staging | `pnpm ci:staging` | `staging.json` |
| extended | `pnpm ci:extended` | `extended.json` |
| qualification | `pnpm ci:qualification` tras los cuatro gates | `qualification.json`: mismo SHA, cobertura sin omisiones, bundle/carga y NO-GO externo |
| required | Conjunción de éxito de los cinco jobs | Composición en GitHub; el resumen local valida las cinco condiciones, sin afirmar que se ejecutó el job remoto. |

[Seguro] El workflow `extended.yml` sólo aplica por schedule/dispatch; su comando `ci:extended` ya forma parte del PR. Upload/download de artefactos son transporte de evidencia de GitHub. Los reportes locales se conservan en [verification.json](verification.json) con huellas del diff documental; resultados de cortes previos permanecen fechados en sus directorios. El PR registra su SHA final y el resultado remoto cuando exista. No publicar diagnósticos crudos, cookies, tokens, URLs de proveedor ni PII.

## Pendientes y aceptación externa

| Seguimiento | Responsable y evidencia pendiente | Condición conservada |
|---|---|---|
| [#209](https://github.com/AlexxSome/asisteam/issues/209) | Alex: identificar entorno de desarrollo, PostgreSQL/S3/HTTPS/proxy y providers/callbacks, recibos reales Google/Apple/Resend/MP/Expo, scheduler único, carga representativa/umbrales, observabilidad/alertas, RPO/RTO/retención/ventana y revisión legal C-01…C-20. [Matriz operacional MIG-24](../../migration/issue-168/operational-acceptance.md). | Continúa OPEN; adopta React/Vite definitivo como frontend del artefacto seleccionado. Fixtures locales no completan aceptación operacional ni autorizan corte productivo. |
| [#170](https://github.com/AlexxSome/asisteam/issues/170) / [#181](https://github.com/AlexxSome/asisteam/issues/181) | Alex y validación humana: completar UI-03…UI-11, fidelidad del nuevo inicio/roles, lector de pantalla, zoom nativo200%, hallazgos axe incomplete y tarea de cancha20 personas/<60s a una mano. | Continúan OPEN; la migración conserva UI vigente y no declara entregado el rediseño pendiente ni aceptación humana. |
| Producción | Alex y responsables operacionales: aceptación propia, recursos/proveedores/ventana y evidencias correspondientes. | **NO-GO**; no deploy/corte real, apagado de receptores, merge ni cierre automático de issues en esta entrega. |

[Seguro] Rollback frontend requiere conservar un artefacto SPA anterior compatible con `nest-opaque-v1`, API/esquema/keys y assets versionados. La sesión viva se conserva y una sesión revocada no revive. Volver al Next histórico exige artefacto/check-out independiente, configuración validada y reautenticación; no se promete compatibilidad con sus cookies ni una ventana temporal no acordada. Recuperar datos sigue el runbook MIG-24 de snapshot completo/reconciliación y una sola autoridad de escritura.

## Alcance de esta reconciliación

[Seguro] El diff de #212 añade esta aceptación y enlaces en docs05/docs06/sistema visual. La auto-revisión contrasta únicamente esos cambios con `62052bafd09423968600c6b248b35ccdb8c0c0c4`: procedencia, enlaces, criterios, recuentos y límites. El trabajo de implementación ya integrado conserva sus evidencias; la nueva corrida completa acredita el artefacto vigente. El cierre administrativo de #212 corresponde a la revisión posterior del usuario y no se ejecuta por este flujo.
