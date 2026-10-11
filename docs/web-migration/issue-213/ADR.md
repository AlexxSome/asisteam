# ADR WEB-01 — web React y sesión Nest

[Seguro] Estado: **decisión de arquitectura objetivo registrada por #213, implementación pendiente #214–222**. Fecha de revisión: 2026-10-10. Baseline: `db1396d490c481209a81a67fde0104c4fbfe248c`. El runtime entregado sigue Next16; este ADR no acredita migración, paridad ni despliegue. La autorización de #212/#213 se limita a sustituir la tecnología de las capacidades existentes; #170 mantiene su contrato visual y #209 sus gates operacionales.

## Decisión y versiones

[Seguro] Se adopta React19 + TypeScript + Vite con **React Router Data Mode** (`createBrowserRouter`, `RouterProvider`), build estático y división por módulos mediante lazy imports. No se incorpora servidor SSR de React Router ni Framework Mode. Nest/Node24 sirve la sesión web y las autoridades de servidor; PostgreSQL17/RLS/RPC, Worker, S3 privado, core y contratos generados se preservan. [Instalación oficial Data Mode](https://reactrouter.com/7.18.4/start/data/installation).

| Herramienta objetivo | Versión fijada para WEB-03 | Evidencia / condición |
|---|---|---|
| Node / pnpm | 24.16.0 / 10.33.2 | Engines y packageManager vigentes; toolchain local verificada |
| React / react-dom | 19.2.7 / 19.2.7 | Mantener pareja exacta del lockfile actual; no cambio de major |
| TypeScript | 5.9.3 | Mantener resolución actual del lockfile |
| Vite | 7.3.7 | npm engines `^20.19.0 || >=22.12.0`: admite Node24 |
| @vitejs/plugin-react | 5.2.0 | npm engines iguales a Vite; peer permite Vite7 |
| react-router | 7.18.4 | npm engines>=20; peers React/react-dom>=18; Data Mode |
| Tailwind / formularios / Zod | Resoluciones actuales del lockfile | Mantener tokens/CSS, shadcn, react-hook-form/resolvers y schemas; WEB-03 verifica integración CSS |

[Seguro] Los metadatos exactos de npm están en [versions.json](versions.json); se elige la línea7 de Vite/Router para limitar cambios de major y preservar la base de herramientas. WEB-03 debe instalar versiones exactas con pnpm, versionar lockfile y demostrar build/typecheck/unidades en Node24; la compatibilidad declarada no equivale a una instalación probada de la SPA. Una actualización posterior necesita repetir esos checks, no `latest` implícito. [Requisito Node de Vite](https://vite.dev/guide/).

## Responsabilidades y prefijos

[Seguro] El browser contiene componentes, navegación, formularios, validación de UX con schemas core puros y DTOs. Nest contiene credenciales de sesión, cookies, CSRF, refresh/OAuth, proxies con IP confiable, S3/Resend/MP, SQL y autorización. El bundle no importa `server-only`, módulos Node, config privada ni servicios de apps/api; WEB-03/09 verifica también dependencias transitivas, sourcemaps y variables. `VITE_*` se trata como información pública: solo configuración pública, ningún token o secreto.

| Destino HTTP objetivo | Autoridad | Enrutamiento y coexistencia |
|---|---|---|
| `/api/v1/*` | Nest, contrato Bearer existente | Mantener clientes actuales; no resolver como SPA ni publicar respuestas Auth con tokens vía cookies |
| `/web-api/v1/*` | Nest, adaptador web explícito | Prefijo nuevo de WEB-02; operaciones permitidas con cookies+CSRF, contrato web generado, sin proxy abierto |
| `/auth/callback` y `/auth/callback/:provider` | Nest | URLs compatibles; GET genérico/Google y POST Apple; antes del fallback |
| `/profile/avatar/:ownerId/:fileName` | Nest | Entrega binaria por cookie en URL existente; antes del fallback |
| `/assets/*`, favicon y assets públicos | Proxy estático | Archivos reales; asset ausente404, no index.html |
| `/legal/2026-09-21` | HTML estático de publicación | Mismo aviso versionado, legible sin JS; también componente al navegar desde SPA |
| 38 rutas restantes / comodín | React Router + proxy | HTML shell para rutas reconocidas; desconocida404 de proxy y estado UI correspondiente |

[Seguro] `/web-api/v1` concreta el criterio del issue de evitar colisiones: ninguna de las 39 rutas coincide con `/api/v1` o `/web-api`. La selección de prefijo es una decisión de este ADR, aún no un endpoint implementado. Para dominio el adaptador conserva método/sufijo de `/api/v1`; Auth web ofrece session/login/register/refresh/logout/recovery/reset/password, OAuth start/link y flujo dirigido de invitations con DTO sin credenciales. Session devuelve solo identidad/proyección mínima y estado de consentimiento; jamás access/refresh/transaction. El SDK actual transmite Bearer: WEB-03 agrega cliente web con `credentials: same-origin`, timeout/AbortSignal y errores uniformes. No copiar el SDK privado de Next al navegador.

[Seguro] API/frontend comparten **un origen** HTTPS mediante proxy en desarrollo/staging/producción. Vite dev proxy cubre los mismos prefijos y callbacks; Vite preview no es el servidor productivo. Proxy elimina headers de Auth/invitaciones enviados por el cliente y reescribe IP según hops confiables. Host/Forwarded no escogen el destino del redirect; orígenes externos fijados/allowlist y transportes privados. CORS no sustituye CSRF ni autorización.

## Sesión web y seguridad

[Seguro] WEB-02 conserva access15min y refresh rotatorio30d actuales como autoridades internas. WEB-02 debe acreditar compatibilidad de las cookies/familias existentes al cambiar de servidor, sin crear un segundo emisor; el rollback conserva familias o fuerza reautenticación explícita sin restaurar tokens revocados. Cookies `asisteam-access`/`asisteam-refresh` host-only, HttpOnly, Secure en HTTPS, SameSite=Lax y Path=/; renovación no expone tokens al JS. Refresh se coordina por familia entre solicitudes paralelas; una deduplicación en memoria por instancia, como hoy en Next, requiere prueba de múltiples instancias. El replay real revoca la familia. Timeout/fallo después de commit tiene respuesta explícita; no reintentar escrituras indiscriminadamente.

[Seguro] Todas las mutaciones web, incluidas login/logout y registros públicos, validan Origin exacto y token CSRF sincronizado ligado a la sesión/transacción (obtenido por endpoint web, memoria de browser; no token de autenticación). Método GET nunca muta/consume invitación/recovery. Rechazar CSRF ausente/incorrecto, origen ajeno/ausente en llamadas browser y Content-Type inesperado. Callback OAuth es una excepción específica: state/nonce/PKCE, transacción ligada al browser y uso único; Apple form_post admite cookie transitoria SameSite=None+Secure con path/provider y duración10min, cuerpo≤16KiB, parámetros únicos y allowlist de host. La excepción no abre otras mutaciones.

[Seguro] Nest mantiene anti-enumeración, rate limits durables por IP/email/grupo, familia viva antes de SQL, consentimiento efectivo y proyección V5 en servidor. Roles por grupo, V1–V6, R1, MANAGED sin login y guardián de menores se prueban por API; un guard de React no concede permisos. Los servicios de Auth/invitaciones reutilizan ledger/secretos internos sin exigir al browser headers secretos. Cualquier aceptación pendiente redirige a `/accept-terms?return_to=…` con destino relativo permitido; linking nunca fusiona por email ni equivale a consentimiento.

## Consultas, invalidación y formularios

[Seguro] **React Router es el único dueño de consultas de la web objetivo.** Loaders leen mediante SDK web, actions/fetchers escriben; la respuesta confirmada activa revalidación de loaders dependientes. No se incorpora TanStack Query5 en esta migración: AGENTS lo enumera, pero el manifest/lockfile de la web baseline no lo instala y el issue exige evitar dos cachés divergentes. Esta decisión canónica en doc06 sustituye esa mención para la web objetivo; no modifica otro cliente.

[Seguro] No guardar copia de DTOs de loader en un segundo almacén; React local conserva únicamente borrador/estado de edición. Query strings son fuente de filtros/período/paginación/grupo; cancelar fetches obsoletos con AbortSignal. `useNavigation`/fetcher exponen processing y errores. Mutaciones de asistencia revalidan asistencia, actividad, historial, reportes e inicio de ese grupo; cambios de integrantes/consentimientos revalidan nómina/capacidad/pendientes/pupilos; settings invalida grupo/toggles/reporte; perfil/avatar afecta shell y vistas autorizadas; anuncios/billing revalidan sus lecturas. Se evita `shouldRevalidate` restrictivo hasta acreditar dependencias completas. [Modelo Router](https://reactrouter.com/7.18.4/explanation/state-management).

[Seguro] Logout bloquea navegación privada, revoca la familia en Nest, limpia cookies y destruye estado/DTOs/borradores del router; probar Atrás/BFCache, otra pestaña y cuenta distinta. Cambio de grupo desmonta borradores con confirmación y revalida contexto, sin mezclar métricas entre grupos. `useBlocker`+beforeunload reemplaza el guard manual de historia para edición; sin almacenamiento offline, cola ni sincronización automática.

## Rutas públicas, SEO, navegación y diferencias de SSR

[Seguro] Se acepta perder HTML personalizado SSR, streaming RSC y funcionamiento de formularios privados sin JS. La primera navegación puede servir200 del shell aun cuando un loader termine en401/403/404/503; React muestra el estado y Nest devuelve el HTTP real. No afirmar que `throw Response` en un loader browser cambia el código de la respuesta HTML. API/handlers/assets desconocidos mantienen HTTP real; proxy devuelve404 a rutas de UI desconocidas por allowlist generada del mismo mapa de rutas, no fallback universal. Guardado de menores/asistencia necesita la misma autorización aunque el shell se pueda descargar sin sesión.

[Seguro] Público: login/registro/recuperación y aviso legal. Invitación/recovery/check-in pueden abrir sin sesión, pero son sensibles/noindex; `/accept-terms` requiere sesión aunque la exclusión de middleware sea pública. Index.html conserva lang=es, viewport, description y título base. React19 establece title/meta por ruta; rutas privadas y enlaces sensibles llevan noindex/nofollow y Referrer-Policy=no-referrer desde proxy además del DOM. No se persiste nombre/PII en metadata. [Metadatos React19](https://react.dev/reference/react-dom/components/title).

[Seguro] Se acepta que bots sin JS reciban metadatos genéricos de acceso; no se requiere posicionar vistas privadas ni previews sociales de invitaciones. El aviso legal permanece como HTML versionado estático con metadatos propios y misma URL, legible sin JS; automatizar igualdad del texto con el contenido canónico. Un crawler que necesita HTTP de un recurso privado consulta API, no interpreta200 del shell como permiso. WEB-09 prueba SEO/robots/códigos y recoge esa diferencia de SSR explícitamente.

[Seguro] Shell/HTML y endpoints de sesión/datos/callbacks/avatares: `Cache-Control: private, no-store`; assets con hash: public,max-age=31536000,immutable; legal público versionado: cache pública con ETag/revalidación, nunca Set-Cookie. Sin service worker ni cache offline. No cachear respuestas por groupId sin actor. Cabeceras de seguridad (nosniff, referrer, robots y CSP compatible) corresponden a Nest/proxy; revisar excepciones OAuth. Toda ruta preserve URLs/períodos/anchors, scroll/foco, drawer y estados del sistema visual #170.

[Seguro] Proxy/Nest/telemetría registran template de ruta/status/duración/request_id, nunca pathname de invitación, query completa, hash QR, Cookie/Authorization, códigos OAuth, passwords ni PII. Desactivar logs de bodies/argumentos y redactar Sentry/breadcrumbs/replays. Leer token de recovery en memoria, limpiar URL tras éxito; QR lee fragmento y lo elimina inmediatamente, conserva contexto validado solo durante autenticación. Invite/recovery GET no consume tokens. No hay analytics de enlaces sensibles.

## Cierre y consecuencias

[Seguro] WEB-01 solo entrega inventario/decisión/matriz; WEB-02–10 deben demostrar cada reemplazo de [operaciones](operaciones.md) y cada recorrido de [rutas](rutas.md). Migración incremental paralela, URL de prueba separada y selección de frontend por entorno; no balancear dos autoridades de sesión ni dos escritores. WEB-09 ensaya proxy/callbacks/links antiguos, rollback al artefacto anterior sin rebobinar datos y sin publicar sesiones cruzadas. WEB-10 retira Next solo tras paridad y cuatro gates required+qualification. Producción continúa NO-GO; #100/#170/#209 y aceptación externa no cierran por este ADR.

## Enmienda WEB-02 (#214): sesión opaca y transición explícita

[Seguro] La [implementación opt-in de WEB-02](../issue-214/README.md) reemplaza el detalle de las dos cookies de tokens de este ADR por `asisteam-web-session` opaca HttpOnly/Secure/Lax/Path=/ y credenciales cifradas solo en Nest/PostgreSQL. Access15min/refresh30d y replay canónico siguen vigentes; el lock de fila y la sustitución en la misma transacción coordinan distintas instancias/pestañas sin reemitir credenciales en respuestas de refresh. El cambio desde cookies Next exige reautenticación explícita, también en rollback; no importa/restaura familias revocadas. El resto del ADR (prefijos, mismo origen, frontend, SQL y NO-GO) se mantiene. Esta enmienda no modifica la evidencia histórica del inventario.
