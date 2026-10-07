# MIG-10 · Actividades, tipos y recurrencia por Nest (#154)

[Seguro] Base `e75031442dbaa669ee8795145ec66e092bb17eed` de origin/develop; rama `codex/154-actividades-nest`. Dependencias #148/#149/#151 cerradas e integradas. Fecha 2026-10-07. Checkout aislado conserva los cambios ajenos del proyecto original. El contrato migra capacidades existentes sobre la misma base canónica.

## Contrato y reglas

| Operación HTTP bajo /api/v1 | Fuente y límite |
| --- | --- |
| GET /groups/{groupId}/activities | v_group_activities, membership ACTIVE, próximas/pasadas, 50 filas y hasNext |
| GET /me/activities | Grupos ACTIVE seleccionados (hasta30), deduplicados; agenda global/pupilo por selección web validada |
| GET /me/activities/home | Próxima/en curso por ends_at y anterior; reloj SQL UTC de la transacción |
| GET /groups/{groupId}/activities/{activityId} | Columnas explícitas, tenant consistente, 404 ajeno/no visible |
| POST /groups/{groupId}/activities | ADMIN + create_activity; UUID primera ocurrencia |
| PATCH /groups/{groupId}/activities/{activityId} | ADMIN + update_activity, scope single/series, cantidad afectada |
| DELETE /groups/{groupId}/activities/{activityId} | ADMIN + delete_activity, scope/confirmación explícitos |
| GET /groups/{groupId}/activity-types | v_activity_types sistema+tenant, 100 filas/página; include_inactive boolean |
| POST/PATCH /groups/{groupId}/activity-types/{typeId?} | CRUD trivial ADMIN con RLS; solo tipos personalizados del grupo, sin cambiar ownership |

[Seguro] DTOs estrictos Zod/core, OpenAPI y SDK generado son independientes del tipo Database. La API obtiene actor/sesión/contexto de MIG-05 y consulta membership dentro de la transacción; no confía en roles del JWT ni actor HTTP. RLS/constraints/triggers/RPC existentes mantienen autorización e invariantes. No hay migración, cambios SQL/RLS ni tipos DB que regenerar. Nombre duplicado del tipo produce409 estable; tipo ajeno/sistema en edición devuelve404.

[Seguro] La API recibe/entrega instantes UTC con offset explícito; Next usa el validador/conversión canónicos de Chile. La expansión semanal materializada mantiene 26 semanas/150 instancias, hasta inclusivo y horas locales. SQL rechaza transaccionalmente horarios inexistentes/repetidos. Editar serie no reexpande ni modifica la regla: conserva fechas y actúa desde la seleccionada solo sobre futuras sin asistencia. Locks compartidos con asistencia vuelven a evaluar después de una escritura concurrente. Eliminar serie conserva historia aunque confirm_attendance sea true; eliminar puntual con asistencia sigue exigiendo confirmación adicional. Los cuatro tipos fijos y su inmutabilidad permanecen en servidor/base.

[Seguro] Web lib/activities, acciones CRUD y tipos cambian por ACTIVITIES. Agendas globales y de pupilos conservan filtro ACTIVE y nombres/retornos; tarjetas inicio usan el mismo transporte. Los códigos/rutas/39 páginas, ActivityForm/ActivityTypeForm, resúmenes, estados de guardado/error y confirmaciones no cambian. Errores de resultado incierto no muestran éxito ni ejecutan segundo transporte. Logs excluyen PII/tokens/SQL; DTOs de actividades no incluyen datos personales ni notas.

## Corte y reversión

```sh
ASISTEAM_TRANSPORT_ACTIVITIES=nest
ASISTEAM_API_ORIGIN=https://<origen-api>
ASISTEAM_API_SUPABASE_URL=https://<mismo-proyecto-supabase>
```

[Seguro] Mantener DATABASE_URL con asisteam_api y SUPABASE_AUTH_URL/clave pública del mismo proyecto conforme al runbook API. El default es supabase. Configuración/orígenes inválidos fallan cerrado. Auth/cookies SSR y módulos de asistencia/reportes/QR/billing/anuncios mantienen sus transportes hasta sus issues. Revertir ACTIVITIES a supabase y redesplegar Next selecciona el ejecutor anterior sobre las mismas filas/IDs, sin restaurar snapshot ni repetir un write incierto. Esto no acredita retirada completa de Supabase ni despliegue cloud.

