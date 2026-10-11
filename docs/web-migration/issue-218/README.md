# WEB-06 · Integrantes, apoderados e invitaciones (#218)

[Seguro] Base `df0246d32add77ea260d1363f1ed1a3c50ab31ce` de origin/develop, 11-10-2026; rama `codex/218-integrantes-apoderados-invitaciones-vite`. WEB-05 (#217/PR #227) integrado. Descubrimiento exclusivamente graphify actualizado; implementación por un único ejecutor con auto-revisión. Producción continúa NO-GO.

## Resultado y alcance

[Seguro] Las ocho rutas de [doc 05](../../05-pantallas.md#integrantes-apoderados-e-invitaciones-react-router--web-06-218) mantienen la presentación Next existente en React Router y consumen el SDK browser cookie/CSRF. Los endpoints/schemas ya cubrían la migración: no se añaden contratos HTTP, migraciones SQL ni reglas de dominio. Core/browser expone únicamente schemas/constantes seguros; el artefacto browser se verifica sin módulos servidor.

[Seguro] ADMIN recibe nómina por membership con búsqueda, rol/estado y páginas de 50; conserva vacío real, filtros sin resultado y página posterior vacía con total. Gestiona perfil MANAGED, asignación COACH independiente, desactivación/reactivación con historia, pendiente con contexto y vinculación de apoderado. GUARDIAN recibe solamente sus pupilos vigentes, agenda, resumen mensual por grupo y tareas; nunca una métrica global ni notas/filas de terceros.

[Seguro] Menor gestionado queda PENDING hasta consentimiento efectivo; incorporación ordinaria conserva además confirmación ADMIN. Datos, membresía ACTIVE, credenciales propias e imagen siguen decisiones separadas. Activación MANAGED usa solicitud/consentimiento/invitación existentes y claim de WEB-04, sin duplicar persona ni membership. Cumplir 18 y vínculos/revocación se resuelven en servidor; ausencia de permisos no se convierte en un listado vacío por fallo de transporte.

[Seguro] Cada write se envía una vez. Alta/vínculo/autorización confirmados se conservan si el correo falla; respuesta incierta pide actualizar y comprobar estado antes de otro envío. Envío/reenvío mantienen limits/idempotencia durable de Nest; reenvío invalida el enlace anterior y conserva historia. No se afirma entrega/lectura del correo ni se usa proveedor externo real.

[Seguro] #177 sigue abierto y no se implementan detalle INT-02, directorio completo ni desvinculación ausentes en Next. Historial/actividades/reportes completos SPA corresponden a #219; billing/anuncios/QR a #220. Enlaces mantienen URL y Next durante coexistencia. No hay retiro Next ni deploy/corte real.

## Matriz del issue

| Recorrido | Evidencia automática |
| --- | --- |
| Nómina ADMIN/multirol/paginación, negativos ATHLETE/COACH/GUARDIAN y tenant | Unitarias loader/SDK y navegador real; datos V5 no visibles a no-ADMIN |
| Menor MANAGED PENDING→consentimiento→ACTIVE sin credenciales | UI+Nest+PostgreSQL, desactivar y reactivar denegado tras revocar; consent/historia conservados |
| Alta respondida de forma incierta | POST procesado y respuesta abortada; una escritura, una persona y recuperación por nómina |
| Invitación/reenvío incierto/expirada | UI cookie/CSRF, una escritura, dos filas históricas, enlace previo invalidado y preview expirada; replay en claim/acceso |
| LAST_ADMIN/salida GUARDIAN y tenant | HTTP real 409/422/404, confirmación con Cancelar enfocado |
| Menor ordinario, vínculo y aprobación; perfil/COACH/activación | UI vincular→consentir→confirmar ADMIN; adulto editar/asignar COACH/solicitar activación/claim conserva identidad y ambos roles |
| Responsive/axe | Un main/un H1, reflow 320/375/768/1024/1440, análisis axe sin violaciones automáticas; capturas seleccionadas |

## Verificación reproducible

```sh
pnpm install --frozen-lockfile
pnpm --filter @asisteam/web-vite typecheck
pnpm --filter @asisteam/web-vite build
pnpm --filter @asisteam/web-vite test
pnpm --filter @asisteam/web-vite test:e2e members.spec.ts
pnpm ci:checks
pnpm ci:backend
pnpm ci:staging
pnpm ci:extended
pnpm ci:qualification
git diff --check
```

[Seguro] Node24.16.0/pnpm10.33.2, Chromium Playwright1.63.0/axe4.13.0, macOS arm64. PostgreSQL17/S3 y perfiles/grupos/menores son fixtures sintéticos propios, con constraints/RLS intactos. Los seis casos WEB-06 restablecen únicamente los buckets IP loopback de login y preview/aceptación de invitación del fixture entre escenarios independientes; dentro de cada escenario se mantienen limits reales por cuenta/IP. No se copian reportes crudos, tokens, email payloads ni sesiones a evidencia versionada.

## Resultados

[Seguro] Los cuatro gates completos y qualification técnico terminaron PASS. Las corridas locales ocurrieron sobre el árbol del issue antes del commit: los JSON originales conservan sourceCommit/checkoutCommit de la base, y el manifiesto de contenido identifica los archivos verificados. El SHA de entrega se obtiene del commit/PR; esta evidencia no se presenta como CI remoto.

| Check | Resultado final |
| --- | --- |
| [ci:checks](evidence/checks.json) | PASS exit0: lint/contratos/tipos/build/Next HTTP/retiro y unidades; core150, Next961/84 omitidas existentes, Vite38/0 omitidas, Worker/API/SDK |
| [ci:backend](evidence/backend.json) | PASS exit0: PostgreSQL independiente/API/Worker/tipos/backup/PITR, integraciones nativas, OAuth, portabilidad, pgTAP/cobertura SQL y84 integraciones producto/0 omitidas |
| [ci:staging](evidence/staging.json) | PASS exit0: builds/despliegues Docker propios, artefactos distintos, rollback manual/automático, privacidad de logs, integración y cleanup |
| [ci:extended](evidence/extended.json) | PASS exit0: Next47/47 (131,09s), Vite30/30 (59,08s), negativos de transporte1/1 (14,17s);0 omitidas |
| [ci:qualification](evidence/qualification.json) | PASS exit0 técnico y carga:500 atletas/5000 registros,8 celdas/192 requests, p95 máximo117,03ms; acceptance NO-GO |
| [Playwright / historial de ejecución](evidence/execution-summary.json) | Vite completo30/30 y seis WEB-06; fallos previos y correcciones registrados sin eliminar casos |
| Diff y auto-revisión | PASS; git diff --check y revisión acotada a #218 |
| CI remoto | PENDIENTE publicación/ejecución; no se infiere PASS |
| Aceptación externa/humana | NO-GO: carga representativa/baseline acordado, recibos proveedores, lector/zoom nativo/axe incompleto/cancha y aceptación operacional MIG22 |

[Seguro] FAIL esperados en backend/staging corresponden a fallos inyectados que sus runners verifican junto con cleanup/rollback; no se cuentan como PASS aislados de producto. Las84 omisiones de Vitest Next corresponden a integraciones opt-in existentes ejecutadas en backend con0 omitidas.

[Seguro] Capturas revisadas de la pasada Vite completa30/30 de58,0s: [nómina375](evidence/members-375.png) y [nómina1440](evidence/members-1440.png), con campos/SVG/imágenes enmascarados y nombres sintéticos. Acreditan esos estados, sin reemplazar la matriz de permisos/dominio ni la aceptación humana.


[Seguro] Auto-revisión acotada al diff: se corrigieron landmarks duplicados en nómina multirol, feedback perdido/duplicado al revalidar consentimiento, retorno con UUID contextual validado y paridad de fecha/semáforo en pupilos. La revisión visual restauró la variante terciaria por defecto y clases de ActionLink existentes. Las pruebas sincronizan navegación con la confirmación real del guardado; las capturas esperan el título cargado, sin acreditar skeleton como evidencia del flujo. No se eliminaron casos ni reglas axe para obtener verde.

[Seguro] Build/tipos/control browser, Vite 38/38 y lint se repitieron después del último ajuste visual. Artefacto browser PASS (157 módulos); aviso no bloqueante de chunk principal 633 kB (190 kB gzip), sin alterar presupuestos del proyecto. [Manifiesto SHA256](evidence/source-manifest.json) registra los 29 archivos de implementación/pruebas/configuración verificados; no atribuye las corridas al futuro SHA del commit.


[Seguro] Corridas previas se conservan como límites de la evidencia: los cinco casos iniciales tuvieron tres fallos (landmark duplicado, feedback retirado y preparación sintética con expires_at anterior a created_at), corregidos y repetidos 5/5. Al ampliar a seis, se corrigió sincronización de guardado y status duplicado; repetición acotada 6/6. Una corrida completa posterior tuvo WEB-06 6/6 y un timeout de aviso recovery en `access.spec.ts:182` (29/30). Esa prueba coincide byte por byte con la base, pero esto no demuestra la causa del fallo; no se modificó ni se atribuye una reparación de recovery a #218.


[Seguro] Diagnóstico del fallo de preview en la tercera matriz: la nueva aserción HTTP devolvió 429 `rate_limit`. La RPC existente limita preview/accept a 10 intentos por IP/hora; los escenarios independientes de acceso y WEB-06 compartían la IP del fixture y agotaban ese bucket. La preparación de cada escenario WEB-06 restablece exclusivamente sus claves loopback derivadas de la configuración sintética en runtime. Dentro del escenario se mantienen límites reales y replay. No se cambian RPC, cuotas ni rate limits del producto.
