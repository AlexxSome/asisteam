# API Nest

[Seguro] Runtime único Nest/Node24 sobre PostgreSQL17 independiente, Auth propio y S3 privado. No contiene ejecutores ni dependencias del proveedor retirado. Las capacidades de COACH, billing, anuncios, QR y Google/Apple se conservan.

[Seguro] Contrato HTTP generado desde `packages/core`; `pnpm api:check` valida OpenAPI/SDK. DTO estrictos rechazan actor/tenant inyectados; el servidor valida JWT HS25615min y familia vigente antes de la transacción/RLS. `404` impide enumeración; errores y logs no exponen SQL/PII/tokens.

[Seguro] Configuración en [.env.example](.env.example) y `src/config.ts`: `DATABASE_URL` rol asisteam_api; `NATIVE_AUTH_DATABASE_URL` rol asisteam_auth; URLs separadas de invitación/billing en la misma base; Worker asisteam_jobs. Producción exige Auth propio completo y TLS válido. Secrets OAuth/MP/Resend/S3 son externos; no se admiten roles propietarios o BYPASSRLS.

```bash
pnpm --filter @asisteam/api build
pnpm --filter @asisteam/api test
pnpm ci:backend
```

[Seguro] Integraciones crean bases vanilla PostgreSQL y S3 privados propios y desechan el fixture completo. El CI exige casos HTTP reales, RLS/V1–V6/menores, login/refresh/recovery/logout/OAuth, invitaciones/claim, ledger y recuperación tras restart. Transportes externos sintéticos conservan estados/reintentos; aceptación de proveedores reales permanece [pendiente](../../docs/migration/issue-168/operational-acceptance.md). Producción NO-GO; estos comandos no realizan corte real.
