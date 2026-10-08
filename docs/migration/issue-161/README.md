# MIG-17 · Archivos privados independientes (#161)

[Seguro] Base `80066d8` de `origin/develop`, rama `codex/161-storage-privado`, 08-10-2026. Worktree aislado; se conserva el `next-env.d.ts` ajeno del checkout original. Descubrimiento por graphify actualizado frente a esta base. El commit publicado se consulta en Git/PR; las evidencias JSON identifican el árbol/base verificado.

## Contrato y autorización

[Seguro] `ASISTEAM_TRANSPORT_STORAGE=nest` selecciona exclusivamente Nest/S3 para upload y proxy, independientemente de PROFILE. POST `/api/v1/me/avatar` recibe MIME y bytes base64 (límite binario2MiB), verifica firma JPEG/PNG/WebP, sesión/consentimiento y `can_upload_avatar()`. Serializa uploads del mismo perfil en una transacción `asisteam_api` sin ownership/BYPASSRLS. Guarda objeto inmutable y referencia canónica con actor de sesión; el cliente no elige propietario/key/ACL. Schemas estrictos y OpenAPI/SDK generado incluyen ambas operaciones.

[Seguro] GET `/api/v1/avatars/:ownerId/:fileName` repite `can_read_avatar()` en PostgreSQL: propio, ADMIN, COACH, pupilo y toggles ATHLETE/GUARDIAN, con membership vigente/tenant y consentimiento de imagen. Devuelve solo MIME/bytes; no enumera claves ni entrega URLs firmadas S3. La ruta web existente `/profile/avatar/:ownerId/:fileName` permanece compatible, responde404 indistinguible y `private, no-store`/nosniff. Revocación de imagen deniega objetos históricos inmediatamente en cada GET. No hay fallback a Storage ante un fallo Nest.

[Seguro] El adaptador usa SDK AWSv3, PUT condicional sin overwrite, HEAD/MIME/tamaño y SHA-256 del contenido completo. GET S3 usa URL firmada de30s únicamente dentro del servidor, sin redirecciones y con límite de bytes/deadline. Antes de PUT/lectura verifica ACL exclusivamente del dueño, ownership BucketOwnerEnforced, los cuatro flags BlockPublicAccess y policy sin Allow público; acceso a configuración inaccesible falla cerrado. El runtime no lista ni borra objetos y no registra keys/URLs/tokens/bytes.

[Seguro] El bucket real debe tener ACL del dueño, ObjectOwnership BucketOwnerEnforced, Block Public Access (cuatro flags), sin políticas públicas ni grants de terceros, sin web hosting/CORS público, TLS y cifrado/retención según operación. Configurar identidad IAM de runtime con GetObject/PutObject sobre este bucket y GetBucketAcl/GetBucketPolicy/GetBucketOwnershipControls/GetBucketPublicAccessBlock; sin ListBucket/PutBucketPolicy/PutObjectAcl/DeleteObject. El operador de migración separado añade ListBucket y acceso privado de origen; nunca entregar esas credenciales al API/Next. AWS IAM se obtiene por cadena del SDK; credenciales explícitas son opcionales y solo servidor. La provisión cloud, región/costos/continuidad siguen pendientes del acuerdo de MIG-01; este PR no crea servicios externos.

```sh
ASISTEAM_TRANSPORT_STORAGE=nest
ASISTEAM_API_ORIGIN=https://<origen-nest>
ASISTEAM_API_SUPABASE_URL=https://<mismo-proyecto-db-auth>
S3_AVATAR_BUCKET=<bucket-privado>
S3_REGION=sa-east-1
# S3_ENDPOINT solo para proveedor compatible; HTTPS en producción.
# S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY solo si no existe identidad IAM.
```

[Seguro] MinIO de QA se construye del commit oficial `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`, con bases Docker fijadas por digest, porque sus imágenes publicadas se retiraron. Es un servicio real local con firma/expiración/policy/bytes; no acredita AWS cloud. MinIO no implementa ACL: `S3_LOCAL_POLICY_ONLY=1` admite policy-only **solo** endpoint localhost no productivo; producción/origen remoto lo rechaza. El fixture no se propone como despliegue productivo.

## Copia, coexistencia y reversión

