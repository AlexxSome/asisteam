# MIG-12 · Historial y reportes por Nest (#156)

[Seguro] Base real `af09585c55962d7947cff83178181ce76e653c14` de `origin/develop`, rama `codex/156-historial-reportes-nest`, 07-10-2026. #148/#149/#152/#155 están cerrados e integrados. Graphify se actualizó sobre el checkout (2842 nodos iniciales;2890 nodos/38327 enlaces finales); los archivos se localizaron exclusivamente con el grafo. El cambio ajeno de `next-env.d.ts` se conserva y queda fuera del commit.

## Contrato y fuentes canónicas

[Seguro] [Contrato core](../../../packages/core/src/http-reports-contract.ts), OpenAPI y SDK generan cuatro GET implementados bajo `/api/v1/groups/{groupId}`:

| Ruta | Fuente SQL y autorización |
| --- | --- |
| `/me/history` | `get_my_attendance_history`: ATHLETE propio, identidad de sesión; ninguna membership/identidad de cliente. |
| `/wards/{athleteUserId}/history` | `get_ward_attendance_history`: GUARDIAN, vínculo/edad/membresías vigentes reevaluadas en cada petición. |
| `/reports` | `get_group_attendance_report`: ADMIN/COACH, métricas agregadas sin PII ni notas; inactivos opcionales y orden estable. |
| `/stats` | `get_group_stats`: toggles independientes por rol, solo nombre/avatar autorizado/métricas agregadas. |

[Seguro] Sesión temporal, aceptación vigente y membership ACTIVE se verifican en una transacción con rol mínimo `asisteam_api`; las RPC repiten los permisos de su operación y proyectan datos autorizados. Actor/tenant/roles nunca se obtienen de campos de cliente. Los grants existentes son suficientes: no cambia SQL, RLS, esquema ni tipos DB. No se duplica la fórmula/corte temporal en Nest ni se añade cache. HTTP mantiene `cache-control: no-store`.

[Seguro] Historial/reporte admiten `period` week/month/custom/season, `from`/`to` ISO-date, `activity_type_ids` CSV (vacío=sin filtro, máximo100 UUID), `page`1–1000000 y `page_size`1–100 (default50). Reporte añade `include_inactive` boolean y `sort` attendance/name; stats solo paginación. Los schemas estrictos rechazan actor/membership/otros campos, arrays ambiguos de query, fechas/rangos y límites inválidos. Zod/core refina el período y SQL valida tipos del grupo y reglas; OpenAPI no sustituye esas validaciones. Errores SQL conocidos se traducen mediante allowlist, nunca por texto libre/diagnóstico.

## Web, corte y reversión

```sh
ASISTEAM_TRANSPORT_REPORTS=nest
ASISTEAM_API_ORIGIN=https://<origen-api>
ASISTEAM_API_SUPABASE_URL=https://<mismo-proyecto-supabase>
```

[Seguro] DATABASE_URL/emisor/clave pública de Auth corresponden a la misma base conforme al [runbook API](../../../apps/api/README.md). Supabase sigue default. REPORTS conecta los loaders de historial, reporte y stats, incluidos resúmenes de inicio y reportes de ATHLETE/GUARDIAN. GROUPS/MEMBERS/ACTIVITIES conservan sus banderas de contexto independientes. Configuración inválida falla cerrado y cada operación ejecuta un único transporte; error/timeout no consulta automáticamente el otro.

[Seguro] Rutas/códigos y39 páginas se conservan; REP-01/REP-02, PRF-02 e historial de pupilo mantienen ReportFilters, ReportTable/StatsTable y AttendanceHistoryContent. Filtros/tipos múltiples/inactivos/orden/paginación, tabla enfocable con cabeceras y estados de error/sin datos usan los mismos DTO. V1/V2 permanecen con toggles apagados. Stats403 `group_stats_disabled` oculta agregados; otros403 no se presentan como una revocación de toggle. Los porcentajes null permanecen «Sin datos». Revertir REPORTS a supabase selecciona las mismas filas/IDs en futuras lecturas.

## Reproducción y evidencia

```sh
pnpm api:generate
pnpm ci:checks
API_REPORT_EVIDENCE=1 pnpm ci:backend
API_RLS_TEST=1 API_REPORT_EVIDENCE=1 pnpm --filter @asisteam/api exec node --test test/reports.integration.mjs
ASISTEAM_QA_NEST=1 pnpm --filter @asisteam/web test:e2e:full --grep MIG-12
```

