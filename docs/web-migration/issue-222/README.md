# WEB-10 · Web definitiva y retiro de Next (#222)

[Seguro] La coexistencia no demostraba paridad: este corte promueve React19/Vite7/React Router7 Data Mode a `apps/web`, retira `apps/web-vite` y el runtime Next y conserva las 39 páginas de producto. La [matriz de rutas](rutas.json) enlaza cada destino anterior/actual; `/logout` es una acción técnica adicional. Base `origin/develop@d2f5101c7342a733cfe144ecaa79bce22b317d69`, Node24.16.0/pnpm10.33.2, 2026-10-12 America/Santiago. Producción permanece **NO-GO**.

## Alcance y contratos

[Seguro] Se retiran App Router, Server Actions, middleware, handlers/BFF web, dependencias/configuración/cachés Next y sus mocks/invocaciones. Las notas WEB-01…09/MIG y la [evidencia anterior](historical-evidence/) son antecedentes fechados; las referencias de código antiguo apuntan a sus commits. No se conservan fuentes ejecutables Next como archivo de respaldo dentro del producto.

[Seguro] Router administra loaders/actions/revalidación; el SDK usa cookies/CSRF del mismo origen. Nest conserva sesión opaca, callbacks y autorización SQL. No hay secreto, JWT/refresh, SQL, segundo escritor ni cola offline en el browser. PostgreSQL17/RLS/RPC, Worker, S3 privado, métrica canónica, R1/V1–V6 y COACH/billing/anuncios/QR/OAuth #55–#59 se mantienen. No se añade móvil, CSV ni rediseño pendiente de #170.

[Seguro] HTML de navegación conocida devuelve shell200; API conserva401/403/404/503 y el loader presenta estados seguros. Shell/sesión/datos usan `private,no-store`, assets con hash usan caché immutable, y legal versionado conserva HTML público legible sin JavaScript. Las vistas privadas requieren JavaScript; no existe SSR/RSC ni envío de formularios privados sin JS. La autorización sigue en Nest/RLS incluso si el shell fue descargado.

[Seguro] `/profile/avatar/:owner/:file` continúa como alias binario privado de Nest, fuera del SDK JSON. Comparte lector/autorización/validación S3 con `/api/v1/avatars`, exige sesión opaca y devuelve404 uniforme ante objeto ausente/no visible, origen ajeno o sesión inválida; conserva MIME, checksum/límite, no-store y nosniff. No cambia SQL ni el contrato JSON generado.

## Transferencia y revisión

[Seguro] [coverage.json](coverage.json) enumera **783 plantillas** originales con archivo/línea/hash, matchers, contrato, destinos de prueba/aserción y detalle de mecánicas retiradas. Las **961 expansiones** de la corrida Next anterior no equivalen a unidades funcionales independientes: incluían parametrizaciones y suites de integración. Los recuentos no se usan como prueba de equivalencia. Las84 integraciones originales se ejecutan aparte, sin omisión; las 47 regresiones browser anteriores se trasladan al artefacto estático y se complementan con 41 casos SPA y 1 de transporte.

[Seguro] La revisión distingue cada comportamiento de negocio de cookies bearer/SSR, revalidatePath, listeners manuales de Next y flags `moduleTransport` ya retirados. El inventario tiene 374 plantillas transferidas, 404 reemplazadas y5 históricas, con 0 pendientes. Las cinco plantillas clasificadas históricas son exclusivamente configuración del selector de transporte eliminado; el gate/probe comprueba que ese runtime/fallback no puede reintroducirse. Ninguna regla de negocio/permisos/errores se retira por clasificación de suite. Los guards de borrador se verifican con blocker real de Router, además de las pruebas de formularios/Chromium.

[Seguro] La transferencia corrigió incertidumbre/feedback de anuncios, scrubbing de errores500, validación de DTO/IDs/toggles, root contextual/bienvenida sin grupos, validación y foco accesibles de Auth, vinculación social explícita, alias avatar, recuperación ADMIN→ATHLETE (perfil/cupos), aceptación/salida legal, visibilidad/pegado de contraseña y protección ante submits simultáneos. Auth conserva campos y decisión ante fallo; no revalida la sesión de login/registro cuando la acción devuelve error. No se añade logging para satisfacer una aserción de access logs Next: el gateway no registra URLs/bodies/cookies; Nest mantiene SafeLogger y las pruebas verifican ausencia de datos privados.

[Seguro] La auto-revisión se limita al diff respecto de la base, incluida promoción/eliminaciones, pruebas/helpers, Docker, auditoría y documentación. Se revisaron las fronteras de sesión/CSRF, anti-enumeración, DTOs estrictos, R1/V1–V6, writes únicos/resultados inciertos, contexto/paginación y recuperación. Los fixtures limpian sólo sus cuentas/sesiones/recursos; los buckets de login se reinician únicamente dentro de su base desechable entre escenarios secuenciales. Las pruebas explícitas de rate-limit de backend conservan sus límites y no usan ese helper.

## Desarrollo, build y CI

