# Cliente HTTP nativo

[Seguro] Cliente generado desde schemas/operaciones de packages/core, consumido por Next y preparado como contrato para Java/Swift. Usa únicamente Nest; no contiene selector de proveedor, fallback, SQL directo ni retry automático de writes ambiguos.

```bash
pnpm api:generate
pnpm api:check
pnpm --filter @asisteam/api-client test
```

[Seguro] API_ORIGIN es privado del servidor Next. JWT access permanece en cookies HttpOnly/Secure/Lax; el proveedor OAuth usa PKCE y vinculación explícita por subject, nunca fusiona perfiles por email. DTO y errores uniformes conservan anti-enumeración y autorización de grupo. Secrets/proxy del Auth o invitación nunca se publican al navegador.

[Seguro] Once módulos de dominio, Auth y Google/Apple tienen contratos nativos; la vigencia exacta de cada operación se registra en el contrato generado. Las pruebas HTTP reales cubren sesión/RLS, grupos, integrantes, menores/consentimiento, actividades, asistencia, reportes, billing, anuncios, QR y S3. [Evidencia #168](../../docs/migration/issue-168/README.md); aceptación externa y producción NO-GO según matriz operacional.
