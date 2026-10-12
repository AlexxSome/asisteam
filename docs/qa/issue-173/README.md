# UI-03 · Datos autorizados del inicio (#173)

[Seguro] Implementación sobre React19/Router → SDK generado → Nest/Node24 → PostgreSQL17. Base verificada: `a3d7aae537901465d39ecf89d2374e6c10608b1c` de `develop`. La imagen de #170 no constituye una fuente de datos; la composición completa sigue en #174/#175. Producción mantiene NO-GO.

## Contrato y fuentes

[Seguro] `GET /api/v1/groups/:groupId/dashboard` y equivalente de sesión opaca `/web-api/v1/...` consumen `public.get_group_dashboard`. El DTO estricto reside en [core](../../../packages/core/src/http-dashboard-contract.ts), el controlador en [Nest](../../../apps/api/src/dashboard.ts) y el loader/selector en [GRP-02](../../../apps/web/src/routes/group.tsx). La [migración 0004](../../../packages/db/migrations/0004_group_dashboard.sql) y los tipos de catálogo PostgreSQL incorporan el contrato. No se instala otro backend ni caché.

| Campo | Fuente y significado | Permiso |
| --- | --- | --- |
| `now`, `periods` | Reloj de la transacción; `attendance_period_bounds` calcula semana lunes-domingo y mes en America/Santiago, con límites UTC y término exclusivo. | Miembro ACTIVE del grupo, consentimiento de cuenta vigente. |
| `indicators.active_athletes` | Total completo de memberships ATHLETE ACTIVE. ADMIN/COACH solo cuentan si también tienen su fila ATHLETE. PENDING/INACTIVE se excluyen. | ADMIN/COACH; ATHLETE/GUARDIAN solo con toggle propio vigente. `indicators=null` significa falta de permiso, nunca cero. |
| `indicators.week_activities` | Todas las actividades cuyo `starts_at` está dentro de la semana Chile, incluidas futuras; no es un porcentaje realizado ni un conteo de la página. | Igual que indicadores. |
| `indicators.monthly` | Suma de contadores de `attendance_report_counts` para ATHLETE ACTIVE del grupo y mes; `attendance_metrics` calcula `(PRESENT+LATE)/(PRESENT+LATE+ABSENT)`, half-up1decimal. EXCUSED sale del denominador; cero denominador→null. La fuente excluye futuro y preingreso. | Igual que indicadores; no promedio individual ni global. |
| `pending` | Total de memberships ATHLETE PENDING, sin depender de página50. | Solo ADMIN; demás reciben null. |
| `upcoming` | Hasta tres actividades de `v_group_activities` con `ends_at>=now`, en curso primero, luego próximas, desempate starts_at/id. | Lectura canónica de actividades del grupo. |
| `previous` | Última actividad finalizada, orden ends_at descendente/id; respaldo aunque no sea de hoy. | Lectura canónica de actividades. |
| `today`, `selected_activity` | Actividades que intersectan el día Chile, incluyendo las que cruzan medianoche. Página50 con total independiente. Selección por defecto: primera en curso (starts_at/id), próxima del día y última finalizada del día (ends_at descendente/id). | Lectura canónica; un ID seleccionado ajeno o fuera del día devuelve404. La selección permanece disponible fuera de la página del selector. |
| `context` | Una sola actividad seleccionada: nómina ATHLETE ACTIVE con joined_at<=starts_at; registros reales, estados, sin marcar y métricas. Futura→phase preparation, porcentajes null. Sin marcar no crea ABSENT ni convocatoria. | ADMIN/COACH. ATHLETE/GUARDIAN reciben null aunque tengan toggle. |
| `context.records` | Solo registros existentes de esa actividad/nómina, orden full_name/membership_id, cuatro por página; total completo incluso página vacía. Nombre/estado/nota permitida ADMIN; no email/phone/birthdate. | Solo ADMIN; COACH recibe null, sin notas ni filas individuales ajenas. |
| `personal` | Resumen mensual del `get_my_attendance_history` canónico y registro propio de la actividad seleccionada (o null, sin ficción). | Membership ATHLETE ACTIVE, incluso en multirol; V1 independiente de toggles. |
| `wards` | Hasta cuatro pupilos por página, total completo; mensual desde la misma fuente canónica y registro del pupilo seleccionado. Nombre y datos de asistencia exclusivamente de vínculos vigentes y menores con ATHLETE ACTIVE en el grupo. | GUARDIAN ACTIVE más `is_guardian_of`; V2/V3 independientemente de toggles. |
| `guardian_tasks` | Conteo completo de `can_consent` y total de activaciones visibles canónicas. El helper privado comparte la selección con onboarding; su RPC pública conserva página50. | GUARDIAN ACTIVE y vínculos vigentes. No se traen las páginas/PII de onboarding al inicio. |
| `latest_announcement` | Primer anuncio vigente de `list_group_announcements(group,1)`, solo id/title/body/created_at/updated_at. | Membresía ACTIVE; no consulta preferencias, dispositivos ni tokens push. |

