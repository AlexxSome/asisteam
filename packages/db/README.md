# Persistencia PostgreSQL17

[Seguro] `migrations/0001_baseline.sql` es historial inmutable de dominio; `0002_retire_provider_entrypoints.sql` retira entrypoints inactivos y conserva autoridades NATIVE/NEST/WORKER. No se instalan esquemas/roles/servicios del proveedor de origen. `transformation.json` conserva únicamente hashes históricos; catálogo vigente en `catalog.json` y tipos propios en `src/persistence.types.ts`.

[Seguro] Migrador asisteam_migrator separado de roles mínimos runtime; ledger verifica todas las migraciones y rechaza hashes cambiados o historia ausente. Las futuras migraciones y fixtures viven aquí. RLS deny-by-default, permisos/V1–V6, menores/consentimiento, métrica e historia legal se conservan.

```bash
pnpm --filter @asisteam/db test
pnpm ci:backend
```

[Seguro] El primer comando posee su contenedor PostgreSQL y ejecuta40 suites/1646 assertions. El segundo añade50 guards SQL/métrica, APIs/Worker,80 casos originales +4 recuperación, catálogo/tipos, backup/PITR y reconciliación tras escrituras. Un fallo SQL o plan incompleto produce exit no-cero. No depende de artefactos proveedor previos.

[Seguro] Generador directo desde PostgreSQL: `scripts/types.mjs`; migrador: `scripts/migrate.mjs` con DB_DEPLOY_URL externo. `scripts/cutover.mjs` es tooling de operador, requiere acknowledgment, directorio privado y todos los escritores congelados; jamás se ejecuta como inferencia del retiro del repositorio. RPO/RTO/ventana externos pendientes según [matriz](../../docs/migration/issue-168/operational-acceptance.md).
