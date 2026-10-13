# UI-06 · Actividades y asistencia (#176)

[Seguro] Base `develop@c354161`, rama `codex/176-actividades-asistencia`, Node24.16.0/pnpm10.33.2. Graphify actualizado antes de localizar rutas/componentes/pruebas. #171/#172/#174 están integrados. React19/Router → SDK generado → Nest → PostgreSQL17 conserva permisos y 39 destinos. Producción NO-GO; no despliegue/corte ni cierre del issue.

## Composición y continuidad

[Seguro] ACT-01 usa PageHeader con grupo/Chile, CTA crear ADMIN y toolbar próximas/pasadas; gestión de tipos es secundaria. Agenda compartida (grupo/global/pupilos) conserva orden autorizado/páginas y agrupa por día Chile: fecha 56 px, título, horario con término y cambio de día, tipo/lugar y CTA debajo del contenido en móvil. ADMIN/COACH en agenda de grupo reciben toma contextual; los otros contextos reciben detalle. No añade calendario mensual, gráficos, geocerca ni offline.

[Seguro] ACT-02 usa marca de fecha y acción de toma por permiso; muestra inicio/término/zona/lugar/recurrencia/descripción en superficie y gestión ADMIN después del contenido. Conserva historial propio/pupilos multirol y retorno a grupo. ACT-03/04 máximo 672 px, formulario plano, horario/resumen/repetición/alcance y eliminación existentes; la serie modifica futuras sin asistencia y conserva ocurrencias protegidas. No altera API/RPC/métrica ni requiere migración o regeneración de contratos.

[Seguro] ASI-01 máximo 1024 px, cabecera compacta tarea/actividad/fecha, buscador y contadores operativos (Sin marcar separado), nombre y estados 44 px. Notas siguen ADMIN, seleccionados tienen texto/check/color, proceso/error junto a fila. Guardado masivo y actualización quedan después de filas/paginación. Acción masiva continúa sobre toda nómina incluso con búsqueda y requiere confirmación accesible; batches≤ 500 y errores conservan éxitos anteriores. El código de persistencia concurrente y reconciliación no cambia. El retorno a detalle transporta únicamente parámetros de origen existentes permitidos, sin URLs externas.

## Reproducción y gate

```sh
CI=true corepack pnpm install --frozen-lockfile
corepack pnpm --filter @asisteam/web exec vitest run src/components/attendance-sheet.retained.test.tsx src/components/activity-form.retained.test.tsx src/activities-reports.test.tsx src/lib/group-routing.test.ts
corepack pnpm --filter @asisteam/web test:e2e:full activity-ui.spec.ts
corepack pnpm ci:checks
corepack pnpm ci:backend
node scripts/ci/probe.mjs
corepack pnpm ci:staging
corepack pnpm ci:extended
corepack pnpm ci:qualification
```

[Seguro] `.github/workflows/ci.yml` aplica a PR sin filtros: checks/backend(+probe)/staging/extended → qualification → required. `extended.yml` solo programado/manual. Fixtures PostgreSQL17/S3 y navegador sintéticos locales propios; nunca datos reales de menores. Instalación frozen, scripts/matriz canónicos; no se publica PR antes de PASS de todos los checks. [Evidencia final](ci-local.json) registra comandos, fuente/hashes y resultados; CI remoto permanece separado.

## Medición y límites

[Seguro] El E2E nuevo mide geometría de primera fila desde scroll 0 a 375×812, targets ≥44 px y ubicación secundaria detrás de filas. Recorre20 deportistas con writes reales a Nest/PostgreSQL y conserva tiempo automatizado como dato de laboratorio. También verifica inicio→actividad correcta→grupo, agenda→detalle→toma→agenda con filtros, COACH sin notas, ATHLETE historial propio, responsive320/375/768/1024/1440/1536 y axe/teclado. Regresiones canónicas cubren GUARDIAN, aislamiento, series protegidas, lotes y respuesta incierta.

[Seguro] **PENDIENTE aceptación humana:**20 deportistas / <60 s con teléfono real a una mano, lector escuchado, zoom nativo200%, casos axe incomplete y aprobación visual #181/#209. Las capturas y el tiempo Chromium no aprueban esos criterios. Los tests no exigen ni deducen el umbral humano del cronómetro automatizado.

[Seguro] Auto-revisión limitada al diff del issue y efectos pertinentes: sin hallazgos pendientes. Se conserva la prueba exacta de foco/Tab fuera de confirmación y Escape al disparador; las 17 pruebas de nómina siguen vigentes. Capturas revisadas visualmente. No se declara CI remoto ni implementación aceptada por el usuario en base a CI local.

## Resultados finales locales

| Job del workflow PR | Correspondencia local | Resultado |
| --- | --- | --- |
| checks | instalación frozen; corepack pnpm ci:checks | [Seguro] PASS: 14; core 154 / web 491, cero omisiones. |
| backend | corepack pnpm ci:backend; node scripts/ci/probe.mjs | [Seguro] PASS: 16 + probe 6; dominio 40 / 1646, dashboard 77, integraciones 84. Fallos artificiales esperados detectados y limpiados. |
| staging | corepack pnpm ci:staging | [Seguro] PASS: 53; artefactos/roles mínimos/rollback y limpieza Docker propios. |
| extended | corepack pnpm ci:extended | [Seguro] PASS: 50 nativos + 42 paridad + 1 fallos = 93 E2E; cero omisiones/flaky. |
| qualification / required | corepack pnpm ci:qualification; reconciliar cinco success | [Seguro] PASS técnico, aceptación NO-GO. |

[Seguro] [Mediciones](measurements.json):375×812, scroll 0, primera fila entre 439–569 px y botones de 44 px (estados 76.25 px ancho).20 writes confirmados en PostgreSQL en 2.215 s de Chromium: dato automatizado, **no aceptación de 20 / <60 s en teléfono real**. Carga general500 atletas / 5000 registros / 192 peticiones p95 máximo 117.91 ms; bundle200146 bytes gzip / delta 1028, presupuesto PASS. Son gates generales del repositorio, no benchmark humano de la cancha.

[Seguro] Capturas sintéticas revisadas: agenda [375](activity-agenda-375.png)/[1440](activity-agenda-1440.png); detalle [375](activity-detail-375.png)/[1440](activity-detail-1440.png); formulario [375](activity-form-375.png)/[1440](activity-form-1440.png); toma [375](attendance-ui06-375.png)/[1440](attendance-ui06-1440.png). Los iconos son los reales y no se enmascaran con placeholders; las páginas capturadas no contienen credenciales ni QR.

[Seguro] Entorno local macOS arm64, Node24.16.0/pnpm10.33.2, PostgreSQL17/Docker y Chromium. Los reports identifican HEAD de base c354161 anterior al commit; hashes SHA-256 del contenido final y comandos/checks vinculan esta validación con el diff entregado. Los scripts canónicos y matrices coinciden con CI; upload/download de artifacts de GitHub se representan mediante los reports locales y su reconciliación. CI remoto se consulta en el PR, permanece separado de PASS local. Lector/zoom nativo/casos axe incomplete/uso real y aceptación externa continúan pendientes.
