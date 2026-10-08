# MIG-19 — OAuth Google/Apple y vinculación segura (#163)

[Seguro] Base `develop@482162718516ecc0474a09363a90880c429bf2c2`, rama `codex/163-oauth-identidades-nest`. Fecha 2026-10-08. Google/Apple mantienen el alcance autorizado #59. `public.users.id` e historial se conservan por el par proveedor/subject importado; el email no identifica una cuenta a autenticar ni permite fusionarla.

## Contrato y configuración

[Seguro] Auth=nest incorpora GET `/api/v1/auth/social/providers` y POST `/social/start`, `/social/link`, `/social/callback`, contratos estrictos OpenAPI/SDK. Start/link retornan una URL construida sobre endpoints fijos y una transacción JWE AES-GCM de 10 minutos. Next guarda la transacción únicamente en cookie HttpOnly limitada al callback. Google usa SameSite=Lax y PKCE S256; Apple requiere HTTPS y SameSite=None/Secure para recibir `form_post`. Las cookies de sesión siguen Lax/Secure en producción.

[Seguro] `openid-client@6.8.7` verifica firma JWKS RS256, issuer, audience, tiempos, state y nonce; el código se intercambia en el servidor. Proveedor y callback están fijados, sin URLs recibidas del cliente. Google: `https://accounts.google.com`; Apple: `https://appleid.apple.com`. No se almacenan access/refresh de los proveedores. Un callback sin cookie, con state inválido, proveedor ajeno, claims inválidos o expirado falla sin emitir sesión propia.

[Seguro] Variables privadas API: `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_APPLE_CLIENT_ID` y `OAUTH_APPLE_CLIENT_SECRET`, además de la configuración completa de Auth #162. Cada par habilita su proveedor. Google registra exactamente `https://<web>/auth/callback/google`; Apple Services ID registra `https://<web>/auth/callback/apple`. Apple utiliza un client secret ES256 creado con la clave `.p8` y team/key/service ID fuera del repositorio; renovarlo antes de vencer (máximo seis meses). No usar `NEXT_PUBLIC_` para secretos. `NATIVE_AUTH_WEB_URL`, `ASISTEAM_AUTH_WEB_ORIGIN` y `ASISTEAM_SITE_URL` deben identificar el mismo origen web, y la allowlist del proveedor debe contener el callback exacto de ese entorno. Auth=nest conserva la exigencia de todos los módulos Nest sobre la misma DB.

## Cuenta, consentimiento y vinculación

[Seguro] AUT-07 conserva acceso/registro, contexto de código y QR (cifrado durante OAuth; token solo en fragmento al retornar). El callback nuevo `/auth/callback/[provider]` es un handler, no una página. El callback legacy `/auth/callback` queda solo para Auth=supabase. Mi perfil PRF-01/CFG-01 incorpora «Vincular Google/Apple» desde una sesión propia, con estados de disponibilidad, procesamiento y error compartidos. Las cuentas nuevas recorren aceptación vigente y bienvenida; OAuth no aporta birthdate ni habilita membership ATHLETE o consentimiento de menores.

[Seguro] La vinculación exige autorización explícita desde la sesión del titular y vuelve a verificar la familia vigente al completar. Si una identidad ya pertenece a otro perfil, falla; no se reasigna. Un email registrado sin vínculo exige autenticar la cuenta existente y vincular desde Mi perfil. Los correos privados Apple se conservan como datos del perfil nuevo, sin deducir equivalencias con otro email. MANAGED/INVITED mantienen sus invitaciones y consentimientos canónicos.

## Verificación y evidencia

[Seguro] La migración privada `20261008050000_social_auth.sql` incorpora `auth_social_identities` (PK proveedor/subject) y transacciones OAuth de diez minutos/un uso, RLS deny by default y sin acceso directo de roles cliente/API/Auth. La frontera `auth_operation` conserva el dispatcher de contraseñas #162 como función privada. Las callbacks se serializan por transacción/par proveedor; creación de perfil/vínculo/familia/refresh es atómica. La colisión consume la transacción sin crear ni modificar perfiles. La familia de vinculación se verifica al inicio y tras el intercambio; logout/revocación durante OAuth impide completar.

[Seguro] La migración importa pares desde `auth.identities.provider_id` y exige consistencia con `identity_data.sub`; conserva el UUID de sujeto/perfil y no modifica email/historial. `import_social_identities()` solo es invocable por el migrador y es idempotente para el mismo mapa; un conflicto falla para revisión operativa. Congelar writes OAuth legacy, ejecutar este importador otra vez para el delta y verificar conteos/mapas antes de habilitar Auth=nest. Mantener el mismo Google Client ID/Apple Services ID que el origen importado; cambiar IDs/transferir una aplicación Apple puede cambiar subjects pairwise y requiere reconciliación específica. Se preservan los sujetos sociales al retirar su fila GoTrue; no se eliminan vínculos ni perfiles.

