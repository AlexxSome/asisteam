# MIG-11 · Toma y edición de asistencia por Nest (#155)

[Seguro] Base `0075459b48fac9a9c79854e1f9ce1e68f6cf7216` de origin/develop; rama `codex/155-asistencia-nest`. Fecha2026-10-07. Dependencias #148/#149/#152/#154 cerradas e integradas. Se conserva el cambio ajeno de next-env.d.ts y queda fuera del commit. Descubrimiento exclusivamente graphify actualizado sobre esta base (2806 nodos/21457 enlaces; final2842/27065). Se reutiliza la misma base escritora.

## Contrato implementado

[Seguro] El [contrato core](../../../packages/core/src/http-attendance-contract.ts), OpenAPI y SDK generado implementan cuatro operaciones bajo `/api/v1/groups/{groupId}/activities/{activityId}/attendance`:

| Método | Contrato y fuente |
| --- | --- |
| GET | page≥1, default1;100 filas ordenadas por nombre/membership + hasNext. v_attendance_roster ATHLETE ACTIVE + v_attendance_operator; nombre/avatar/estado/nota autorizada, canEditNotes de membership del servidor. |
| PUT | records1–500, sin duplicados; only_unmarked boolean defaultfalse. record_attendance_bulk, atómico por lote, upsert único y marcas previas conservadas. |
| PATCH /{membershipId} | status y/o note parciales; resolve ID en vista acotada y update_attendance_record relee bajo bloqueo. Una nota omitida se conserva; nota sola no restaura un estado viejo. |
| DELETE /{membershipId} | clear_attendance_record; ADMIN solamente, idempotente para registro ausente de un ATHLETE ACTIVE válido. |

[Seguro] Sesión/actor/contexto PostgreSQL/RLS de MIG-05; membresías y consentimiento vigente comprobados en la transacción. La actividad debe pertenecer al groupId de la ruta antes de llamar RPCs que reciben solamente activity_id. ATHLETE/GUARDIAN403; grupo ajeno/PENDING/INACTIVE404. COACH cambia estados, recibe notas nulas y no puede escribirlas (incluido null) ni desmarcar. ADMIN+otros roles conserva capacidades administrativas. SQL conserva recorded_by/recorded_at, UNIQUE, bloqueos, pertenencia ATHLETE al grupo y convocatoria explícita; el roster no crea convocatorias.

[Seguro] No cambia SQL/RLS/migraciones/tipos DB ni métricas. Solo PUT de asistencia admite body de hasta2MiB para500 notas Unicode de500 caracteres; restantes operaciones mantienen64KiB. Los schemas estrictos de core/API/SDK validan campos, estados, límite y duplicados. Se descarta la metadata de auditoría de la respuesta RPC: HTTP retorna records confirmados, sin PII/tokens/diagnósticos SQL. Errores de dominio conservan código estable y texto español.

## Web, corte y reversión

```sh
ASISTEAM_TRANSPORT_ATTENDANCE=nest
ASISTEAM_API_ORIGIN=https://<origen-api>
ASISTEAM_API_SUPABASE_URL=https://<mismo-proyecto-supabase>
```

[Seguro] Mantener DATABASE_URL con asisteam_api y emisor/clave pública de Auth del mismo proyecto conforme al runbook API. Supabase permanece default; configuración inválida falla cerrado. El loader recorre todas las páginas; las acciones mantienen revalidación y resultado seguro. ACTIVITIES/GROUPS conservan sus banderas independientes para contexto/detalle. No hay cambios en rutas/códigos/39 páginas ni en componentes o estilos.

[Seguro] AttendanceSheet conserva botones44px con etiqueta/check/aria-pressed, notas ADMIN, confirmation inline, procesamiento/guardado/error y rollback por fila. La acción masiva envía lotes secuenciales≤500; un fallo posterior conserva los confirmados y comunica lo pendiente. No hay fallback, retry automático, almacenamiento local ni cola offline. Un timeout puede haber persistido: recargar y consultar antes de repetir. Revertir ATTENDANCE a supabase selecciona el transporte previo sobre las mismas filas/IDs; no restaura snapshots ni repite un write incierto.

