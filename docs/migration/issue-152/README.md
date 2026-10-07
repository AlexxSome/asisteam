# MIG-08 · Integrantes, apoderados y consentimientos (#152)

[Seguro] Base `7cf082e0f08b0e2bdfcd03c72d7314cdd558cf78` de `origin/develop`, con #149 y #151 integrados; rama `codex/152-integrantes-consentimientos`. Fecha 2026-10-07. Gitflow/documentación MIG usa develop; main contiene el README inicial. El worktree aislado preserva next-env, .pnpm-store y plan no seguido del checkout original. Los JSON registran la base del árbol probado antes del commit de entrega; el commit publicado se consulta en Git/PR.

## Contrato y autorización

[Seguro] 17 operaciones HTTP Nest y métodos SDK/OpenAPI generados consumen las RPC/vistas canónicas de PostgreSQL con una conexión/transacción `asisteam_api`, sesión Supabase vigente, perfil ACTIVE y RLS. No hay migraciones, reglas SQL duplicadas ni cambio de tipos de DB. El actor procede exclusivamente de SessionGuard; schemas estrictos rechazan actor/rol/campos desconocidos. Escrituras conservan locks, capacidad, R1, último ADMIN, 30 grupos y evidencia histórica de las RPC.

| Método/ruta bajo `/api/v1` | Fuente y contrato |
| --- | --- |
| GET `/groups/{groupId}/memberships` | `list_group_members`; solo ADMIN, búsqueda literal, roles/estado, 50 por página y total incluso página vacía |
| POST `/groups/{groupId}/managed-members` | `create_managed_member`; adulto ACTIVE, menor PENDING hasta consentimiento; no credenciales |
| PATCH `/groups/{groupId}/memberships/{membershipId}/managed-profile` | `update_managed_member`; perfil global MANAGED; fecha mayor pendiente de revisión preserva valor actual |
| POST `.../approve`, `.../reject` | `approve_membership` / `reject_pending_membership`; decisión ADMIN y transición lógica |
| POST `.../deactivate`, `.../reactivate` | `deactivate_membership` / `reactivate_membership`; conserva joined_at/historia, valida R1/cupos/último ADMIN/pupilos |
| POST `.../coach` | `assign_member_coach`; fila independiente, idempotente, conserva ATHLETE |
| GET `/memberships/onboarding` | `list_membership_onboarding`; propio/ADMIN/apoderado autorizado; sin contacto, fecha ni notas de terceros |
| POST `/memberships/{membershipId}/data-consents` | `consent_membership_data`; ratificación MANAGED activa atómicamente; código queda PENDING hasta ADMIN |
| POST `/groups/{groupId}/guardianships` | `create_guardianship`; vínculo de menor y rol GUARDIAN, no presume consentimiento |
| GET `/groups/{groupId}/guardianships/eligible-athletes` | `list_guardianship_athletes`; ADMIN, búsqueda y página acotada |
| GET `/groups/{groupId}/memberships/pending-summary` | `list_pending_athletes`; resumen autorizado de inicio |
| GET `/account-consents/current`, POST `/account-consents` | `has_account_consent` / `accept_account_terms`; acceso propio previo al gate, sin omitir sesión ACTIVE/RLS |
| GET `/me/wards`, `/me/wards/{athleteUserId}` | `v_my_wards` + `v_my_ward_groups`; proyección mínima y único snapshot; ajeno/adulto/revocado 404 |

[Seguro] La nómina ADMIN contiene contacto/nacimiento autorizado; onboarding/pupilos excluyen email, teléfono, fecha, notas y datos de terceros. V5/V6 se aplican en SQL/DTO. Las vistas retiran visibilidad al revocar vínculo/consentimiento o cumplir 18; los workers existentes permanecen en su migración #160. Errores conocidos conservan código/HTTP; diagnósticos SQL, mensajes remotos, PII y tokens no salen en cuerpo/logs. `PT` conserva 400/401/403/404/409/422/429; indisponibilidad/timeouts SDK son 503/504.

## Web y reversión

[Seguro] Server Components/Actions de nómina, alta/edición MANAGED, aprobación/rechazo, bajas/reactivaciones, COACH, vínculos, onboarding/consentimiento, resumen de grupo, pupilos, aceptación, middleware y callback usan MEMBERS. Los componentes y 39 páginas conservan diseño/rutas/códigos; docs 05, 07 y sistema visual reconcilian el transporte.

```sh
ASISTEAM_TRANSPORT_MEMBERS=nest
ASISTEAM_API_ORIGIN=https://<origen-nest>
ASISTEAM_API_SUPABASE_URL=https://<mismo-proyecto-supabase>
```