[Seguro] La identidad procede de la sesión, nunca de actor/roles en query. Se valida membership ACTIVE antes y dentro de SQL; RLS/helpers canónicos preservan aislamiento V1–V6. Las vistas y RPC repiten la proyección mínima. Todas las respuestas HTTP son no-store; Router posee carga, cancelación y revalidación. Capacidad/billing ADMIN permanece en su endpoint canónico y no forma parte de indicadores nuevos.

## Uso y estados

[Seguro] Query permitida: `activity_id` UUID opcional, `records_page`, `day_page`, `wards_page` enteros1…1000000 (default1). El selector de GRP-02 aparece cuando hay varias actividades del día y usa Form GET con botón textual44px. No guarda datos ni reintenta writes. Vacío→listas vacías/selecciónnull; falta de permiso→secciónnull; métrica no evaluable→null/«Sin datos»; fallo HTTP conserva error/reintento existente y no fabrica ceros.

[Seguro] #174/#175 consumen los indicadores, tres próximas, anuncio, panel y previews para su composición responsive/por rol. Esta entrega conserva destinos39, controles y tareas existentes; no declara el rediseño completo, gráficos, CSV, offline, mensajería o cliente móvil.

## Verificación reproducible

[Seguro] Fixtures sintéticos propios de PostgreSQL17/Docker y Nest, sin datos/personas reales ni proveedores externos. Tests específicos:

```sh
DOMAIN_SQL_REPORT_NAME=dashboard-sql node packages/db/scripts/test.mjs packages/db/tests/dashboard.test.sql packages/db/tests/domain/membership_onboarding.test.sql
node apps/api/test/native-suite.mjs apps/api/test/dashboard.integration.mjs
pnpm --filter @asisteam/core exec vitest run src/http-dashboard-contract.test.ts
pnpm --filter @asisteam/web exec vitest run src/groups-profile.test.tsx
```

[Seguro] Resultado final: dashboard SQL55 PASS, onboarding37 PASS dentro de las40suites originales1646 PASS; contrato3 PASS dentro de core153 y loader10 PASS dentro de web471. La integración HTTP dashboard pasó nuevamente en el conjunto nativo backend. [Evidencia CI local](ci-local.json) identifica hashes del runtime/tests validados, base, entorno y cada check. [Selector375](selector-375.png) contiene solo datos sintéticos revisados, y la matriz verifica también320/768/1024/1440, ADMIN/COACH, selección/futura y axe. No equivale a aceptación humana con lector/cancha.

| Workflow PR `ci.yml` | Comando local equivalente | Estado final |
| --- | --- | --- |
| checks | `pnpm install --frozen-lockfile`, `pnpm ci:checks` | PASS |
| backend | Chromium, `pnpm ci:backend`, `node scripts/ci/probe.mjs` | PASS |
| staging | `pnpm ci:staging` (Docker propio sintético) | PASS |
| extended | `pnpm ci:extended` (matriz completa y fallos de transporte) | PASS |
| qualification | `pnpm ci:qualification` sobre evidencia de las cuatro suites | PASS |
| required | Cinco resultados success, cero omisiones aplicables | PASS |

[Seguro] Resumen final: checks14 PASS (core153/web471), backend16 PASS (84 integraciones de producto sin omisiones, conjunto nativo y SQL completos), probe6 PASS con sus4fallos deliberados detectados; staging53 PASS; extended47+42+1=90 PASS sin omisiones; qualification/required PASS. Carga canónica500atletas/5000registros/192peticiones: p95 máximo87.55ms; bundle199661bytes gzip, presupuestoPASS y delta543bytes. Estos dos últimos son gates generales del repositorio, no un benchmark independiente del nuevo dashboard.

[Seguro] Dos ajustes derivados del cambio conservaron los gates: ledger comparado con inventario exacto de migraciones y fixture de hash alterado con historia completa; test de fallo del inicio actualizado a la URL dashboard manteniendo error/no-vacío/reintento. Checks y extended se repitieron completos tras ese ajuste de test; backend/staging validaron el mismo runtime/SQL/artefacto. La incorporación final de este registro/PNG solo modifica documentación; no cambia los hashes validados de runtime/tests. Auto-revisión acotada al diff contra la base, sin hallazgos pendientes, y git diff --check PASS. No se publicó un PR antes del gate.

[Seguro] Los gates de pgTAP originales40/1646 no se modifican; se añade una suite específica independiente. El workflow extended programado/manual no es otra matriz del PR: comparte el mismo comando. Node24.16.0/pnpm10.33.2 coinciden con CI. Evidencia local no acredita GitHub Actions ni aceptación humana/cloud. Lector/zoom nativo/cancha y aceptación operacional permanecen pendientes de los issues correspondientes.
