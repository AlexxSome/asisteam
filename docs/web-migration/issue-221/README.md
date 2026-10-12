# WEB-09 · Infraestructura estática y paridad (#221)

[Seguro] Base `e63e05cb9adfc11e209ebd23031b973e9afeb038` de `origin/develop`; fecha 2026-10-11, Node24.16.0/pnpm10.33.2. WEB-04…08 están integrados. El servidor de entrega ahora sirve el artefacto Vite y delega sesión, callbacks, datos e imágenes en Nest. Next y sus suites permanecen hasta WEB-10 (#222). Producción continúa **NO-GO**; esta entrega no cambia proveedores ni apaga receptores.

## Artefacto y mismo origen

[Seguro] `pnpm --filter @asisteam/web-vite build` produce `dist/release.json`: SHA de fuente, protocolo de sesión `nest-opaque-v1`, hashes SHA-256/tamaños de cada archivo, presupuesto medido y allowlist extraída del AST de `src/router.tsx`. No existe un segundo registro manual de rutas. Turbo reconstruye este artefacto para conservar procedencia por SHA; las dependencias siguen cacheadas. El servidor verifica manifiesto y archivos antes de admitir tráfico, y mantiene en memoria los bytes verificados.

| Destino | Respuesta y política |
|---|---|
| `/api/*`, `/web-api/*` | Nest, conserva status/JSON/Set-Cookie. Bearer de `/api/v1` preservado; headers de identidad/proxy/invitaciones del browser eliminados. IP reemplazada por la del socket. `private, no-store`. |
| `/auth/callback`, Google/Apple | Nest, incluyendo POST form de Apple. Origin/Host/state/nonce/PKCE/CSRF y consentimiento siguen comprobados por Nest. `no-store`, `no-referrer`, `noindex`. |
| `/profile/avatar/:owner/:file` | Nest/S3 privado con autorización. Binario/error real; no cae en SPA. `private, no-store`. |
| Navegación GET/HEAD HTML a rutas Router conocidas | Shell 200, lang/es y metadatos base, `private, no-store`; el loader conserva HTTP real de Nest y estado visible. Peticiones JSON/cors no reciben fallback HTML. |
| Legal versionado | HTML canónico legible sin JS, público/revalidable, ETag y 304. Sin sesión/Set-Cookie. |
| Assets presentes con hash | SHA verificado, gzip, ETag por representación y `public,max-age=31536000,immutable`. Solo assets versionados admiten esta caché. |
| Asset/route ausentes, sourcemaps o manifiestos internos | HTTP404 sin shell. Traversal/separadores codificados reciben400. Métodos de UI distintos de GET/HEAD reciben405. |

[Seguro] CSP limita scripts/conexiones/fonts al mismo origen, deniega objetos/frames/base y permite únicamente imágenes locales/blob/data. `style-src 'unsafe-inline'` conserva estilos inline de los componentes y del aviso existente; no se permite script inline/eval. Se añaden nosniff, no-referrer, frame DENY y Permissions-Policy. HSTS se activa solo con `ASISTEAM_STATIC_HTTPS=1` tras configurar HTTPS real. No hay access logs ni URLs/cookies/bodies en diagnósticos del gateway; Nest mantiene SafeLogger. La URL destino es fija validada y nunca se toma de Host/Forwarded/query.

## Desarrollo y ensayo operacional

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter @asisteam/api --filter @asisteam/web-vite
# Nest debe arrancar con sus roles/secretos externos según el runbook vigente.
ASISTEAM_VITE_API_TARGET=http://127.0.0.1:3001 pnpm --filter @asisteam/web-vite start
# Solo para edición local con HMR, no entrega productiva:
pnpm --filter @asisteam/web-vite dev
# Ensayo autocontenido, sin proveedores ni datos reales:
pnpm --filter @asisteam/web-vite test:e2e
pnpm ci:checks
pnpm ci:backend
node scripts/ci/probe.mjs
pnpm ci:staging
pnpm ci:extended
pnpm ci:qualification
```

[Seguro] Para construir la imagen se pasa `--build-arg SOURCE_COMMIT=$(git rev-parse HEAD)` a `docker build -f apps/web-vite/Dockerfile`. El runtime contiene Node24, servidor y dist; no contiene node_modules/Next/pnpm/credenciales. `.dockerignore` excluye además fixtures `.qa` y reportes temporales `.ci-*`/`.ci-results`, para que ni el contexto de build transporte sesiones/PII sintéticas. `ci:staging` arranca imágenes inmutables en la red propia `asisteam-staging-synthetic_gateway`, con rootfs read-only, UID1000, sin capabilities/escalamiento, puerto loopback efímero y upstream Nest. Comprueba mismo origen/status/procedencia, actualiza a otro digest y restaura el inicial; elimina sus contenedores y el proyecto staging propio. Los dos digests Docker usan el mismo bundle con etiqueta sintética distinta; la prueba browser siguiente cubre además cambio efectivo de HTML/hash de entry.

[Seguro] Para actualizar el frontend, preparar/validar el candidato antes de cambiar el destino. Mantener el directorio de assets de la release previa con `ASISTEAM_STATIC_PREVIOUS=/ruta/previa/dist` (o varias separadas por coma); solo se sirven sus assets con hash, nunca su HTML/metadata/datos. El shell de la release actual siempre usa `no-store`. El destino de rollback es una imagen/directorio inmutable validado; volver a él no revierte DB ni credenciales. Configurar mount read-only del artefacto previo cuando se use Docker. Retener assets previos mientras existan pestañas antiguas, sujeto a la política operacional de #209.

[Seguro] El harness browser crea una release candidata sintética con entry modificado y nuevo hash, conserva assets anteriores, alterna selección únicamente mediante archivo privado del fixture y mantiene el mismo Nest/PostgreSQL. Comprueba recarga con ambas releases, cookie opaca HttpOnly estable, y que volver al frontend previo después del logout no revive sesión ni DTOs. No existe endpoint público de selección de release. Regresar al runtime Next requeriría la reautenticación explícita documentada en WEB-02; no se importan familias/tokens revocados.

## Paridad y evidencia

[Seguro] La [matriz comparativa](paridad.md) traza las39 páginas históricas contra rutas/componentes Vite y suites vigentes. La prueba nueva comprueba40 destinos de navegación (39 páginas+salida Router); no cuenta salida como página nueva ni confunde shell200 con autorización. `ci:extended` conserva47 recorridos Next, toda la matriz Vite, y el fallo de transporte Next; Vite utiliza el build estático con CSP/gzip/proxy real en lugar de HMR.

[Seguro] `ci:checks` añade la suite HTTP de infraestructura sin sustituir unitarias/contratos/builds. `ci:backend` conserva40 suites/1646 aserciones SQL, guards/métrica,84 integraciones y Auth/Worker/backup/PITR. Staging añade frontend al ensayo existente. Qualification ahora exige evidencia también de infraestructura, rollback frontend y las dos matrices browser/fallos, rechazando omisiones/evidencia incompleta. El workflow PR descarga los cuatro reportes sanitizados y ejecuta qualification antes de required. La protección administrativa de `develop` permanece pendiente: GitHub respondió `Branch not protected` el11-10-2026.

[Seguro] El [baseline de peso](bundle-baseline.json), construido desde e63e05c, registra hashes y cierre de imports por módulo: carga inicial de 199.118 bytes gzip y adicional máximo de 19.628 bytes en integrantes. `test:bundle` compara los 38 módulos y la carga inicial, valida la igualdad de medidas/manifiesto y escribe `.ci-results/vite-bundle.json`. El usuario aprobó «Perfecto usa lo recomendado» el **2026-10-12 America/Santiago**, respecto de **220.000 bytes gzip iniciales y 25.000 bytes gzip adicionales por módulo lazy**. La [configuración de presupuesto](../../../apps/web-vite/bundle-budget.json) registra esa aprobación y ambos máximos; el checker falla si se supera cualquiera. Sin aprobación válida mantendría `PENDING_AGREEMENT`, separado del resultado de medición. Las medidas actuales cumplen ambos límites con delta cero frente al baseline. Los timings locales sintéticos no son aceptación de carga de un proveedor real.

[Seguro] La revisión de bundle conserva la barrera transitiva browser/servidor, allowlist pública `VITE_APP_NAME`, rechazo de credenciales/configuración privada y ausencia de `.map`. `browser-modules.json`, `.vite/manifest.json` y `release.json` permanecen internos aunque sean útiles para QA; el servidor no los publica. Los reportes contienen únicamente SHA/check/conteos/duración/medidas/hash, nunca tokens/claims/cookies/PII. Las pruebas usan fixtures sintéticos y proveedores interceptados; no se comparten diagnósticos crudos.

## Coordinación y límites

[Seguro] #181 conserva lector humano, zoom nativo200%, axe incompleto y asistencia20personas/<60s a una mano; responsive375/teclado/axe automático no los sustituye. #209 conserva provisión/HTTPS, configuración pública de orígenes/callbacks/URLs MP/Resend/S3, receipts externos, aceptación legal y operacional; esta preparación no los cierra. Los límites del doc05 (sin CSV/offline/móvil ni páginas nuevas de producto) permanecen.

[Seguro] Esta entrega no modifica SQL/RLS/RPC, tipos DB, contratos públicos ni reglas de menores/métricas. La auto-revisión se limita al diff de #221; se comprueban privacidad del proxy/artefacto, allowlist común, cache/no-store, errores reales, cookies opacas y restauración sin datos/tokens. El commit técnico `150936b8c72556c2b56d3f218e2538bd412efb4e` aprobó los cinco gates: 150 core / 961 web / 125 Vite, 1.646 SQL en 40 suites, 84 integraciones y 89 recorridos browser (47 Next + 41 Vite + 1 transporte), sin omisiones de integración/QA. Esa evidencia precede a la aprobación del presupuesto y **no se presenta como evidencia del SHA que incorpora la aprobación**. Los reportes sanitizados `.ci-results/{checks,backend,staging,extended,qualification,vite-bundle}.json` identifican el SHA de la nueva corrida completa antes de publicar. El acuerdo del presupuesto queda resuelto; la aceptación humana/proveedores/operación externa mantiene NO-GO en #181/#209.