## Verificación

```sh
pnpm api:generate
pnpm ci:checks
pnpm ci:backend
API_RLS_TEST=1 pnpm --filter @asisteam/api exec node --test --test-reporter=tap test/activities.integration.mjs
ASISTEAM_QA_NEST=1 pnpm --filter @asisteam/web test:e2e:full --grep MIG-10
```

[Seguro] Node24.16.0/pnpm10.33.2, macOS/Docker/PostgreSQL17/Supabase local sintético. Fixtures HTTP únicos limpian solo sus filas y restauran LOGIN/password API. E2E usa namespace QA local, limpia solo sus actividades/tipo, no ejecutar junto con build/typecheck u otras suites que provisionen rol API. Los informes publicables son saneados; no adjuntar logs crudos.

[Seguro] Descubrimiento exclusivamente graphify: AST/SQL actualizado (2793 nodos/12131 enlaces; inicial2477/6314) y catálogo SQL (281/733) con dependencias opcionales aisladas en /tmp. Auto-revisión limitada al diff frente a la base: proyecciones, SQL parametrizado, RLS/actor/sesión, validación/UTC, una sola ejecución, paginación, generados y cleanup. Corregidos antes de entregar: SQL NULL para recurrencia ausente, conflicto de nombre estable409 y acceso opcional del test.

| Check | Estado |
| --- | --- |
| Lint/generación/typecheck/build/contrato Next | PASS final [checks](checks.json) |
| Unitarias | PASS core150/web870/API/SDK (incluye5 nuevos contratos ACTIVITIES);81 opt-in omitidas en unitarias |
| HTTP/SQL MIG-10 | PASS1/1,0 omitidas,1.16s; [focalizadas](focused.json); roles/tenants/PENDING, sistema/inactivos/nombre duplicado, concurrencia/historia, DST23h y rollback gap, límites/schema |
| E2E375px/axe | PASS1/1,0 omitidas,18.59s; gap validado, crear/editar/eliminar serie con historia y desactivar tipo; [focalizadas](focused.json) |
| pgTAP/backend completo | Afectado actividades/series/tipos PASS; baseline reproduce caso15 [producto/base](product.json). Global FAIL únicamente send_invitations caso15; sesión/RLS/grupos/perfil/MEMBERS/actividades/invitaciones/portabilidad/tipos PASS [backend](backend.json) |
| Integraciones producto | PASS81/81,0 omitidas,53.21s [producto y baseline](product.json) |
| Staging Docker local | PASS imagen/roles/PostgreSQL, dos artefactos, rollback y cleanup; fallo inyectado esperado [staging](staging.json) |
| CI remoto/staging externo | PENDIENTE publicación; no inferir PASS |
| Lector humano/cancha/provisión cloud | OMITIDOS en este entregable; axe acotado no certifica WCAG completa |

[Seguro] El caso15 de cuota de send_invitations se reproduce con el test byte-idéntico extraído de `e750314` sobre el stack compartido actual: un único fallo, «rechazos no consumen cuota». No es un restore prístino de la base. #154 no modifica SQL/migraciones/funciones/pgTAP. La evidencia previa de MIG-03/MIG-05/MIG-07/MIG-09 ya registra este caso; el nuevo transporte no lo agrava. Conforme al límite de entrega documentado en [MIG-03](../issue-147/README.md), el PR se entrega revisable con backend local rojo explícito, sin declarar gate global aprobado ni autorizar merge. CI sobre DB efímera debe decidir su propio resultado; no extrapolar el FAIL local ni inferir éxito remoto.

[Seguro] Los FAIL deliberados de portabilidad y staging llevan `expected: true`; el fallo pgTAP de producto permanece FAIL. Los JSON registran HEAD/base anterior al commit de entrega y el árbol comprobado; Git/PR relacionan esa evidencia con el commit publicado. No se adjuntan diagnósticos crudos ni secretos. La primera E2E detectó una aserción SQL sin esperar el guardado del tipo: se corrigió el fixture y la repetición18.59s acredita persistencia y éxito visible.