[Seguro] Node24.16.0/pnpm10.33.2, macOS arm64, Docker/PostgreSQL17 y Supabase local; únicamente fixtures sintéticos. Shims Corepack temporales aseguran pnpm10 en procesos anidados. Ejecutar E2E, backend y build/typecheck en secuencia: QA y suites HTTP provisionan/restauran el mismo rol API. Los fixtures propios limpian únicamente sus filas y restauran credentials del rol. Reportes publicables no incluyen tokens/secretos/PII/SQL/logs crudos.

[Seguro] La [integración real](../../../apps/api/test/reports.integration.mjs) lee la misma batería JSON de `report_metrics.test.sql` que Vitest/pgTAP: nueve casos con77.8%, half-up6.3%, denominador cero/null, EXCUSED y LATE. Compara DTO completos HTTP con las RPC bajo rol legacy authenticated, usando el mismo actor/base. Comprueba convocatoria, futura/pre-ingreso (ingreso posterior al inicio de temporada), mes/semana/custom/season, borde de medianoche Chile, ámbitos separados, multirol, PENDING/INACTIVE,500 deportistas/nombres repetidos/páginas100, notas propias/pupilos, privacidad de terceros, toggles independientes y revocación con la misma sesión. Una corrección se refleja en la siguiente lectura.

| Check | Resultado |
| --- | --- |
| Lint/generación/tipos/build/Next/SDK | PASS [checks](checks.json), core150/web885/API/SDK;81 integraciones web opt-in separadas |
| Web focalizada | PASS27/27,0 omitidas (loaders Nest + regresión Supabase) |
| HTTP/SQL MIG-12 | PASS,0 omitidas; batería/roles/períodos/paginación y baseline p95 |
| Playwright375px/teclado/axe | PASS3/3,0 omitidas,21.7s [evidencia](e2e.json);4 análisis,0 violaciones automáticas; aria-valid-attr-value incompleta |
| Captura revisada | [Reporte375px](reports-375.png), filtros custom/sin datos y tabla contenida |
| Backend/pgTAP global | [Backend](backend.json): sesiones/RLS/grupos/perfil/members/actividades/reportes/asistencia/invitaciones, portabilidad y tipos PASS; pgTAP FAIL solo cuota invitaciones caso15 |
| Producto/base | PASS81/81,0 omitidas [producto](product.json); [baseline](baseline.json) reproduce pgTAP caso15 FAIL en test byte-idéntico |
| Imagen/ensayo Docker local | PASS build/roles/readiness/dos artefactos/rollback/cleanup [evidencia](staging.json); fallo inyectado esperado, sin despliegue externo |
| CI remoto/provisión cloud | PENDIENTE publicación; no inferir PASS |
| Lector humano/zoom nativo/latencia productiva | OMITIDOS; axe acotado y p95 local no sustituyen esos gates |

[Seguro] [Rendimiento](performance.json):20 muestras alternadas con500 ATHLETE/página100. Baseline=RPC SQL autenticado incluyendo BEGIN/ROLLBACK; destino=Nest HTTP/SDK local incluyendo sesión/guards/validación. Se verifica igualdad de respuesta en cada muestra. p95 final: SQL27.29ms, Nest HTTP32.98ms. No es una comparación de red PostgREST ni carga concurrente/remota; p95 local no representa producción. No hay cache anticipada.

[Seguro] Auto-revisión limitada al diff frente a la base: autorización, parámetros/DTO, proyecciones, errores, deadline/no-store, un ejecutor, generados, fixtures y limpieza. Los primeros fallos de integración fueron del fixture (relationship/consent schema y revocación del único apoderado bloqueada correctamente por R1); se corrigieron sin cambiar producto/SQL. La primera QA tuvo503 por solapar accidentalmente backend y E2E; backend se detuvo y las corridas siguientes son secuenciales. Se corrigió el selector accesible de período y una expectativa canónica indebidamente aplicada al fixture500 persistente. La corrida final E2E pasó. Los JSON guardan base/sourceCommit anterior al commit; Git/PR identifica el árbol publicado.

[Seguro] El caso15 de send_invitations.test.sql falla igualmente con el archivo byte-idéntico a la base (cmp) ejecutado sobre el mismo stack sintético; la aserción confirma el índice15 y un único fallo. Ya consta en MIG-03/MIG-05/MIG-11. No se modifica SQL ni ese test;81/81 integraciones producto y toda integración Nest pasan. Esto demuestra reproducción local sobre el test de base, no restauración prístina de la DB. Conforme al límite de entrega de MIG-03 se entrega **PR draft revisable** con backend rojo explícito; CI efímera decide sus propios gates y el usuario decide merge.
