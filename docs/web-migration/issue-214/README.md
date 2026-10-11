# WEB-02 — Sesión web y callbacks en Nest (#214)

[Seguro] La fachada de sesión funciona en Nest sin runtime Next, bajo activación explícita `WEB_AUTH_ENABLED=1`. El frontend actual continúa en Next; su migración corresponde a WEB-03…10. Producción continúa NO-GO. Base de implementación: `3e09d19` de `origin/develop`; [evidencia de verificación](verification.json).

## Transporte y ciclo de sesión

[Seguro] `/api/v1` mantiene Bearer y Auth nativo rechaza Cookie. `/web-api/v1/auth` publica registro (con login posterior automático), login, sesión actual, CSRF, renovación, logout, recovery/reset/password y OAuth start/link/providers. Registro e invitaciones utilizan las mismas operaciones canónicas; no se copia lógica SQL de identidad, R1, consentimiento ni autorización. El adaptador de dominio solo despacha métodos y rutas enumerados en `httpOperations`, excluyendo Auth nativo, sondas y webhooks. No abre conexiones hacia destinos proporcionados por el cliente.

[Seguro] La cookie host-only `asisteam-web-session` contiene un identificador aleatorio de 256 bits; es HttpOnly, Secure en HTTPS, SameSite=Lax, Path=/ y vence junto a la familia canónica (máximo 30 días, sin extensión deslizante). Access15min y refresh rotatorio se conservan internamente, cifrados con JWE A256GCM y una clave derivada con propósito específico del secreto de Auth. PostgreSQL guarda solo el hash del identificador, referencia a familia, credenciales cifradas y expiración. RLS deny-by-default y ausencia de privilegios directos impiden al rol API/Worker/Auth leer la tabla; únicamente Auth ejecuta la RPC restringida. No hay access/refresh/transaction en JSON web, almacenamiento local ni logs.

[Seguro] Cada uso bloquea la fila de sesión, valida familia/cuenta/autoridad y renueva si al access le quedan ≤60 segundos. Consumo del refresh canónico y reemplazo del bundle cifrado ocurren en **la misma transacción y conexión**; solicitudes de distintas instancias/pestañas ven la versión confirmada. La cookie permanece estable, por lo que una respuesta perdida/tardía de refresh no restaura un token anterior. `/auth/refresh` asegura vigencia y es idempotente mientras el access tenga vida suficiente. No hay tolerancia de replay: la reutilización por Bearer del refresh consumido sigue revocando la familia; las operaciones de dominio revalidan sesión viva en SQL.

[Seguro] Logout funciona con access expirado, revoca la familia y limpia cookies; también es idempotente sin sesión. Password/reset conservan revocación global canónica y limpian el contexto del browser. Sesión inválida/revocada/expirada elimina sus cookies. Reemplazar una sesión de navegador revoca la familia anterior. La rotación del secreto invalida JWT/JWE y exige reautenticación.

## CSRF, origen y proxy

[Seguro] `GET /web-api/v1/auth/csrf` devuelve un nonce CSRF (no credencial de identidad) ligado al hash de la sesión; el contexto autenticado se cifra en cookie HttpOnly `asisteam-web-csrf`, Path=/, Lax, Secure en HTTPS, con 10 minutos de vida. Distintas pestañas reutilizan el contexto vigente. Cada mutación, incluidos login, logout, registro e invitaciones públicas, exige `Origin` exactamente igual a `NATIVE_AUTH_WEB_URL`, `Content-Type: application/json` y `X-CSRF-Token` correcto. Login/logout/callback sustituyen el contexto: obtener nuevamente CSRF antes del siguiente write. La API rechaza `Sec-Fetch-Site: cross-site` en el transporte web ordinario. El middleware reconoce variantes de mayúsculas y rechaza un prefijo reservado no canónico, incluso cuando Express usa matching insensible a mayúsculas.

