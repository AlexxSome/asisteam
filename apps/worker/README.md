# Worker · MIG-13 (#157)

[Seguro] Runtime Nest/Node24 con PostgreSQL y `asisteam_jobs`, reutilizando `TransactionalEmail` y `SafeLogger` de API. API no depende del worker. Conserva la RPC transaccional canónica y el ledger `job_runs`; ningún fallo de correo revierte una baja. [Runbook, evidencia y límites](../../docs/migration/issue-157/README.md).

```sh
pnpm exec turbo run build --filter=@asisteam/worker
pnpm --filter @asisteam/worker start
# Variables desde gestor de secretos externo: DATABASE_URL (asisteam_jobs),
# RESEND_API_KEY, INVITATION_EMAIL_FROM para entregar correo; POLL_MS opcional (1000–60000).
docker build -f apps/worker/Dockerfile -t asisteam-worker:candidate .
```

[Seguro] El instalador deja `LEGACY`; iniciar contenedores no migra el scheduler. Configurar LOGIN/credencial de `asisteam_jobs` fuera de las migraciones mediante operador. Mantener NOSUPERUSER/NOBYPASSRLS y cero membresías de roles/permisos directos sobre tablas; el runtime comprueba ese contrato antes de cada operación. La API y el worker usan secretos distintos. No usar credencial de propietario ni service_role en el worker.

[Seguro] Sin credenciales de correo, la transición continúa y la entrega queda pendiente con reintento/alerta. Un fallo de configuración DB impide iniciar.

[Seguro] SIGTERM/SIGINT detienen el polling, esperan el tick en curso y cierran el pool. Una terminación abrupta recupera leases al minuto; no genera una nueva clave de correo. Desplegar contenedor sin privilegios, filesystem de solo lectura, secrets externos, salida PostgreSQL/Resend y reinicio administrado. El proceso no expone HTTP: sus logs estructurados permiten detectar ausencia de ticks y backlog; integrar la alerta del runbook antes del corte externo.

```sh
pnpm --filter @asisteam/worker test
WORKER_TEST=1 pnpm --filter @asisteam/worker test:integration
# Tras construir asisteam-worker:issue157 y sin otra suite que cambie el rol jobs:
pnpm --filter @asisteam/worker exec node test/container-smoke.mjs
pnpm exec supabase test db supabase/tests/majority_worker.test.sql supabase/tests/my_wards.test.sql
```

[Seguro] La integración usa exclusivamente PostgreSQL loopback del stack Supabase sintético y un proveedor HTTP local, dos contextos Nest y un proceso separado que cae tras reclamar. Restaura modo/cron/roles/ledger y limpia solo sus fixtures. No ejecutarla en paralelo con suites que modifiquen esos recursos operativos. No sustituye una entrega Resend real.


## Anuncios Expo · MIG-15 (#159)

[Seguro] El mismo proceso ejecuta AnnouncementWorker tras MajorityWorker; ambos tienen modos SQL independientes. EXPO_ACCESS_TOKEN opcional privado habilita la seguridad mejorada Expo; no usar service_role. Cola/leases/recibos y handoff LEGACY→DRAINING→WORKER de anuncios en [MIG-15](../../docs/migration/issue-159/README.md). Compilar/iniciar no activa el ejecutor. Monitorizar push_tick/push_failed/push_backlog sin payloads/tokens.