```sh
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter @asisteam/api --filter @asisteam/web
# Nest se configura con sus roles/secretos externos según docs/07 y su .env.example.
# WEB_AUTH_ENABLED=1; NATIVE_AUTH_WEB_URL=http://localhost:3130 para este origen.
ASISTEAM_VITE_API_TARGET=http://127.0.0.1:3001 pnpm --filter @asisteam/web dev
# Entrega del build estático, sin HMR:
ASISTEAM_VITE_API_TARGET=http://127.0.0.1:3001 pnpm --filter @asisteam/web start
pnpm ci:checks
pnpm ci:backend
node scripts/ci/probe.mjs
pnpm ci:staging
pnpm ci:extended
pnpm ci:qualification
```

[Seguro] Web usa3130 y API3001; `NATIVE_AUTH_WEB_URL` debe coincidir exactamente con el origen visible (localhost y 127.0.0.1 son distintos). El frontend sólo admite `VITE_APP_NAME` público; el target del proxy es configuración del servidor, no secreto del browser. Auth/Invitaciones/DB/S3 permanecen en Nest/Worker. `typecheck` incluye las pruebas; `tsconfig.build.json` compila sólo producción, para que la imagen web no necesite fixtures/dist de API/Worker. CI compila esos módulos y verifica todos los tipos/pruebas.

[Seguro] Los jobs aplicables se leen en `.github/workflows/ci.yml`: checks/backend/staging/extended, después qualification y required. No hay matriz omitida. Backend instala Chromium y ejecuta además el probe. Los cuatro scripts canónicos se reproducen en local con Docker/PostgreSQL17/S3 sintéticos; upload/download de reportes y required son composición de GitHub y no acreditan CI remoto. El workflow periódico extended invoca el mismo gate extendido.

| Job | Comando local | Contenido obligatorio |
|---|---|---|
| checks | `pnpm ci:checks` | lint, contrato generado, todos los tipos/builds, infraestructura/bundle/retirada y unidades core/web/API/Worker/SDK |
| backend | `pnpm ci:backend` + `node scripts/ci/probe.mjs` | 40 suites/1646 SQL, guards/métrica nativos, APIs/Worker/Auth/OAuth/S3/backup/PITR/carga, portabilidad y 84 integraciones |
| staging | `pnpm ci:staging` | imágenes inmutables, roles mínimos, HTTP/privacidad/procedencia, actualización/rollback API+web y limpieza propia |
| extended | `pnpm ci:extended` | 47 regresiones originales +41 SPA +1 fallo/recuperación real; roles, 320–1440, 375,teclado/axe |
| qualification | `pnpm ci:qualification` | evidencia del mismo SHA, todos los required presentes, cero omisiones, carga/bundle medidos y NO-GO externo separado |

[Seguro] Los reportes sanitizados `.ci-results/{checks,backend,staging,extended,qualification,vite-bundle,native-auth-browser,social-auth-browser}.json` registran SHA/check/conteos/tiempos/hash y estado. El resumen final del PR identifica el commit efectivamente validado y hash del artefacto; [verificación](verification.json) conserva el corte local y fingerprint de sus archivos. No se publican diagnósticos crudos, cookies, tokens, URLs de proveedor ni PII.

## Compatibilidad y rollback

[Seguro] El artefacto `dist/release.json` fija `sessionProtocol=nest-opaque-v1`, SHA, hashes/tamaños y 40 destinos técnicos desde el AST Router. El servidor verifica bytes antes de servir. Docker requiere `SOURCE_COMMIT` como build argument y contiene sólo Node24, servidor y dist, sin node_modules/pnpm/Next ni secretos.

[Seguro] Para actualizar o volver al frontend anterior, preparar y verificar primero su imagen/directorio inmutable, mantener Nest/DB/keys y cambiar sólo la selección del frontend. Retener assets con hash previos con `ASISTEAM_STATIC_PREVIOUS=/ruta/previa/dist` (varias rutas separadas por coma; mount read-only en Docker). El HTML actual es no-store. No se rebobinan datos ni familias Auth; el browser comprueba cambio real de entry/hash, cookie opaca viva estable y que rollback después de logout no revive sesión.

[Seguro] Compatibilidad demostrada: artefactos SPA con protocolo1 y el mismo contrato Nest/esquema/keys. No se promete un plazo fijo de rollback: sigue disponible mientras se conserve el artefacto previo y sean compatibles API/esquema/keys/assets. Access15min/refresh30d no define una política de retención de assets ni una ventana operacional. Su duración/responsables/retención deben quedar acordados en #209; los tiempos locales medidos no son RTO de proveedor.

[Seguro] Volver al runtime Next histórico exige un checkout/artefacto independiente de su SHA, configuración completa validada y reautenticación por la diferencia de cookies; esta entrega no reconstruye ni ejecuta Next ni importa tokens/familias revocadas. No arrancar dos escritores ni ejecutar corte real. Si API/esquema dejan de ser compatibles, aplicar el runbook de recuperación de MIG-24 con responsables, snapshot completo y reconciliación; no sobrescribir historia para recuperar frontend.

## Coordinación y límites

[Seguro] #209 conserva provisión/HTTPS, providers/callbacks, receipts Google/Apple/Resend/MP/Expo, observabilidad, RPO/RTO, responsables y aceptación legal/operacional externa. #170/#181 conservan rediseños pendientes, lector humano, zoom nativo200%, axe incompleto y prueba de 20 personas/<60s a una mano. Responsive/axe/fixtures sintéticos no cierran esos gates. No se cierran issues dependientes ni se hace merge/deploy/corte/apagado de receptores. Producción **NO-GO**.