[Seguro] Se entrega transporte **del mismo origen**, sin CORS con credenciales ni allowlist cross-origin. El proxy sirve frontend y enruta `/web-api/v1/*` y `/auth/callback*` a Nest antes del fallback SPA. Debe preservar Host externo y eliminar Authorization y todos los headers `x-asisteam-*` de solicitudes web. Nest rechaza esos headers si llegan desde el browser y genera los secretos de Auth/invitaciones internamente.

[Seguro] Sin `WEB_TRUSTED_PROXY_IPS`, el límite durable usa la IP del socket e ignora X-Forwarded-For. Para un proxy configurado, declarar IPs exactas del peer (incluida su representación IPv6 si aplica), separadas por coma; ese proxy debe **sobrescribir** X-Forwarded-For con una única IP válida del cliente. Nest rechaza cadenas/múltiples IPs o valores inválidos procedentes del peer confiable. No usar rangos universales ni confiar en el primer valor enviado por el cliente. Se conservan las ventanas SQL/IP/email, bloqueo anti-enumeración y cuotas del dominio, incluido 50 invitaciones/día/grupo.

## OAuth y enlaces dirigidos

[Seguro] Se reutiliza `SocialAuth`: Google usa state/nonce/PKCE S256; Apple usa state/nonce y el flujo confidencial vigente `form_post` sin agregar PKCE a un proveedor que no lo usa. La transacción cifrada solo se entrega como cookie HttpOnly `asisteam-web-oauth`, Path=/auth/callback/:provider, máximo10min; Google Lax, Apple None+Secure. Los starts eliminan cookies de ambos proveedores. GET Google/POST Apple exigen Host configurado, método/provider coherentes, parámetros únicos y cuerpo Apple≤16KiB. La excepción CSRF es exclusiva de estos callbacks; state/nonce/JWS/transacción de un uso verifican el retorno. Vinculación exige sesión propia vigente y nunca fusiona por email.

[Seguro] Callback confirma la sesión, consulta consentimiento en servidor y redirige a welcome/join/check-in/profile según contexto canónico; sin consentimiento deriva a `/accept-terms?return_to=…`. Un destino de retorno solo admite rutas locales permitidas, descartando queries arbitrarias y redirects externos; el QR se mantiene en fragmento. Fallos públicos redirigen a `/login?social_error=1` sin claims/tokens/códigos de proveedor. `/auth/callback` genérico devuelve login y nunca consume invitación/recovery mediante GET.

[Seguro] `/web-api/v1/invitations/preview|accept|register|claim`, solicitudes/revisión de activación y consentimiento usan los mismos controllers/RPC que Bearer. Preview es el POST existente protegido con CSRF, no consume el token. Registro/claim dirigido devuelven el resultado canónico y luego la UI puede llamar `webLogin`; no se introduce otro escritor de invitaciones ni se activa un menor por inferencia. Las URLs de correo `/invitations/:token` y `/reset-password?token=…` permanecen estables. La cuenta MANAGED sigue sin login; el claim menor exige guardianship y ambos consentimientos y conserva membresía/historia.

## Cliente generado

[Seguro] OpenAPI contiene rutas web explícitas con esquema cookie y header CSRF; rutas Bearer/DTO previos se conservan. El SDK añade `web: { csrfToken }`, envía `credentials: same-origin`, conserva validación/timeout/no-store y traduce métodos de dominio al prefijo web. Auth usa métodos `getWebCsrf/getWebSession/webLogin/webRegister/webRefresh/webLogout/webRecovery/webReset/webPassword/webSocial*`; las operaciones nativas que devuelven tokens se rechazan en modo cookie. Mezclar accessToken o secretos de proxy con este modo falla cerrado. El cliente no reintenta escrituras.

