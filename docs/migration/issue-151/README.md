# MIG-07 · Grupos, perfil y selector multi-grupo (#151)

[Seguro] Base `497d76a` de `origin/develop`, que integra MIG-04/MIG-05 (#148/#149); rama `codex/151-grupos-perfil`. Fecha 2026-10-07. La documentación local de Gitflow y las bases de MIG-01–MIG-06 ubican este trabajo en develop; main contiene solo el README inicial. El prefijo codex sigue la instrucción vigente de la app. Worktree aislado: conserva los cambios ajenos del checkout original (next-env.d.ts, .pnpm-store y plan de migración no seguido). El commit de entrega se consulta en Git/PR; los JSON registran la base del diff comprobado.

## Implementación y contrato

[Seguro] Grupos y perfil tienen handlers Nest reales y SDK OpenAPI generado. Cada operación verifica sesión Supabase vigente mediante MIG-05, perfil ACTIVE y aceptación del aviso vigente; todas las consultas de dominio usan una transacción/conexión `asisteam_api` sin ownership/BYPASSRLS. RLS, triggers, vistas y RPC canónicas permanecen en la misma base. No hay migraciones ni nuevos tipos de DB.

| Operación `/api/v1` | Fuente canónica y límite |
| --- | --- |
| GET `/me/groups` | `v_my_groups`; solo ACTIVE, unión de roles, orden name/id; paginación 50 default/100 máximo y total del mismo snapshot |
| GET `/groups/{groupId}` | `v_group_detail` + membership vigente; ADMIN recibe código/settings; otras proyecciones excluyen PII y campos ADMIN; ajeno/inactivo/PENDING → 404 |
| POST `/groups` | `create_group`; actor de sesión, límite 30, ADMIN y toggles false |
| PATCH `/groups/{groupId}` | CRUD trivial de nombre/deporte/descripción/logo; membership ADMIN y RLS; no campos de permisos |
| PATCH `/groups/{groupId}/settings` | `update_group_settings`; patch independiente, valores false predeterminados y autor/fecha preservados |
| POST `/groups/{groupId}/invite-code/rotate` | `rotate_invite_code`; ADMIN, código anterior invalidado |
| POST `/groups/{groupId}/memberships/self` | `join_group_as_athlete`; ADMIN, R1/cupos y multirol preservados |
| POST `/groups/join` | `join_group_by_code`; ATHLETE, minor PENDING, cuotas por actor; rechazo esperado confirma contador antes del error HTTP |
| GET/PATCH `/me` | Columnas propias explícitas; revisión de edad y consentimiento mediante triggers/RPC |
| GET `/me/profile-context` | Estado propio de corrección, permiso de imagen y flag ADMIN; `list_avatar_permissions` solo de pupilos autorizados |
| GET/POST `/me/birthdate-reviews/{requestId?}` | `list_birthdate_reviews`/`review_birthdate_change`; ADMIN de grupo, no autoaprobación, confirmación de todos los grupos |
| PATCH `/me/avatar-permissions/{guardianshipId}` | `set_avatar_permission`; apoderado vigente/menor/consentimiento; nueva evidencia sin borrar historia |

[Seguro] Schemas estrictos rechazan actor/rol/campos desconocidos en HTTP; las Server Actions proyectan los campos editables del formulario. Errores conocidos conservan código de dominio y estado HTTP; diagnósticos SQL/PII/tokens no salen en cuerpos ni logs. El SDK descarta los mensajes/cuerpos remotos y la UI traduce códigos conocidos a textos en español. Desconocidos fallan con error genérico, sin reintento automático.

[Seguro] PATCH de perfil bloquea primero su fila, crea SAVEPOINT y ensaya el UPDATE sujeto a triggers. Únicamente `birthdate_admin_confirmation_required` recupera al SAVEPOINT, llama a la RPC de solicitud y guarda nombre/teléfono; conserva la fecha actual. Cualquier otro error revierte la transacción. La revisión de todos los grupos conserva R1 y la pérdida de visibilidad de apoderados al aplicar la corrección. No se inventa una regla de edad en Nest.

## Web, transporte y reversión

[Seguro] `lib/groups`, creación/configuración/visibilidad/código/autoalta/ingreso y perfil/revisiones usan el cliente bajo las banderas de módulo. Middleware consulta detalle por Nest antes del streaming cuando GROUPS=nest. Selector y cookie por Auth UUID conservan su contrato; las membresías se vuelven a validar. Auth/refresh y aviso vigente siguen temporalmente en Supabase. Otras capacidades de las páginas (agenda, asistencia, billing, integrantes) siguen sus propios issues/transportes.

```sh
ASISTEAM_TRANSPORT_GROUPS=nest
ASISTEAM_TRANSPORT_PROFILE=nest
ASISTEAM_API_ORIGIN=https://<origen-api-sin-path>
ASISTEAM_API_SUPABASE_URL=https://<mismo-proyecto-supabase>
```

[Seguro] `ASISTEAM_API_SUPABASE_URL` debe coincidir con `NEXT_PUBLIC_SUPABASE_URL`; DATABASE_URL y Auth issuer del runtime deben pertenecer físicamente a ese proyecto. El selector valida la declaración; integración real demuestra el backing store compartido, no la provisión cloud. El default sigue `supabase`. Revertir cada bandera a `supabase` y redesplegar Next restaura el transporte sobre la misma base: no restaurar un snapshot ni repetir writes cuyo resultado sea incierto. Error/timeout nunca ejecuta el segundo transporte.

[Seguro] Storage/upload/download de avatar mantienen su adaptador Supabase temporal, MIME/firma/tamaño, RPC y revocación de imagen. #161 sustituirá ese transporte; esta entrega no declara salida completa de Supabase. El onboarding pendiente, agenda y billing preservan sus capacidades y su planificación de migración. No se habilitan móviles/offline/FCM/APNs ni funciones nuevas.

## Reproducir

```sh
pnpm install --frozen-lockfile
pnpm ci:checks
pnpm ci:backend
pnpm ci:staging
pnpm ci:extended
# Recorrido del issue sin ejecutar toda la QA extendida:
API_RLS_TEST=1 pnpm --filter @asisteam/api exec node --test test/groups-profile.integration.mjs
ASISTEAM_QA_NEST=1 pnpm --filter @asisteam/web test:e2e:full --grep 'MIG-07|rol .*:|cambio de grupo|restricciones reales'
```

[Seguro] Docker/Supabase local sintético, Node24 y pnpm10.33.2. No ejecutar E2E simultáneamente con build/typecheck o integraciones que provisionen temporalmente el mismo rol API. Los fixtures HTTP crean IDs únicos y limpian exclusivamente sus cuentas/grupos; E2E reutiliza el namespace sintético de QA y restaura nombre de grupo/perfil tras editar. El rol API local recupera LOGIN/password original al terminar. Ningún secreto se adjunta; informes CI contienen únicamente check/estado/tiempo/conteos/base.

## Verificación y auto-revisión

[Seguro] Descubrimiento exclusivamente graphify: AST actualizado frente a la base y catálogo PostgreSQL (279 nodos/731 enlaces), con dependencias opcionales en /private/tmp. Auto-revisión limitada a este diff: datos proyectados, RLS/sesión/aviso, SQL parametrizado, commits de rechazo de código, SAVEPOINT, selección por módulo, middleware/errores, generación y fixtures. Los resultados finales se adjuntan en JSON y en el PR.

| Check | Resultado |
| --- | --- |
| Lint/typecheck/build/generación | PASS local `ci:checks` |
| Unitarias core/web | PASS 150/840; 81 integraciones web omitidas aquí y verificadas en backend |
| API/cliente generado | PASS, cero omitidas |
| Integraciones de módulos Postgres/HTTP/Edge | PASS 81/81, cero omitidas; ejecución independiente tras el stop de pgTAP |
| Probes CI | PASS detección de dos FAIL deliberados; fuentes temporales retiradas |
| Integración MIG-07 HTTP/SQL | PASS 2/2, cero omitidas; cuatro roles/multirol, tenant/PENDING/inactivo, R1/edad en dos grupos, defaults/toggles/cupos, imagen y cuota |
| E2E Next→Nest→PostgreSQL/GoTrue | PASS 8, cero omitidas;375px/axe, roles/selector, restricciones, guardar grupo/perfil |
| Paridad PostgREST/Nest | PASS GoTrue real; cambios bidireccionales sin duplicar, logout 401 |
| Backend global | FAIL pgTAP: caso 15 de send_invitations; sesión/RLS, MIG-07, portabilidad y tipos PASS |
| Staging Docker | PASS roles/DB real, dos imágenes, rollback y fallo inyectado esperado |
| QA extendida | PASS 33 responsive/axe + 1 fallo transporte + 8 Nest; cero omitidas |
| CI remoto/provisión cloud | PENDIENTE publicación; no inferir PASS ni despliegue |
| Lector humano/cancha/proveedores externos | OMITIDOS en este entregable; axe no certifica WCAG completa |

[Seguro] PR revisable sin merge ni cierre automático de #151. Inventario de pantallas y sistema visual enlazan el alcance de transporte y evidencia sin presentar otras operaciones de las 39 páginas como migradas.

[Seguro] El fallo pgTAP local se reproduce con el archivo exacto de la base `497d76a`: 1/51, caso 15 «rechazos no consumen cuota». [Reproducción mínima](pgtap-baseline.json), [checks](checks.json), [backend](backend.json) y [staging](staging.json) y [extendida](extended.json) contienen solo evidencia saneada. No hay diff de SQL/RLS/funciones/tests en Supabase. Según el límite documentado en MIG-03, se entrega un PR revisable con el fallo explícito y el gate remoto pendiente; no se declara backend verde ni se autoriza merge. Los JSON registran HEAD/base anterior al commit de entrega y corresponden al árbol del issue probado; Git relaciona ese árbol con el commit publicado.

[Seguro] [Integraciones de módulos](issue151-product-integrations.json) y [probes CI](controlled-failure.json) acreditan la ejecución posterior al stop del runner backend. Los dos FAIL de probes y el fallo de artefacto/portabilidad están marcados `expected: true`; el fallo pgTAP de producto permanece FAIL. La última pasada lint tras corregir el fixture de paridad pasó. No quedaron fuentes temporales ni next-env generado en el diff.