[Seguro] El rollback del transporte no borra datos; cuentas/vínculos creados exclusivamente en Nest requieren conservar Auth=nest o reconciliar explícitamente antes de volver a GoTrue. Volver al flag anterior no exporta identidades nuevas al proveedor antiguo. #164 determina el corte/retiro de autoridad legacy.

[Seguro] Unitarias OIDC usan tokens RS256 y JWKS sintéticos con la biblioteca real; las pruebas Next verifican cookies, métodos/origen, cancelación, duplicados, consentimiento, contexto QR y linking. No constituyen ensayo externo Google/Apple.

| Verificación | Estado |
| --- | --- |
| API/SDK build; Next typecheck; lint inicial | [Seguro] PASS |
| OIDC firmado Google/Apple y configuración | [Seguro] PASS 2/2 |
| Contratos Next y regresiones de disponibilidad/perfil | [Seguro] PASS 14/14 |
| pgTAP OAuth/identidad #162 | [Seguro] PASS 51/51 (31 nuevos + 20 regresiones) |
| HTTP/PostgreSQL OAuth | [Seguro] PASS 1 integración: importación idempotente de ambos proveedores, historial, Apple relay, linking/collision/claims/expiración/replay/concurrencia y cleanup propio |
| Regeneración de tipos | [Seguro] PASS, esquema público coincide |
| `ci:checks` sobre el diff de implementación | [Seguro] PASS 12 gates: core150; web912 y81 integraciones omitidas en esta fase; API/SDK/worker PASS |
| Chromium375 Next→Nest→PostgreSQL | [Seguro] PASS nueva cuenta/aceptación/onboarding, login existente y linking; axe sin violaciones/reflow; Google sintético firmado |
| Staging Docker sintético | [Seguro] PASS build/roles/DB/deploy/rollback; fallo de deploy inyectado esperado |
| Backend completo | [Seguro] FAIL en pgTAP: únicamente `send_invitations.test.sql`, caso 15 «rechazos no consumen cuota», have 1 / want 0; archivo idéntico a la base. Los demás gates ejecutados, incluido OAuth, PASS |
| Integraciones producto/Edge restantes | [Seguro] PASS 81/81, cero omitidas; ejecutadas aparte tras detenerse el runner en pgTAP |
| CI remoto del commit publicado | [Seguro] PENDIENTE |
| Intercambio externo Google/Apple, Apple relay, credenciales por entorno | [Seguro] PENDIENTE; requiere clientes configurados y cuentas sintéticas de cada proveedor |

[Seguro] Evidencia sanitizada: `checks.json`, `backend.json`, `staging.json`, `portability.json`, `product-integrations.json` y `verification-summary.json`. Los runners registran el SHA base en `sourceCommit` porque estas ejecuciones se hicieron con el diff pendiente; esos reportes no acreditan un commit remoto. El fallo local de cuota ya está documentado en #162; se reprodujo con el archivo sin cambios respecto de `4821627`. No se modificó para ocultar el resultado.

[Seguro] Reproducción: `pnpm ci:checks`, `pnpm ci:backend`, `pnpm ci:staging`. Backend exige Chromium OAuth y la integración HTTP/SQL sin skips. La regeneración de tipos no tiene diff público porque las tablas/funciones nuevas son privadas.

[Seguro] Auto-revisión del diff: corregida comparación de Host frente al origen fijo para Next y orden par→credencial→familia para serializar linking/OAuth con reset/password sin invertir locks. La prueba HTTP retiene un lock de contraseña, observa la espera real del callback y revoca su familia: callback401, sin vínculo nuevo. Revisados grants/SECURITY DEFINER, unicidad/rollback, expiración/replay/concurrencia, ID/historia/consentimiento y privacidad. Trabajo ajeno `next-env.d.ts` se conserva fuera del commit.

[Seguro] Antes de habilitar en producción, registrar SHA/entorno/fecha/resultado para ambos proveedores: usuario importado conserva IDs e historial; nueva cuenta acepta términos/onboarding; correo privado Apple; colisión email y linking explícito; cancelación/replay/mixup; ausencia de PII/tokens en evidencia. No marcar PENDIENTE como PASS. La provisión externa y los ensayos de proveedor no se acreditan mediante mocks ni CI sintético.

[Seguro] Referencias: [openid-client](https://github.com/panva/openid-client), [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [Apple autorización](https://developer.apple.com/documentation/signinwithapplerestapi/request-an-authorization-to-the-sign-in-with-apple-server.), [Apple secreto](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens).