```ts
let csrf: string | null = null; // Solo en memoria; no es un token de identidad.
const api = new ApiClient({ origin: window.location.origin,
  web: { csrfToken: async () => csrf } });
csrf = (await api.getWebCsrf()).csrf_token;
await api.webLogin({ body: { email, password } });
csrf = (await api.getWebCsrf()).csrf_token;
const session = await api.getWebSession();
const groups = await api.listMyGroups();
```

## Activación, transición y rollback

1. Aplicar la migración `0003_web_sessions.sql` mediante el rol migrador y ledger vigente; regenerar tipos/catálogo y verificar privilegios. No modificar migraciones históricas.
2. Configurar Auth propio completo, `NATIVE_AUTH_WEB_URL` como origen externo fijo y `WEB_AUTH_ENABLED=1`. Secure es obligatorio en producción/HTTPS; HTTP solo se admite en loopback de desarrollo. Configurar proxy/IP según el apartado anterior. No publicar secretos como variables de frontend.
3. Seleccionar conscientemente el frontend y callbacks por entorno. El nuevo adaptador usa sesión opaca; **las cookies Next `asisteam-access/asisteam-refresh` no se importan automáticamente**. El cambio de servidor requiere nuevo login y las limpia. Esta decisión reemplaza el detalle de cookies del ADR WEB-01 para evitar carreras entre emisores/respuestas; las familias y el contrato Bearer existentes siguen vigentes hasta expiración/revocación.
4. En rollback a Next, exigir nuevo login; no convertir la cookie opaca a refresh, restaurar tokens revocados ni rebobinar PostgreSQL. Desactivar `WEB_AUTH_ENABLED` cierra la fachada/callbacks. Retener migración/ledger y no eliminar historia de dominio.
5. La infraestructura/SPA y la paridad browser final corresponden a WEB-03/09/10. Esta entrega acredita Nest+PostgreSQL con fixtures, no aceptación de proveedores/producción ni uso humano del nuevo frontend.

## Verificación

[Seguro] `node apps/api/test/native-suite.mjs apps/api/test/web-auth.integration.mjs` crea un PostgreSQL17 propio y prueba HTTP real: cookies/CSRF/origen/content type, auto-login, aislamiento, consentimiento, ocho requests en dos Nest/una rotación, pérdida de respuesta sin reemitir cookies, replay nativo/revocación, familia expirada, logout/reset/password, menor/claim y Google/Apple/link/replay/parámetros/Host. OIDC usa respuestas TLS sintéticas con JWT RS256 y JWKS verificadas; correos/Breach API son fixtures. No son intercambios contra cuentas/proveedores reales.

[Seguro] La integración ejecuta además 12 aserciones pgTAP nuevas sobre RLS/privilegios/definer/search_path; las 40 suites/1646 aserciones de dominio y las guards/métrica existentes permanecen. Tests API/SDK cubren el contrato compatible, returns y peer confiable. Los cuatro gates completos y su SHA/resultado se registran en [verification.json](verification.json); un estado omitido o pendiente nunca equivale a PASS.

[Seguro] Sobre `d450e43c895981a972f6e9e14bbbbfba198a1ad0`, `ci:checks`, `ci:backend`, `ci:staging` y `ci:extended` terminaron PASS; `ci:qualification` reconcilió PASS técnico con aceptación NO-GO. Extended ejecutó 47 casos responsive/axe y 1 caso de fallos de transporte, sin omisiones. Las 84 integraciones opt-in omitidas por el runner unitario se ejecutaron en backend sin omisiones. Los fallos de portabilidad/despliegue inyectados acreditan pruebas negativas esperadas. La carga sintética alcanzó 192 requests/8 celdas sin errores, p95 máximo 370,42 ms.

[Seguro] El primer intento de `ci:checks` falló en `next-http-contract` con otros runners Next activos. El rerun secuencial pasó sobre el mismo código. La causa raíz no quedó establecida y no se clasifica como fallo preexistente demostrado. El commit posterior de evidencia solo registra estos informes; el CI remoto valida de manera independiente la cabeza final del PR.