[Seguro] [Migrador](../../../scripts/migration/storage/reconcile.mjs) usa conexión **operativa de migración** dedicada (`row_security=off` hace fallar roles sujetos a RLS; no les concede bypass), source Storage privado y S3. Lee metadata de avatars y mapa AuthUUID→perfil; contrasta propietario/size/MIME y SHA-256, verifica copias existentes sin reescribirlas, y rechaza objeto ausente/corrupto/dueño desconocido. Normaliza exclusivamente referencias canónicas o URLs antiguas de Storage del origen configurado. No descarga URLs arbitrarias. El inventario actual acredita solo avatars; logos externos no tienen bucket implementado.

[Seguro] El manifiesto privado (owner/profile/key/bytes/type/SHA-256) se escribe con0600 en directorio0700, archivo nuevo exclusivo; **no adjuntarlo a Git/CI/PR**. El resumen público conserva solo conteos/bytes/resultado. Después de verificar todos los bytes, una transacción reescribe referencias con comparación del valor anterior; otra referencia o un objeto creado durante copia genera conflicto de delta y exige repetir. Se conservan objetos en ambos lados; no se restauran snapshots ni se deshabilitan triggers para migrar datos operativos.

```sh
pnpm exec turbo run build --filter @asisteam/api
# Configuración operativa en secretos; no poner credenciales en argumentos/logs.
# STORAGE_MIGRATION_DATABASE_URL: rol migrator, misma DB activa.
# STORAGE_SOURCE_ORIGIN + STORAGE_SOURCE_SECRET: acceso operativo temporal origen.
# STORAGE_MANIFEST_PATH: archivo nuevo en directorio privado fuera del repo.
STORAGE_MIGRATION_ACK=frozen-synthetic-or-approved-cutover \
  node scripts/migration/storage/reconcile.mjs
# Reconciliación de vuelta antes de cambiar STORAGE=supabase:
STORAGE_MIGRATION_DIRECTION=reverse \
  STORAGE_MIGRATION_ACK=frozen-synthetic-or-approved-cutover \
  node scripts/migration/storage/reconcile.mjs
```

[Seguro] Secuencia de corte: copy inicial verificable; mantener un único uploader seleccionado; congelar uploads; ejecutar delta final con manifiesto nuevo; conciliar inventario/referencias/checksums; activar STORAGE=nest; smoke de roles/revocación; admitir uploads y conservar origen privado. Antes de retirar Auth, completar estos gates en el entorno aprobado. El ACK es un gate operativo explícito; no verifica automáticamente que todos los procesos estén congelados.

[Seguro] Después de primeras escrituras S3, revertir solo la bandera perdería fotos. Congelar uploads, ejecutar `reverse` (incluye objetos destino creados tras corte), comprobar HTTP origen/SHA-256/referencias, cambiar STORAGE=supabase y admitir uploads. Un conflicto/timeout mantiene el gate cerrado; resolver el resultado de la escritura antes de repetir. Una respuesta COMMIT incierta puede dejar objeto activo u huérfano: no borrarlo como compensación. Objetos viejos se mantienen inaccesibles a terceros y durante esta coexistencia; reconciliar/purgar según retención/supresión canónica tras aceptar el corte. Las referencias AuthUUID se preservan para permisos históricos; retiro de Auth sigue #162–#164.

## Reproducir y evidencia

```sh
pnpm install --frozen-lockfile
pnpm ci:checks
pnpm ci:backend
# Recorrido concreto:
docker build -f scripts/migration/storage/Dockerfile.fixture -t asisteam-storage-fixture:161 .
API_RLS_TEST=1 pnpm --filter @asisteam/api exec node --test test/storage.integration.mjs
ASISTEAM_QA_NEST=1 ASISTEAM_QA_STORAGE=1 pnpm --filter @asisteam/web test:e2e:full --grep MIG-17
```

[Seguro] Node24.16/pnpm10.33.2/Docker29, Supabase local sintético, PostgreSQL17 y S3 independiente. Integración específica PASS2/2 sin omisiones: ADMIN/ATHLETE/GUARDIAN/COACH/multirol/tenant/inactivo, toggles, menor consentimiento/revocación, bytes/tipo/tamaño/owner spoof, anónimo/expiración403, bucket público bloqueado, checksum corrupto, copia3→delta4→reversión5 y referencias antiguas normalizadas. Limpieza elimina solo fixtures/keys/containers propios y restaura el rol API. CI backend y Extended QA incorporan estos gates; resultados globales y límites se detallan abajo.

