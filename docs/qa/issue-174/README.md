# UI-04 · Dashboard ADMIN responsive (#174)

[Seguro] Base `develop@19e2b6b` y rama `codex/174-dashboard-admin`. #172/#173/#175 están integrados. GRP-02 consume React19/Router → SDK generado → Nest/Node24 → PostgreSQL17; se conservan 39 rutas y permisos V1–V6/R1. Producción NO-GO. Este cambio entrega la composición ADMIN; la aceptación visual humana de #181/#209 permanece pendiente.

[Seguro] Navegación: graphify actualizado sobre la base verificó ruta, componentes, contratos y RPC. La navegación limitada autorizada por el usuario permitió leer controlador y prueba HTTP en rutas exactas referenciadas; no se añadió otro backend ni se escaneó código como alternativa.

## Composición y decisiones

[Seguro] Cabecera con fecha/weekday calculados en America/Santiago, grupo y roles autorizados, fallback neutral «Inicio» sin inventar nombre de cuenta. «Tomar asistencia» señala la actividad seleccionada por el contrato de #173 (en curso, próxima de hoy o última de hoy); sin encuentro elegible muestra Ver actividades, o Crear actividad para un grupo sin actividades. No se asigna un encuentro por el título ni se mezcla IDs entre grupos.

[Seguro] Cuatro indicadores: ATHLETE ACTIVE, actividades de la semana lunes–domingo de Chile, total mensual ponderado, PENDING. Los períodos son visibles. Mensual/resumen presentan 77,8 % para 6+1+2+1 y explican el denominador 9; EXCUSED no penaliza, Sin marcar permanece operativo separado y null es Sin datos. No hay gráficos P1 ni promedio entre grupos.

[Seguro] Desde xl, indicadores en una fila y paneles 7:4: agenda3/tabla izquierda y resumen/pendientes/anuncio derecha. En móvil, acción/actividad → pendientes → indicadores → resumen → tabla → anuncio. Indicadores reflow 1/2/4, controles mínimo44px, nombres ajustables y scroll horizontal identificado/enfocable dentro de tabla. La tabla muestra hasta4 filas por página, actividad/fecha, total completo y orden por nombre/membership; no afirma recencia. Ver actividad, paginación y CTA mantienen el mismo ID. Notas no se muestran en preview.

[Seguro] ADMIN+ATHLETE/ADMIN+GUARDIAN conserva las secciones propias/pupilos de #175. COACH y miembros conservan su presentación por rol; no se entrega ni oculta por CSS una tabla ADMIN a otro perfil. Primeros pasos, acceso a suscripción/capacidad, administración, unión ATHLETE y revisión de asistencia anterior permanecen secundarios.

## Estados y transporte

[Seguro] La nueva migración `0005_dashboard_secondary_states.sql` reemplaza solo `get_group_dashboard` conservando firma, autorización y métrica. Anuncio y pendientes se leen en subtransacciones; una excepción operacional genera `secondary_errors` y dato null. Los errores PT401/PT403/PT404 e insufficient_privilege se propagan. Vacío, sin permiso y fallo son estados diferentes: fallo no es cero ni anuncio vacío. El DTO estricto rechaza errores pending en no-ADMIN o un valor actual junto a su error; SDK/OpenAPI regenerados. Tipos PostgreSQL se regeneran desde fixture17; la firma y el inventario estructural permanecen iguales.

[Seguro] Un fallo operacional de billing no bloquea la agenda: se conserva capacidad desconocida, recuperación manual y enlace de suscripción. Sesión/permisos/recurso revocado y cancelación no se absorben. Router gobierna navegación/carga/revalidación; no hay otra caché ni transporte. Cada región presenta vacío o datos explícitos; las cargas de navegación usan LoadingState existente y los reintentos secundarios anuncian proceso. Un fallo del snapshot principal conserva el error de página con reintento, sin convertir regiones en cero.

## Verificación reproducible

