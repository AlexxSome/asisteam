# MIG-21 · PostgreSQL independiente y tipos sin Supabase (#165)

[Seguro] Base `develop@57b3dbc575de9def7e5c8d10a27179d1d5dd3266`; rama `codex/165-postgres-independiente`, 2026-10-08. El alcance externo pendiente de #145/#147 se mantiene: esta entrega prepara y ensaya el destino con datos sintéticos; no declara migración de producción ni disponibilidad de proveedor.

[Seguro] [packages/db](../../../packages/db/README.md) contiene baseline portable, historia/hash de transformación, catálogo reconciliado, roles/bootstrap, migrador transaccional con lock/ledger, fixtures y generador de tipos PostgreSQL propios. Conserva las 44 tablas de negocio y sus columnas/FK/constraints/RLS/vistas. Retira esquemas auth/storage y dispatchers/importadores/handoffs de plataforma; NATIVE/WORKER/NEST son los únicos ejecutores instalados. El helper auth_user_id recibe grant explícito a asisteam_member en reemplazo de su anterior EXECUTE implícito para PUBLIC; los demás helpers internos permanecen sin grants públicos.

[Seguro] API/billing/worker verifican roles mínimos aun sin service_role ni auth en el catálogo; conservar una consulta a un rol o regnamespace inexistente hacía fallar readiness/operaciones. Los controles continúan rechazando runtime dueño, SUPERUSER, BYPASSRLS y membresía de migrator. Los grants de tablas, columnas y RPC existentes se trasladan a roles propios; la autorización de V1–V6/R1 vive en el SQL canónico. La web usa el esquema de persistencia generado propio para la compatibilidad transitoria y DTO HTTP para Nest; no importa el tipo Database de Supabase. El modo independent exige Auth y todos los módulos Nest y elimina la antigua atestación por URLs Supabase.

[Seguro] Los tipos de persistencia, el ledger/hash de migraciones y OpenAPI/API-client tienen gates independientes. La batería de nueve casos canónicos vive ahora en fixtures de packages/db; core y destino la consumen y el gate comprueba igualdad con el SQL legacy, conservado como historial. No se cambian UI/rutas ni se amplía móvil/offline/push nativo.

## Evidencia y límites

[Seguro] El ensayo instala en PostgreSQL17 vanilla con pgTAP, autentica contra Nest con roles propios, ejecuta operaciones de worker/billing, verifica menores/consentimientos/historia/visibilidad/métrica 77.8/null, rechaza roles/migraciones alteradas, compara metadatos completos con el origen y mide conexiones. Restaura el backup lógico con 45 tablas y comprueba contenidos, conteos por grupo, constraints, login/API/worker. PITR físico recupera un basebackup con WAL hasta un restore point, incluyendo la escritura anterior y excluyendo la posterior.

[Seguro] La preparación compara solo esquema del Supabase local, sin copiar sus filas. Datos, contraseñas y sujetos del destino son nuevos y sintéticos; logs/artefactos nunca adjuntan hashes de credencial, UUIDs personales, PII, tokens, DSN ni SQL crudo. Chromium prueba registro/perfil/Origin/cookies/refresh/logout/recovery/reset/login en el destino independiente, con configuración Supabase vacía. HIBP/Resend siguen simulados: no se acredita entrega de correo ni Google/Apple externos.

| Gate | Resultado |
| --- | --- |
| ci:checks | [Seguro] PASS lint/OpenAPI/typecheck/build/core150/web932/API/worker/SDK; 81 integraciones web separadas de la fase unitaria |
| PostgreSQL independiente | [Seguro] PASS inicial instalación/migrador/catalogue/tipos, pgTAP50, nueve métricas, roles/API/worker, R1/visibilidad/historia, pool y restauración lógica45 tablas |
| PITR físico | [Seguro] PASS basebackup/WAL/punto nombrado; escritura posterior excluida |
| Chromium contra destino independiente | [Seguro] PASS registro/perfil/CSRF/cookies/refresh/logout/recovery/reset/login; 16.8 s, sin URLs/keys Supabase |
| ci:backend | [Seguro] PASS pgTAP1673/1673, 81/81 integraciones producto, cero omitidas; API/Auth/OAuth/worker/Storage/portabilidad PASS; fallo inyectado esperado y cleanup PASS |
| ci:staging | [Seguro] PASS roles/deploy/rollback/DB; fallo de artefacto inyectado esperado y recuperación PASS |
| CI remoto, proveedor, volumen, RPO/RTO y corte externos | [Seguro] PENDIENTE; no heredados de ensayos locales |

[Seguro] La auto-revisión revisa únicamente el diff de #165 y sus efectos: owners/default privileges, claims/RLS, grants calificados, helpers PUBLIC, correspondencia de catálogo, migraciones inmutables (también rechaza eliminar un SQL aplicado), credenciales/artefactos y cleanup propio. Se corrigieron grants sin schema y USAGE/owner de extensions en restauración; dos AND asociativos de anuncios se normalizan por coincidencia exacta, sin ocultar cambios de condiciones. El cambio ajeno next-env.d.ts se conserva fuera del commit y se repone tras typegen/build.

[Seguro] El [runbook](../../../packages/db/README.md) especifica instalación/URLs/TLS, nuevos SQL/fixtures/types, presupuesto por réplica, backups/PITR y gates previos a mover filas existentes. La importación de datos/corte/rollback con deltas queda en #166; la provisión gestionada y mediciones con volumen real requieren decisiones/entorno externos ya pendientes. No se cierra el issue ni se mergea automáticamente.

[Seguro] `checks.json`, `backend.json`, `staging.json` e `independent-postgres.json` conservan evidencia sanitizada. El backend se ejecutó antes de añadir el navegador al ensayo de destino; la repetición final independiente valida ese añadido junto a todos sus gates. Los reportes identifican la base porque verifican el diff pendiente; los hashes de código en `verification.json` relacionan la evidencia con el resultado revisado. Los resultados remotos se consultan en el PR del commit publicado.