[Seguro] Default `supabase`; el selector exige mismo origen declarado que NEXT_PUBLIC_SUPABASE_URL. DATABASE_URL/Auth issuer deben corresponder físicamente a ese proyecto; las pruebas locales acreditan un backing store compartido, no provisión cloud. Revertir la bandera y redesplegar Next selecciona el adaptador anterior sobre la misma base. No restaurar snapshot ni repetir automáticamente writes inciertos. Error/timeout nunca ejecuta el segundo transporte. Filtros opcionales undefined se omiten del querystring, mientras false/defaults permanecen; regresión SDK y HTTP real cubren la causa del 500 encontrada durante E2E.

[Seguro] Middleware preserva cookies refrescadas y no-store: consentimiento pendiente redirige a aceptación; indisponibilidad Nest devuelve 503 sin confundirla con aceptación pendiente ni pupilo no visible (404). Invitaciones, envío post-alta, lista/revisión de activación propia y claim de credenciales conservan el adaptador temporal #153. Consentimiento de imagen sigue perfil/#151; asistencia/reportes y workers conservan sus módulos. No se habilitan capacidades P2, móviles u offline nuevas.

## Reproducir y resultados

```sh
pnpm install --frozen-lockfile
pnpm ci:checks
pnpm ci:backend
pnpm ci:staging
API_RLS_TEST=1 node --test apps/api/test/members-consents.integration.mjs
ASISTEAM_QA_NEST=1 pnpm --filter @asisteam/web test:e2e:full --grep 'MIG-08|menor por código|alta MANAGED|pupilos e historial|restricciones reales'
pnpm --filter @asisteam/web test middleware.test.ts members.test.ts
```

[Seguro] Node24.16.0/pnpm10.33.2, Docker/Supabase local sintético. No correr E2E con builds/typecheck ni con integraciones que provisionen temporalmente el rol API. Los fixtures HTTP crean IDs únicos, limpian solo esos perfiles/grupos y restituyen LOGIN/password; E2E usa el namespace QA sintético existente. Reportes adjuntos contienen solo estados/tiempos/conteos/base y no credenciales ni cuerpos/logs crudos.

| Verificación | Resultado/evidencia |
| --- | --- |
| Lint, generación, typecheck, builds, contrato Next | PASS [checks](checks.json) tras corrección SDK |
| Unitarias core/web/API/SDK | PASS core150, web850; 81 opt-in omitidas en unitarias, verificadas aparte; API/SDK sin omitidas |
| Integración MIG-08 HTTP/SQL/SDK real | PASS 1 suite sin omitidas, [focalizadas](focused.json); R1, V5/V6, bajas, historial, MANAGED, COACH, último ADMIN, schema estricto y aceptación previa |
| Concurrencia HTTP/SQL | PASS aprobar/rechazar, doble ratificación idempotente, revocar/reactivar, último cupo operacional y apoderado 29→30 grupos |
| E2E Next→Nest→PostgreSQL/GoTrue | PASS5 sin omitidas; menor por código→vínculo→consentimiento→ADMIN, MANAGED sin credenciales, pupilos/historial320px, restricciones, edición/COACH/baja/reactivación375px; axe acotado |
| Integraciones producto HTTP/Edge/SQL | PASS81/81, cero omitidas; [ejecución separada](issue152-product-integrations.json) después del stop pgTAP |
| Backend global | FAIL [backend](backend.json): solo pgTAP send_invitations caso15, 1/51; sesión/grupos/MIG08/portabilidad/tipos PASS |
| Baseline exacto origin/develop | FAIL [reproducción](issue152-pgtap-baseline.json): mismo caso15 «rechazos no consumen cuota»; no diff Supabase |
| Staging Docker local | PASS [staging](staging.json): roles/base reales, dos imágenes, rollback y fallo deliberado esperado, limpieza |
| Middleware tras revisión final | PASS63 focalizadas + typecheck; distingue 503/no-store y 404 sin fallback [focalizadas](focused.json) |
| QA extendida completa | OMITIDA en este issue; cinco recorridos pertinentes ejecutados con Nest |
| CI remoto/provisión cloud | PENDIENTE publicación; inspeccionar PR sin inferir PASS ni despliegue |
| Lector humano/cancha/proveedores externos | OMITIDOS; axe acotado no certifica WCAG completa |

[Seguro] Descubrimiento exclusivamente graphify: AST actualizado en repo y catálogo PostgreSQL (279 nodos/731 enlaces); SQL de migraciones extraído con parser opcional temporal (213 nodos/617 enlaces). Auto-revisión acotada al diff incluye fuentes/generados, sesión/RLS, SQL/DTO, errores, flags, middleware y fixtures. Se corrigieron filtros undefined y la distinción de indisponibilidad del middleware; next-env regenerado incidental y artefactos de build/grafo no se incluyen.

[Seguro] Según límite documentado de MIG-03/#147, el fallo ajeno comprobado permite entregar PR revisable con gate rojo explícito; no se declara backend verde ni merge autorizado. No se mergea ni cierra #152. Los FAIL de portabilidad/staging marcados expected son pruebas deliberadas; el FAIL pgTAP permanece fallo de producto. El commit publicado vincula estos JSON (base anterior) con el árbol probado.
