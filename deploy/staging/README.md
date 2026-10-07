# Staging sintético reproducible · MIG-03 (#147)

[Seguro] Este despliegue Docker usa PostgreSQL 17.9 y el artefacto Nest de #146, con datos exclusivamente sintéticos. La API sigue exponiendo solo `/health` y `/ready`. **El usuario eligió este alcance; provisión externa, cuenta/región y presupuesto siguen PENDIENTES.** No se migra tráfico ni el esquema de producto de Supabase.

## Crear y desplegar

[Seguro] Desde la raíz, Docker Compose v2, Node 24.16.0 y pnpm 10.33.2:

```sh
node deploy/staging/secrets.mjs /tmp/asisteam-staging-secrets
export STAGING_SECRETS_DIR=/tmp/asisteam-staging-secrets
export STAGING_STATE_DIR=/tmp/asisteam-staging-state
docker build -f apps/api/Dockerfile -t asisteam-staging:candidate .
docker image inspect asisteam-staging:candidate --format '{{.Id}}'
# Pasar el sha256 completo obtenido arriba; no se admiten tags mutables.
node deploy/staging/release.mjs sha256:<id-completo>
node deploy/staging/release.mjs rollback
```

[Seguro] `pnpm ci:staging` automatiza generación temporal de secretos, build, dos artefactos distintos, deploy, rollback por digest, permisos de roles, privacidad de logs y prueba PostgreSQL real API. Luego elimina únicamente su proyecto `asisteam-staging-synthetic` y volumen sintético. **No ejecutarlo mientras se usa ese proyecto para revisión manual.** El runner de CI vive en una VM efímera.

[Seguro] Los secretos se crean una vez fuera del repositorio, sin imprimir valores. Directorio 0700 y archivos 0444 permiten que el bind de Docker Secrets los lea como usuarios sin privilegios; otros usuarios del host no atraviesan el directorio privado. Para un proveedor externo, sustituir esta generación sintética por su gestor de secretos y validar sus permisos. No imprimir `compose config`, URLs, variables ni logs DB completos. Nunca reutilizar estas credenciales en producción ni guardar secrets en artefactos.

## Aislamiento y migraciones

[Seguro] PostgreSQL no publica puertos; reside en una red interna. Solo API se conecta además a la red de acceso con puerto loopback 30467 (`STAGING_PORT` configurable). Runtime no es superusuario, dueño ni BYPASSRLS: tiene CONNECT sin CREATE. El migrator separado es dueño exclusivamente de `staging_runtime`. La credencial bootstrap se usa solo para inicializar el fixture; nunca llega a API/migrator. API ejecuta UID1000, filesystem de solo lectura, sin capabilities y sin escalamiento.

[Seguro] El contenedor migrator aplica SQL operativo en una transacción, advisory lock y ledger SHA-256; cambios en una migración ya aplicada fallan. `001_runtime_marker.sql` solo crea un marcador sintético. **No acredita portabilidad del esquema de negocio, RLS de destino o sesión Nest** (#149/#150/#165). Sus gates reales actuales se ejecutan contra Supabase en CI: 33 suites pgTAP y 81 integraciones por roles con seeds sintéticos.

[Seguro] El healthcheck PostgreSQL espera TCP final, después del bootstrap; el API usa `/ready` para admisión. `release.mjs` exige imagen inmutable, conserva current/previous fuera del repo y restaura el artefacto previo si falla el rollout. Una restauración manual intercambia ambos digests. No se revierten SQL/datos; las futuras migraciones deben mantener compatibilidad con el artefacto previo. Después de escrituras de negocio, el rollback de datos exige el ensayo/reconciliación de #166; aquí no existe ese tráfico.

[Seguro] Los tags `asisteam-ci:current/second` son solo auxiliares de build; el despliegue usa sus IDs SHA-256. Para un registro externo usar `repositorio@sha256:...` y autenticar fuera del repo. La imagen PostgreSQL se construye desde 17.9 con bootstrap versionado. Su provisión permanente, TLS, backups/RPO/RTO, disponibilidad y gestores externos permanecen pendientes y no se infieren de este fixture.
