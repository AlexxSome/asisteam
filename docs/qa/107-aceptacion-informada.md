# #107 — aceptación informada de la cuenta

## Alcance y evidencia visual

Antes: en `develop` (`1d5b7e7`), `/register` no solicitaba aceptación y la invitación ofrecía un aviso desplegable sin enlaces/versionado visibles. El callback OAuth continuaba directamente a bienvenida/código de grupo. Fuentes de comparación: [registro original](https://github.com/AlexxSome/asisteam/blob/1d5b7e700cf6fac942a9173a79be1fa930f54254/apps/web/src/app/register/register-form.tsx), [invitación original](https://github.com/AlexxSome/asisteam/blob/1d5b7e700cf6fac942a9173a79be1fa930f54254/apps/web/src/app/invitations/%5Btoken%5D/invitation-form.tsx).

Después: aviso compartido, enlaces públicos, versión visible y checkbox sin marcar; registro email e invitación validan aceptación en servidor. OAuth/cuentas sin evidencia completan `/accept-terms`, incluso entrando directamente a otra ruta privada. Consultar el aviso o iniciar sesión no acepta. Los consentimientos de menores permanecen separados.

Capturas reales de Chrome contra el entorno local, sin datos personales:

- [Registro a 375 px](107/register-375.jpg).
- [Registro a 1440 px](107/register-1440.jpg).
- [Aviso público a 375 px](107/legal-375.jpg).

Comprobación responsive de `/register`: 320, 375, 768, 1024 y 1440 px sin desbordamiento horizontal (`scrollWidth === innerWidth`); checkbox inicialmente desmarcado. Zoom real de Chrome al 200 %: ancho de contenido y documento de 756 px, sin desbordamiento; zoom restaurado al 100 %. Teclado: foco de error y Space sobre el checkbox verificados; las pruebas de componente cubren error accesible, doble envío, fallo/reintento y salida sin aceptar. Los enlaces abren otra pestaña para conservar el formulario.

## Validación local

- `pnpm test`: 147 pruebas core y 652 web pasan; 80 pruebas de integración web quedan omitidas por defecto.
- `pnpm typecheck` y `pnpm build`: pasan.
- `pnpm exec supabase test db`: 31 archivos, 1426 pruebas pasan (32 nuevas sobre aceptación, permisos, inmutabilidad, idempotencia y R1).
- Tipos regenerados con `supabase gen types typescript --local`; solo se normaliza el salto de línea final.
- Runtime local `supabase functions serve accept-invitation`, con secreto de proxy sintético compartido entre Edge y tests.
- `RUN_ACCOUNT_CONSENT_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run account-consent.integration.test.ts`: 4/4 pasan. Cubren Auth real, rollback de credenciales/perfil, RLS, RPC concurrentes, rechazo de aceptación ausente/versión obsoleta, invitación y reintento sin duplicar evidencia. Requiere `INVITATION_PROXY_SECRET` del runtime local.

No existe script lint ni workflow de GitHub Actions en este checkout; no se declara una ejecución inexistente. Google/Apple reales no están configurados en el entorno: se cubre el callback con mocks y el comportamiento de metadata OAuth con pgTAP, sin afirmar un recorrido externo de proveedor.

## Limitación del conjunto anterior de invitaciones

`RUN_INVITATION_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run invitation.integration.test.ts`: 7/16 pasan; 9 fallan. La preparación/activación ATHLETE encuentra `subscription_athlete_limit` y varias expectativas posteriores dependen de esas activaciones.

**Reproducción confirmada en fuente base:** se extrajo sin cambios el archivo de tests de `develop` con `git show` y se ejecutó únicamente «HU-DEP-07: adulto reclama por Edge…». Falla con `subscription_athlete_limit` en `managedFixture`, antes de llamar a Edge. La comprobación usa la base local con la migración aditiva de #107 aplicada; el trigger de capacidad y ese fixture no cambian en esta rama. No se ejecutó toda la suite sobre un checkout/base de datos separado de develop. La misma falta de suscripción es la explicación probable del resto, no una reproducción individual confirmada de los nueve fallos. No se modifica facturación dentro de #107.

## Despliegue y decisión pendiente

Aplicar la migración `20261004000000_account_consents.sql` antes del código web y Edge. No ejecutar backfill: cuentas sin evidencia completan aceptación explícita. La versión provisional `2026-09-21` reutiliza el aviso existente por decisión autorizada para este issue. **Producto debe validar texto y versión antes del release** (doc 11); el cambio técnico no reemplaza esa validación. Una nueva versión requiere snapshot nuevo y actualización coordinada de core/BD.