[Seguro] Fixtures sintéticos de PostgreSQL17/Docker y Nest propios; ninguna persona real, proveedor externo, despliegue ni corte. El E2E nuevo verifica datos/enlaces reales, canon77,8, orden responsive, tabla/selector/paginación y axe; la inyección de payload secundario está delimitada al test. pgTAP inyecta fallos SQL dentro de una transacción rollback y comprueba que agenda/indicadores sobreviven, null/error explícito y autorización fatal. No existe hook de fallo en producto.

```sh
pnpm install --frozen-lockfile
pnpm --filter @asisteam/web exec vitest run src/components/admin-home-panels.test.tsx src/components/group-home-panels.test.tsx src/groups-profile.test.tsx
pnpm --filter @asisteam/core exec vitest run src/http-dashboard-contract.test.ts
DOMAIN_SQL_REPORT_NAME=dashboard-sql node packages/db/scripts/test.mjs packages/db/tests/dashboard.test.sql
pnpm --filter @asisteam/web test:e2e:full group-home.spec.ts
pnpm ci:checks
pnpm ci:backend
node scripts/ci/probe.mjs
pnpm ci:staging
pnpm ci:extended
pnpm ci:qualification
```

[Seguro] El workflow aplicable es `.github/workflows/ci.yml`: checks/backend/staging/extended → qualification → required. Node24.16.0/pnpm10.33.2 y lockfile congelado. `extended.yml` programado/manual no añade matriz al evento PR. Las validaciones se registran en `ci-local.json`; no se publica PR antes de aprobar todos los jobs aplicables. Resultados CI remoto se consultan en GitHub, no se deducen del local.

[Seguro] Gate humano pendiente: lector escuchado, zoom nativo200%, casos axe incomplete y uso a una mano en cancha; reflow automatizado720px no sustituye zoom nativo. Las capturas comparables [375](admin-home-375.png), [1440](admin-home-1440.png) y [1536](admin-home-1536.png) son evidencia de composición sintética y no aceptación de producto. No se cierra el issue, la épica ni producción por CI verde.

[Seguro] La primera pasada axe detectó `definition-list`/`dlitem` por un anidamiento extra de términos/valores; se corrigió la semántica sin omitir checks. La paridad estática detectó un localizador histórico «Aprobaciones pendientes»; se actualizó a «Pendientes del grupo», conservando conteos positivos/negativos por rol. Checks y todas las matrices extended se repiten completas después del ajuste del test; backend y staging corresponden al mismo runtime/SQL.

## Resultados locales finales

| Job/check aplicable | Comando equivalente | Resultado |
| --- | --- | --- |
| checks | instalación frozen; pnpm ci:checks | [Seguro] PASS14; core154/web491, cero omisiones |
| backend | pnpm ci:backend; node scripts/ci/probe.mjs | [Seguro] PASS16 y probe6; SQL dominio40/1646, dashboard77 e integraciones84 |
| staging | pnpm ci:staging | [Seguro] PASS53, rollback explícito/automático y limpieza propia |
| extended | pnpm ci:extended | [Seguro] PASS49+42+1=92 E2E, cero omisiones |
| qualification / required | pnpm ci:qualification; reconciliación de cinco resultados success | [Seguro] PASS técnico |

[Seguro] [Evidencia local y hashes finales](ci-local.json) conserva procedencia, comandos/checks, fallos controlados esperados y casos axe incompletos. Carga general500atletas/5000registros/192peticiones: p95 máximo88.43ms; bundle200098bytes gzip, delta980 y presupuestoPASS. Son gates generales del repositorio, no un benchmark específico del dashboard.

[Seguro] Capturas375/1440/1536 revisadas; un selector adicional de varios encuentros del día amplía la agenda respecto de la imagen, sin fijar alturas ni ocultar controles. Auto-revisión limitada al diff de #174 sin hallazgos pendientes; git diff --check PASS. Los reports señalan el HEAD de base anterior al commit y los hashes identifican el contenido final validado. La documentación/PNG/JSON final conserva ese runtime/SQL; checks se repite tras consolidar el texto. CI remoto queda pendiente al redactar y no se deduce de local. Producción y aceptación humana/externa conservan NO-GO.