[Seguro] Cambian transporte y tooling; no hay migración SQL/RLS ni cambios de tipos DB/métrica. pgTAP completo y tipos existentes siguen en el gate backend. PR revisable, sin merge ni cierre automático #161. Provisión/proveedor/copia real/volumen/corte productivo y lector humano permanecen PENDIENTES, no se presentan como PASS de un ensayo local.

[Seguro] Fuentes primarias: [SDK S3/presigner](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/) y [URLs firmadas](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html); el límite30s es decisión de este adaptador, no el default del SDK. [Fuente MinIO](https://github.com/minio/minio/tree/9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a) solo para fixtures sintéticos.

## Resultados locales de entrega

[Seguro] [Evidencia sanitizada](evidence/checks.json), sin manifiestos privados ni logs crudos. Los reportes identifican HEAD/base80066d8 del worktree con implementación pendiente de commit, no una ejecución del producto de base sin los cambios.

| Verificación | Resultado |
| --- | --- |
| `ci:checks`, repetido tras auto-revisión | PASS: lint, generación/OpenAPI, typecheck, contrato Next, build,150 core/903 web;15 unitarias API y worker/cliente. Las81 web omitidas aquí se ejecutaron aparte. |
| [Storage real final](evidence/issue161-storage-final.json) | PASS2/2, cero omisiones; fixture PostgreSQL/Supabase Storage HTTP/S3 independiente. |
| [Perfil375px/axe](evidence/issue161-e2e.json) | PASS1/1, cero omisiones; Next→Nest→S3, lectura propia,404 anónimo, errores y no-store. |
| [Integraciones de producto](evidence/issue161-product-integrations.json) | PASS81/81, cero omisiones; HTTP/PostgreSQL/Edge reales locales. |
| [Staging Docker](evidence/staging.json) | PASS: artefactos/roles/readiness/PostgreSQL y rollback automático. FAIL de deploy inyectado y esperado. |
| [Backend completo](evidence/backend.json) | FAIL exclusivamente pgTAP `send_invitations.test.sql`15; módulos HTTP, worker, ensayo de portabilidad, generación/paridad de tipos PASS. Fallo de portabilidad inyectado y esperado. |
| [Comparación de cuota con base](evidence/base-quota-comparison.json) | SQL exacto80066d8 reproduce caso15: contador global1 en lugar0. Al aislar contadores solo dentro de la transacción del fixture base (ROLLBACK), PASS. No se limpió el stack compartido ni cambió SQL del issue. |
| [Extended global](evidence/extended.json) | FAIL:30 PASS/3 FAIL/9 omitidas. Los3 casos de asistencia esperaban1 deportista/botón y encuentran3; dos adultos MIG08 antiguos contaminan ese fixture compartido. Las9 omisiones corresponden a recorridos Nest preexistentes. No se declaran aprobados. |
| CI remoto | PENDIENTE a publicación del PR; exigir `CI / required` antes de merge. |

[Seguro] La auto-revisión cubrió diff frente a80066d8, incluido código nuevo. Se corrigieron el PUT condicional repetido (verificar copia existente primero), la posibilidad de ACL públicas por objeto (ownership enforced y los cuatro flags), el inventario operativo bajo RLS (conexión dedicada rechaza filtrado silencioso), y el cleanup del fixture si Docker falla antes de crear el contenedor. Las unitarias prueban cada control de privacidad productivo con respuestas SDK; el servicio S3 real local acredita policy, firma, caducidad y bytes, sin atribuirle soporte ACL de AWS.

[Seguro] No se corrigieron ni borraron fixtures ajenos para convertir los gates globales en PASS. [Los restantes pasos de Extended](evidence/issue161-extended-remaining.json) finalizaron PASS13/13, cero omisiones: transporte1, invitaciones1, Storage1, QR1, billing1 y grupos/perfil8; no convierten la corrida global fallida en PASS. PR entregable para revisión; los fallos globales/pending cloud requieren resolución antes del corte y no quedan ocultos por el ensayo específico aprobado.
