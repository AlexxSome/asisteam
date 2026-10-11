# WEB-05 · Grupos, navegación, dashboard y perfil (#217)

[Seguro] Base `8ed9359241430a446f2c7a53a002e2a4231f7739` de `origin/develop`, 11-10-2026; rama `codex/217-grupos-dashboard-perfil-vite`. WEB-04 (#216) está integrado. Descubrimiento de código exclusivamente graphify actualizado sobre esa base. El SHA de entrega se obtiene del commit/PR; las evidencias identifican la base y el árbol verificado. Producción continúa NO-GO.

## Resultado y límites de alcance

[Seguro] La SPA paralela incorpora `/groups`, `/groups/new`, `/groups/:groupId`, `/groups/:groupId/settings`, `/groups/:groupId/settings/visibility`, `/profile` y `/profile/birthdate-requests`. Conserva URLs, roles unidos por grupo ACTIVE, selector, preferencia por cuenta/dispositivo, agenda global paginada y tiempos de Chile. La cookie de grupo guarda exclusivamente una preferencia; restaurarla vuelve a comprobar pertenencia en Nest.

[Seguro] AppShell, GroupForm, ProfileForm, VisibilityForm, revisión de edad, autorización de imagen y primer uso mantienen su presentación/estados existentes con adaptadores React Router. El formulario de grupo usa controles React y el mismo schema core, sin dependencias nuevas. Sidebar, drawer modal, Escape, foco de retorno y enlace de salto se conservan. Router maneja fragmentos de agenda/soporte y selección activa con back/forward. El borrador de perfil/foto permanece en memoria, con bloqueo Router/beforeunload y descarte independiente.

[Seguro] ADMIN recibe capacidad, aprobaciones y gestión; COACH mantiene agenda/acciones operativas sin controles de gestión; ATHLETE recibe siempre su resumen mensual; GUARDIAN recibe tareas de sus pupilos, contando todas las páginas. Los perfiles multirol combinan las secciones autorizadas. El dashboard pide el DTO de historial propio y solo devuelve período/totales a su vista: sin filas/notas de asistencia en home. No construye indicadores ni métricas nuevos de #173–#175; esos issues y #179 siguen abiertos.

[Seguro] Perfil conserva edición, solicitud menor→adulto pendiente y aprobación ADMIN por grupo, permiso de imagen GUARDIAN, recuperación de contraseña, vinculación social explícita, privacidad/soporte y logout de este dispositivo. Todos los writes usan el SDK cookie/CSRF y los handlers/RPC existentes; no se cambian SQL, RLS, menores, consentimientos, cupos ni contratos HTTP.

[Seguro] Vite entrega avatares mediante `getAvatar` del SDK (`/web-api/v1/avatars/:ownerId/:fileName`): Nest verifica `can_read_avatar` y lee S3 privado. La SPA transforma el DTO MIME/bytes en una object URL local y cancela/revoca al cambiar la imagen o desmontar la sesión. No publica buckets, URLs S3, tokens ni usa el Route Handler Next. La referencia canónica `/profile/avatar/...` almacenada se mantiene para compatibilidad con Next durante la coexistencia. Error/imagen ajena muestra fallback sin descargar una URL arbitraria.

[Seguro] Cambio de ruta/grupo desmonta el DTO anterior, cancela loaders y vuelve a verificar autorización; cambio/restauración de sesión conserva el reset del árbol Router de WEB-03/04. No hay caché global de reportes ni cola offline. Los enlaces a integrantes/actividades/reportes/billing/anuncios/QR mantienen sus rutas: su implementación SPA pertenece a WEB-06/07/08, y Next continúa disponible durante esta migración. Este issue no acredita la paridad completa de las 39 páginas ni retira Next.

## Verificación reproducible

```sh
corepack pnpm --filter @asisteam/web-vite typecheck
corepack pnpm --filter @asisteam/web-vite build
corepack pnpm --filter @asisteam/web-vite test
corepack pnpm lint
# Docker local disponible; imagen sintética S3 usada por los runners existentes:
docker build -f scripts/migration/storage/Dockerfile.fixture -t asisteam-storage-fixture:161 .
corepack pnpm --filter @asisteam/web-vite test:e2e
corepack pnpm ci:checks
corepack pnpm ci:backend
corepack pnpm ci:staging
corepack pnpm ci:extended
corepack pnpm ci:qualification
git diff --check
```

[Seguro] Node24.16.0 y pnpm10.33.2 canónicos mediante Corepack. El pnpm global de este host es 11.1.1: los runners que invocan `pnpm` requieren un PATH que seleccione Corepack, sin modificar los scripts del repositorio. E2E usa PostgreSQL17 y MinIO propios, perfiles/grupos únicos sintéticos, cookies reales, Nest y CSRF. No usa cuentas/menores reales ni servicios externos. Los fixtures preservan triggers y consentimiento R1; limpieza exclusivamente de contenedores propios. Los escenarios nuevos restablecen antes de comenzar únicamente el bucket de login de la IP loopback del fixture mediante la RPC existente: así no acumulan el límite de 30 logins entre escenarios independientes. Durante cada escenario se mantienen los límites IP/email y los intentos fallidos por cuenta.

| Check | Resultado del árbol del issue |
| --- | --- |
| Vite typecheck/build/control de artefacto | PASS después de correcciones de auto-revisión; artefacto browser sin módulos servidor |
| Vite unitarias | 18 PASS: 8 existentes y 10 de roles/DTOs/negativos/paginación/red |
| Lint | PASS después de auto-revisión |
| Docker fixture build | CANCELADO, exit130 tras atasco al cargar metadata; no se acredita build nuevo ni se determina su causa externa |
| Docker fixture existente | PASS inspect: `asisteam-storage-fixture:161`, digest `sha256:ad6c1d7468343d28ca1e4275d86c361b3444097e8814cab5eba5ffd5eab40962`, creado 08-10-2026; fuente sin cambios en #217 |
| E2E Vite completo | PASS: tercera corrida 24/24, exit0, 40.1 s; acceso/sesión y seis nuevos escenarios WEB-05. Corridas previas 21/3 y 23/1 FAIL corregidas sin eliminar casos ni reglas axe; aislamiento del bucket IP del fixture antes de cada escenario nuevo |
| ci:checks | PASS: runner/lint/contratos/tipos/build/Next HTTP/retiro/unidades Worker/API/SDK; core 150, Next 961 (84 omitidas existentes), Vite 18 |
| ci:backend | CANCELADO exit130: api-session-build/worker-build PASS; atasco sin salida en Docker build de fixture. Resto del gate no ejecutado en #217 |
| ci:staging | CANCELADO exit130: synthetic-external-secrets PASS; atasco sin salida durante api-container-build. Resto del gate no acreditado |
| ci:extended | CANCELADO exit130: chromium-install/nest-domain-build PASS; atasco sin salida en private-storage-fixture-build. Matriz completa Next/transportes del gate no acreditada |
| ci:qualification | FAIL exit1; technicalStatus FAIL y acceptance NO-GO. Checks PASS; backend/staging/extended FAIL por evidencia incompleta/no vigente. Carga y aceptación externa no acreditadas |
| Diff/auto-revisión | PASS; se corrigieron límites main, feedback/revalidación, proveedor indisponible y navegación por fragmentos/historial; correcciones pertinentes verificadas en la tercera corrida real |
| CI remoto | PENDIENTE publicación/ejecución; no se infiere PASS |
| Lector humano, zoom nativo/cancha, proveedor cloud | OMITIDOS; mantienen aceptación externa #209 pendiente |

[Seguro] [JSON ci:checks](evidence/checks.json) corresponde a ejecución coordinada fuera del sandbox con pnpm10.33.2; los ajustes finales de límites HTML/proveedores fueron verificados además con build, lint y unitarias Vite. La base identificada en JSON precede al commit de entrega, ejecutado sobre el árbol del issue. El build emite aviso no bloqueante de chunk principal de 622 kB (187 kB gzip); el control de importaciones browser permanece PASS.

[Seguro] [Resultado Playwright](evidence/playwright-last-run.json) conserva el resultado del último runner; [resumen de ejecución](evidence/execution-summary.json) registra sus 24 casos y los gates parciales observados. [Qualification original](evidence/qualification.json) conserva sin alterar sourceCommit/checkoutCommit de la base y el resultado FAIL. Sus contadores backend 84, staging 0 y extended 66 provienen de artefactos disponibles al reconciliar: no acreditan ejecución completa de esos gates para #217. La ejecución ocurrió con los cambios del issue en el árbol, antes del commit. Los bloqueos de carga/baseline HTTP, recibos de proveedor, accesibilidad humana y aceptación operacional MIG22 continúan. El PR se entrega como borrador; los gates required y la aceptación externa siguen pendientes.

[Seguro] Los seis recorridos nuevos cubren cinco roles/multirol, grupos ajenos/inactivos, controles de gestión, recarga, crear/editar/código/toggles, selector, drawer/teclado, borrador, revisión de edad, permiso de menor, avatar propio/ajeno/S3, fallo de red/reintento y reflow 320/375/768/1024/1440 con axe. La matriz automática no reemplaza la pasada humana de lector/zoom ni la aceptación operacional.

[Seguro] Capturas revisadas del viewport 375 px en la tercera corrida 24/24 PASS: [inicio del grupo](evidence/group-375.png) y [perfil con campos enmascarados](evidence/profile-375.png). Documentan estos estados sintéticos; no acreditan por sí solas los demás recorridos ni la aceptación humana.
