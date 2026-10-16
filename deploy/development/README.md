# Desarrollo local persistente · #209

[Seguro] Destino elegido por Alex: instalación local aislada y persistente en este Mac. Este tooling crea exclusivamente `asisteam-dev209-postgres` y `asisteam-dev209-storage`, con volúmenes homónimos terminados en `-data` y etiqueta `asisteam.development.issue=209`. PostgreSQL17 usa5449 y S3 compatible9049; API3049 y web3149. Todos los bindings son `127.0.0.1`. Si un nombre ya pertenece a otro recurso, se rechaza su uso.

```sh
pnpm install --frozen-lockfile
pnpm build
node deploy/development/local.mjs up
node deploy/development/local.mjs verify
node deploy/development/local.mjs serve
```

[Seguro] Abrir `http://127.0.0.1:3149`; no intercambiar127.0.0.1 y localhost en callbacks/origen. `serve` es un supervisor en primer plano que inicia API, Worker y servidor web como procesos separados con configuración propia y sin heredar secretos de proveedores del shell. Solo un supervisor puede ejecutarse a la vez. Ctrl+C detiene esos tres procesos; conserva PostgreSQL, S3 y todos los datos. Después `node deploy/development/local.mjs stop` detiene solo los dos contenedores propios sin eliminar volúmenes. `up` vuelve a iniciarlos, conserva secretos y aplica el migrador con verificación de checksums. No hay comando de reset ni borrado de volúmenes.

[Seguro] Los secretos aleatorios separados por rol y los logs permanecen en `.qa/issue-209/` (Git lo ignora), directorio700 y archivos600. No publicar esa carpeta ni usar `docker inspect`/`docker logs` crudos como evidencia. Si se pierden los secretos con volúmenes existentes, el script rechaza regenerarlos y no altera datos. Guardar copia privada de los secretos para recuperar la instalación. Los procesos usan el build local actual: detener `serve` antes de reconstruir/cambiar de rama y registrar de nuevo SHA/hashes antes del siguiente ensayo.

[Seguro] El provisionado usa `packages/db/bootstrap.sql` y el migrador canónico; runtime API/Auth/Worker/invitaciones/billing tiene roles separados sin ownership ni BYPASSRLS. No instala fixtures QA que limpian datos del usuario ni modifica las fixtures efímeras de CI. `verify` comprueba versión17, ledger/checksums, permisos positivos de conexión y rechazo de DDL por rol y bucket sin acceso anónimo. Eso complementa la suite RLS/menores/métrica; no acredita los recorridos del destino ni proveedores.

[Seguro] La instalación nace vacía y conserva los datos que se creen localmente. `verify-flows.mjs` prepara dos cuentas adultas/clubes sintéticos cuando faltan, guarda credenciales en `accounts.json` privado y comprueba Auth/V6 y marcadores DB/S3 sin borrarlos. Esos consentimientos son fixtures, no aceptación humana. `load.mjs` conserva además500 adultos gestionados y5.000 asistencias para repetir el escenario adoptado. Usar solo cuentas y datos sintéticos. Google/Apple/Resend/Mercado Pago/push no tienen credenciales configuradas. Las funciones que requieren proveedores quedan pendientes; no se simulan como recepción externa. S3 compatible usa el servidor sintético documentado para desarrollo; TLS/cifrado/retención del host, alertas, RPO sostenido y recuperación completa deben medirse y aceptarse según [bitácora209](../../docs/migration/issue-209/README.md). Apagar/suspender el Mac suspende estos servicios y cualquier RPO de backup local necesita una política explícita. Producción **NO-GO**.

## Carga y continuidad adoptadas para este Mac

[Seguro] Alex adoptó500 ATHLETE/5.000 registros, concurrencia1y4, p95≤500ms; RPO15min, RTO60min, backup cifrado cada15min y retención30d. Declaró disponibilidad hasta07:30 del16-10-2026 America/Santiago. La [bitácora](../../docs/migration/issue-209/README.md) distingue estos objetivos de su cumplimiento sostenido.

```sh
# Con serve activo: prepara cuentas/clubes sintéticos con credenciales aleatorias privadas.
node deploy/development/verify-flows.mjs
node deploy/development/load.mjs
# No elimina el dataset: conserva500 adultos MANAGED y5000 asistencias sintéticas.
node deploy/development/backup.mjs backup
# El nombre lo devuelve backup; solo admite archivos propios del directorio privado:
node deploy/development/backup.mjs restore-check dev209-<timestamp>-<uuid>.aesgcm
# Ventana exacta autorizada, equivalente a07:30 America/Santiago:
node deploy/development/backup.mjs schedule-until 2026-10-16T10:30:00.000Z
```

[Seguro] El scheduler de esta ejecución se dejó en un proceso local separado con log privado `.qa/issue-209/backup-scheduler.log`, bloqueo de instancia y fecha de parada explícita; no iniciar otro mientras exista el bloqueo. Cada intento comienza a intervalos de15min mientras el Mac y Docker están activos. Al07:30 deja de generar backups; la aplicación puede seguir activa. Suspensión, apagado, reinicio de Docker o muerte del proceso pueden interrumpir la cadencia. El JSON `.qa/issue-209/backup-schedule.json` registra ventana y objetivos; los archivos cifrados contienen fecha y checksums autenticados. La cronología debe revisarse para aceptar el RPO; no se promete después de la ventana.

[Seguro] Los dumps lógicos y objetos solo se descifran en memoria. AES-256-GCM usa clave aleatoria256bits en `.qa/issue-209/backup.key`, modo600, fuera de Git; se debe conservar una copia privada separada para recuperar ante pérdida del Mac. La retención elimina exclusivamente archivos del patrón dev209, autenticados con esa clave/identidad y fecha de más de30d dentro de `backups/`; preserva los demás archivos. No se borran datos ni objetos del destino. Un bloqueo dejado por un proceso muerto exige comprobar que ya no existe antes de retirarlo manualmente; no hay recuperación automática que borre bloqueos de otro operador.

[Seguro] La captura usa un snapshot PostgreSQL exportado, `pg_dump` canónico y comprobación de inventario/ETags S3 antes/después; rechaza cambios de objetos durante la copia. No demuestra atomicidad DB/S3 ante escrituras concurrentes que comiencen antes del inventario. El ensayo realizado usó únicamente datos sintéticos estables. La restauración crea exclusivamente PostgreSQL y S3 nuevos mediante los helpers de ensayo existentes, compara el dump lógico completo y cada objeto y destruye solo esos recursos temporales. Nunca sobrescribe dev209. No configura WAL/PITR del destino persistente, copia externa ni continuidad ante pérdida del disco; esos criterios siguen pendientes. Los resultados de fixtures PITR de CI se registran aparte.

[Seguro] Para detener el proceso de backups, leer su PID en `.qa/issue-209/scheduler-process.json`, comprobar con `ps -p <PID> -o command=` que corresponde a `deploy/development/backup.mjs schedule-until`, y ejecutar `kill -TERM <PID>`; el bloqueo se libera al terminar el backup en curso. Para reanudar dentro de la misma ventana ejecutar de nuevo `schedule-until 2026-10-16T10:30:00.000Z`; la fecha expirada es rechazada. Si se desea segundo plano, conservar stdout/stderr en un archivo privado y guardar el PID nuevo. El scheduler de esta entrega ya está iniciado: no duplicarlo. La aplicación se detiene con Ctrl+C en `serve`; los contenedores con `local.mjs stop`, y se reanudan con `up` y `serve`.
