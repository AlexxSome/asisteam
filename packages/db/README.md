# PostgreSQL independiente · MIG-21 (#165)

[Seguro] `migrations/0001_baseline.sql` instala el esquema de negocio en PostgreSQL 17 sin esquemas, servicios, extensiones ni roles internos de Supabase. `transformation.json` registra el SHA de cada migración origen y del baseline; `source-catalog.json` conserva columnas/defaults, constraints, RLS, políticas y vistas del origen, con las equivalencias explícitas del preparador. El baseline queda congelado después de su entrega: **las nuevas migraciones y fixtures se agregan aquí**. `supabase/migrations`, sus pruebas y `src/database.types.ts` permanecen como historial/QA de coexistencia.

[Seguro] La preparación inicial usa solo el esquema del proyecto local fijo y un clon vacío propio. `node packages/db/scripts/prepare.mjs` documenta cómo se derivó; no es un comando de actualización de una instalación existente. Su comparación califica el default pgcrypto y aplana únicamente dos expresiones AND asociativas exactas de anuncios. No cambia operandos, límites, RLS ni reglas canónicas. Retira Auth/Storage legacy y funciones de importación/despacho/handoff ya sustituidas; conserva **todas las 44 tablas de negocio de public/app_private**, incluidos ledger de importación Auth, consentimientos, jobs, facturas, preferencias push y manifiestos de avatar. Las filas de origen se migran/reconcilian durante #166; este baseline no importa automáticamente datos de un entorno.

## Instalación y migraciones

[Seguro] Un administrador del cluster ejecuta `bootstrap.sql` una sola vez en la DB destino. Crea `pgcrypto`, roles propios y permisos de conexión; ajusta ownership de public/extensions. Los roles nacen NOLOGIN: el gestor de secretos asigna credenciales separadas de despliegue/API/jobs/Auth/invitaciones/billing. No reutilizar la conexión administradora en runtime. Migrator es dueño sin SUPERUSER/BYPASSRLS; API hereda exclusivamente `asisteam_member` con SET FALSE, y los ejecutores de efectos no heredan roles ni leen/escriben tablas directamente.

```sh
# URLs privadas en el gestor de secretos; no imprimirlas ni guardarlas en Git.
pnpm --filter @asisteam/db migrate
pnpm --filter @asisteam/db types:generate
pnpm --filter @asisteam/db types:check
pnpm api:check
```

[Seguro] `DB_DEPLOY_URL` debe autenticar como `asisteam_migrator`. El migrador usa transacción, advisory lock y ledger SHA-256 en `db_migrations`; rechaza cambios a una migración aplicada y roles de runtime. Constraints/triggers/RPC y RLS siguen activos. Las futuras funciones requieren grants explícitos: los defaults no conceden EXECUTE a PUBLIC. `DB_TYPES_URL` puede usar una conexión de catálogo controlada, separada de la de despliegue. La generación consulta metadatos de columnas/funciones, nunca filas; `PersistenceSchema` describe sus representaciones serializadas. Los tipos HTTP se generan/checkean desde OpenAPI mediante api-client, de manera independiente. El export `@asisteam/db/legacy` solo conserva el tipo histórico para QA; la web ya no importa `Database` de Supabase.

[Seguro] Instalar el baseline presupone identidad NATIVE y ejecutores WORKER/NEST. Para migrar un entorno existente, no reemplazar sus filas de control/historia con fixtures: completar importación/corte Auth de #164 y handoffs de #157–#159, drenar ejecutores, transportar sus filas y reconciliar antes de admitir tráfico (#166). Auth anterior y Storage metadata requieren su propia evidencia de importación/manifiesto; eliminar esquemas no acredita migración de hashes/bytes. Mantener backups cifrados de evidencia y verificar las FK/IDs/consentimientos/ledger y conteos por grupo.

## Conexiones y recuperación

[Seguro] Runtime usa DATABASE_URL de API y URLs propias de Auth/invitaciones/billing hacia **la misma DB**, con TLS/certificado del proveedor en el entorno externo. Worker usa su rol separado. Next requiere `ASISTEAM_DATABASE_MODE=independent`, AUTH y los once módulos de transporte en `nest`; configuración parcial falla. Este modo prescinde de NEXT_PUBLIC_SUPABASE_URL/ANON_KEY y ASISTEAM_API_SUPABASE_URL. No cambia las reglas de permisos ni habilita fallback.

[Seguro] Presupuesto por réplica: API PG_POOL_MAX (default 5, fixture 2), Auth 3, invitaciones 3, billing 3 y worker 2. Sumar réplicas/API/worker, sesiones de migrador/backup/monitorización y reservas del proveedor antes de fijar max_connections. El fixture mide 12 solicitudes concurrentes con pool 2, servidor 40 y reserva superuser 3; no certifica throughput, p95 ni capacidad de un proveedor. Mantener timeouts del proyecto; no ampliar pools sin una medición del destino. Un pooler externo debe conservar transacciones y los claims SET LOCAL; nunca usar statement pooling para la autorización.

[Seguro] Backups lógicos deben conservar ACL/default privileges y restaurarse con los mismos roles/owner, pgcrypto disponible en extensions y schema USAGE del migrator. El ensayo restaura con el rol de despliegue y comprueba filas completas de 45 tablas (44 de negocio + ledger SQL), grupos, constraints, login/historial/API y worker. Los digests de filas y archivos con hashes quedan en memoria o almacenamiento temporal privado, fuera de artefactos.

[Seguro] PITR requiere basebackup + WAL continuo y restauración a otro cluster. El ensayo configura archive_mode, toma pg_basebackup, archiva WAL, recupera a un punto nombrado y prueba que una escritura posterior queda fuera. Su archivo local y credenciales son sintéticos; producción requiere almacenamiento privado cifrado externo, retención, alarmas de archivo, ventanas de mantenimiento y restauración medida. RPO/RTO, proveedor/región, volumen y presupuesto externos siguen **PENDIENTES** según #145/#147. Tras escrituras nuevas, volver a un snapshot viejo exige congelación/reconciliación de deltas (#166); no restaura por sí solo la continuidad de negocio.

## Ensayo reproducible

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter @asisteam/api --filter @asisteam/worker
node apps/api/test/independent-postgres.integration.mjs
pnpm ci:checks
pnpm ci:backend
```

[Seguro] Docker/Node24/Chromium requeridos. El ensayo crea y elimina únicamente dos contenedores/volúmenes propios y un directorio temporal 0700. La imagen postgres17.9 añade pgTAP solo como dependencia de pruebas. Usa puertos loopback aleatorios y nunca recibe una DB externa. Chromium recorre Next→Nest→PostgreSQL independiente, con URLs/keys Supabase explícitamente vacías; HIBP/Resend se simulan. No ejecutar simultáneamente con otro smoke Next ni build/typegen. `DB_GENERATE_TYPES=1` es una operación de desarrollo deliberada para regenerar el archivo desde ese destino; las corridas normales exigen igualdad y no escriben tipos.

[Seguro] Evidencia sanitizada en `.ci-results/independent-postgres.json`: fases/tiempos/versiones/conteos, presupuesto y resultado PITR. pgTAP de destino (23 permisos + 27 métricas), fixtures de V1–V6/R1/historia y comparación de catálogo cubren el cambio; las suites legacy completas siguen en ci:backend mientras dure coexistencia. Los checks de OpenAPI, tipos legacy, tipos PostgreSQL y ledger son independientes. Resultados y límites de la entrega: [MIG-21](../../docs/migration/issue-165/README.md).