## Reproducir y evidencia

```sh
pnpm api:generate
pnpm ci:checks
pnpm ci:backend
API_RLS_TEST=1 pnpm --filter @asisteam/api exec node --test --test-reporter=tap test/attendance.integration.mjs
ASISTEAM_QA_NEST=1 pnpm --filter @asisteam/web test:e2e:full --grep MIG-11
```

[Seguro] Node24.16.0/pnpm10.33.2, macOS arm64/Docker/PostgreSQL17/Supabase local sintético. Se usaron shims Corepack temporales en /tmp para que scripts anidados no invocaran el pnpm11 global. Fixtures propios limpian solo sus filas y restauran rol API; los fixtures QA conocidos se reinician por el runner existente. No ejecutar E2E junto con build/typecheck ni suites que provisionen el mismo rol API.

| Check | Estado |
| --- | --- |
| Lint/generación/typecheck/build/Next/SDK | PASS [checks](checks.json); unitarias core150/web876/API/SDK;81 integraciones opt-in separadas |
| Unitarias web focalizadas | PASS16/16,0 omitidas |
| HTTP/PostgreSQL MIG-11 | PASS1/1,0 omitidas,1.39s focal/2.07s backend; lote0/1/500/501, Unicode, rollback, concurrencia, roles/tenant/notas y aceptación de términos |
| Backend/pgTAP global | [backend](backend.json): sesiones/RLS/grupos/perfil/MEMBERS/actividades/invitaciones/MIG-11, portabilidad y tipos PASS; pgTAP global FAIL únicamente send_invitations.test.sql caso15 |
| E2E375px/teclado/axe y fallo segundo lote | PASS2/2,0 omitidas,18.58s [evidencia](e2e.json); [captura revisada](attendance-375.png);0 violaciones automáticas,2 reglas incompletas por pantalla |
| Staging Docker local | PASS contenedor/roles/PostgreSQL, dos artefactos, rollback y cleanup; [staging](staging.json); fallo inyectado esperado |
| Integraciones de producto | PASS81/81,0 omitidas,53.20s; [producto y baseline](product.json); baseline FAIL caso15 confirmado y test byte-idéntico |
| CI remoto/provisión cloud | PENDIENTE publicación; no inferir PASS |
| Lector humano/zoom nativo/toma en cancha | OMITIDOS; axe acotado no certifica WCAG completa |

[Seguro] Auto-revisión limitada al diff frente a la base: DTOs/proyecciones, autorización, SQL parametrizado/transacciones, presupuesto HTTP, una ejecución por write, generados y fixtures/cleanup. Corregido el join inicial entre vistas de seguridad: con500 registros alcanzaba timeout; se sustituyó por dos consultas acotadas dentro de la misma transacción y se añadió recarga de500 a integración/E2E. El primer fixture se acotó al deportista conocido porque la base compartida contiene otros sintéticos de hitos anteriores. Los reportes publicables conservan únicamente commit/entorno/check/conteos/duración, sin logs crudos, credenciales ni PII. Los JSON relacionan el árbol comprobado con HEAD/base anterior al commit; Git/PR identifica el commit publicado.

[Seguro] El fallo de cuota de send_invitations caso15 ya figura en MIG-03/MIG-05/MIG-07/MIG-09/MIG-10. #155 no cambia SQL/funciones/migraciones/pgTAP. La reproducción sobre el test byte-idéntico de la base vuelve a fallar únicamente en caso15 (salida de pgTAP), y81/81 integraciones de producto pasan; ambos resultados se registran en [evidencia](product.json); no constituye restauración prístina de la DB. Conforme al límite de entrega de [MIG-03](../issue-147/README.md), se entrega PR revisable con backend local rojo explícito, sin declarar el gate global aprobado ni autorizar merge. CI efímera decide su propio resultado. Los FAIL deliberados de portabilidad/staging figuran expected:true; cuota sigue FAIL.
