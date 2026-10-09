# MIG-24 (#168): retiro técnico del runtime Supabase

[Seguro] Esta entrega cambia el código y el artefacto candidato. **Producción continúa NO-GO**: la autorización vigente permite retiro técnico, PR y ensayos sintéticos; no autoriza corte real ni cierre de #168. La aceptación operativa de #166/#167, operadores, ventana y evidencia de proveedores siguen pendientes.

## Runtime candidato

- Next.js16/React19 usa exclusivamente `@asisteam/api-client` hacia Nest/Node24. No hay selección de ejecutor Supabase, PostgREST, Edge Functions, GoTrue ni SDK Supabase en código de producto o dependencias productivas web/API/worker.
- Todas las once familias de transporte y Auth son nativas por defecto. Las banderas antiguas con valor `supabase` fallan cerradas. No hace falta configurar banderas para escoger el destino.
- La sesión SSR consulta Auth propio y usa cookies `asisteam-access`/`asisteam-refresh` HttpOnly, SameSite=Lax, Secure en producción. El archivo `lib/supabase/server.ts` conserva temporalmente su ruta de importación como adaptador **sin SDK**, con únicamente `getUser/getSession`; no ofrece RPC, tablas ni métodos GoTrue.
- Nest verifica únicamente JWT nativo HS256, emisor configurado, audiencia `asisteam-api`, duración máxima de15min y sesión UUID. La transacción vuelve a comprobar sesión vigente y autoridad NATIVE. Producción exige configuración propia completa; URL/clave Auth Supabase y puente de invitación se rechazan.
- PostgreSQL17 independiente conserva SQL/RLS, roles mínimos, vistas/RPC y las reglas del producto. `packages/db` publica el esquema de persistencia independiente; migraciones/seeds de origen son historial, no un servicio requerido por el candidato.
- Worker Node conserva jobs idempotentes/leases. Avatares pasan por S3 privado/API, email por Resend y billing por Nest/Mercado Pago. Google/Apple conservan `/auth/callback/google` y `/auth/callback/apple`; el callback PKCE genérico retirado falla cerrado. Expo sigue siendo transporte histórico de push hasta el plan FCM/APNs; esta entrega no crea cliente móvil ni offline.

## Separación de evidencia

Las pruebas de origen siguen siendo útiles para SQL y auditoría de la transición, pero **no acreditan el runtime actual**. Se conservan con procedencia del commit `847a666b081353382cf60550030660db4821b43c`:

- `apps/web/test/legacy/manifest.json` enumera snapshots y suites de origen, físicamente fuera de `src`; `@legacy` existe solo para tests. Los SDK están exclusivamente en devDependencies para esas pruebas y tooling de origen.
- `apps/api/test/legacy-src` y `legacy-application.mjs` implementan el harness local de origen. El Dockerfile elimina `src/test` y despliega dependencias productivas; ningún import de producto llega al harness.
- Tests actuales en `src/lib/api`, nómina ADMIN, aprobaciones e invitación ADMIN usan DTOs/cliente nativo. `retirement.test.tsx` verifica logout anónimo/CSRF, rechazo de PKCE retirado, register/claim y rechazo transaccional, PENDING/INACTIVE, bienvenida y tareas guardian paginadas. Los callbacks nativos Google/Apple tienen su suite actual.
- Smokes de navegador crean bases sintéticas aisladas con autoridad NATIVE. Nunca cambian la autoridad del origen compartido. HIBP/Resend/OAuth se simulan expresamente.
- El staging MIG-03 es un fixture de health/rollback con esquema mínimo; ejecuta `NODE_ENV=test` sobre el contenedor productivo. No se presenta como staging funcional ni como aceptación de producción.

## Inventario y decisión por dependencia

| Dependencia | Candidato | Origen y condición de retiro real |
|---|---|---|
| `@supabase/ssr`, `@supabase/supabase-js` | Sin imports ni dependencias productivas; gate sobre trazas/bundle | Solo dev: snapshots históricos y CLI/fixtures |
| URLs/claves web Supabase, attestation URL | Eliminadas de configuración de producto y `.env.example` | Retirar valores de Vercel/GitHub/host real durante ventana aprobada; no se inspeccionan ni publican secretos |
| JWKS/GoTrue/puente `invitation-auth` | Código activo eliminado de API | Mantener archivo histórico/origen para auditoría; retirar despliegue/config externa tras inventario del entorno |
| PostgREST/Edge Functions de dominio | Web solo HTTP Nest; misma autorización SQL | No se ejecuta baja externa en este PR |
| Cron/Edge jobs, `pg_cron`, scheduler externo | Worker propio implementado y probado con leases | Verificar escritor único y deshabilitar cron del origen en ventana aprobada conforme runbook166 |
| Receptor Supabase Mercado Pago | Ninguna llamada desde web/API candidato | **Conservar operativo** hasta acreditar que contratos, preferencias y reintentos MP ya no referencian URL anterior; no cambiar contratos ni apagar receptor aquí |
| Auth/Storage Supabase | Auth propio/S3 privado | Revocar claves y accesos solo tras inventario por entorno, transferencia y evidencia verificadas |
| Migraciones, pgTAP, seeds y CLI Supabase | Tooling de origen y evidencia SQL | No son dependencia del artefacto; no se elimina historial legal/operativo |
| Deploy externo, DNS/TLS, dashboards/secrets/backups | Candidato local/sintético | Pendientes operadores, acta, RPO/RTO aceptados, capacidad/costos, monitoreo y aprobación humana |

## Gates de entrega

Ejecutar `pnpm ci:checks`, `pnpm ci:backend`, `pnpm ci:staging` y `pnpm ci:retirement`. El gate de retiro revisa fuentes de producto, manifests, trazas Next, bundles server/browser y dist API/worker; falla si encuentra SDK, imports de fixtures o caminos HTTP de proveedor. Conserva resultado saneado en `.ci-results/retirement.json`. Reejecutar después del build final; los smokes dev no sustituyen ese artefacto.

La matriz final y resultados de esta ejecución viven en [evidence.md](evidence.md). PASS sintético no satisface los gates reales de #167 ni representa permiso de deploy.

## Handoff para corte real

1. Completar acta/runbook166 con responsables, ventana, checkpoints, reversibilidad permitida y aceptación RPO/RTO.
2. Obtener inventario por entorno de URLs/secretos/schedulers y evidencia de datos/Auth/Storage/backups; no copiar datos reales de menores a staging.
3. Acreditar contratos/preferencias/reintentos Mercado Pago y destino del webhook antes de apagar receptor anterior.
4. Ensayar artefacto exacto con carga/proveedores/observabilidad reales y obtener aceptación operativa/funcional/humana de #167.
5. Solo en ventana autorizada ejecutar quiescencia, export/import/reconciliación, cambio de autoridad/escritor, revocación y observación. Registrar hashes, conteos y estados sin PII.

#168 permanece abierto; este PR no lleva palabras de cierre automático.
