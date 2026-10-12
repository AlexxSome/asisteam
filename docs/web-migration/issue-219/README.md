# WEB-07 · Actividades, asistencia, historiales y reportes (#219)

[Seguro] Base `731d4f0b2baa8abab47777fa44ad992db44a39c6` de origin/develop, 11-10-2026; rama `codex/219-actividades-asistencia-reportes-vite`. #217 y #218 integrados. Descubrimiento exclusivamente mediante graphify actualizado; un único ejecutor con auto-revisión. Producción continúa NO-GO.

## Resultado y alcance

[Seguro] La SPA incorpora diez rutas: agenda, detalle, alta, edición, tipos de actividad, toma de asistencia, reporte del grupo e historiales propio/pupilo. Conserva groupId/activityId/athleteUserId y contexto de agenda, próximas/pasadas, filtros y páginas en URL. `/me/history` mantiene selector de grupos ATHLETE o redirección al único, sin porcentaje global. Cada loader verifica sesión y grupo ACTIVE y cancela su transporte al cambiar ruta; un fallo de transporte entra al error recuperable, sin presentarse como colección vacía.

[Seguro] Formularios y tablas adaptan la presentación vigente mediante React Router y SDK browser cookie/CSRF. Actividades mantienen horarios America/Santiago convertidos por core a UTC, validación DST, repetición semanal ≤26 semanas/150 instancias y alcance de edición/eliminación de futuras sin asistencia. Tipos de sistema continúan inmutables. Nest/RPC deciden permisos y efectos; no se añaden endpoints, migraciones SQL, reglas ni cálculos de dominio.

[Seguro] ADMIN/COACH cargan toda la nómina paginada; el control conserva búsqueda y páginas de 50, guardado por fila, confirmación inline, contadores, lotes secuenciales ≤500 y resultados parciales. COACH solo cambia estados: no recibe notas ni controles de notas/desmarcado. Avatar usa SDK autorizado/S3 privado. Un write incierto no se repite automáticamente; la fila revierte la presentación provisional y pide actualizar antes de reintentar. Actualizar asistencia carga el estado confirmado del servidor y restablece feedback.

[Seguro] Reportes y ambos historiales son tablas semánticas con regiones de scroll contenido, cabeceras/primera columna y notas exclusivamente propias/pupilo. Filtros conservan borrador/Aplicar y reinician página; group/contexto cambia la instancia del formulario. V1/V2 funcionan con toggles apagados; V3/V6 se reevalúan en SQL; V4/V5 usan DTO agregado sin PII/notas/desglose de terceros. Se conserva 77.8 %, null «Sin datos», puntualidad, Total ponderado frente a Promedio individual, convocatoria por registro, futuras/joined_at y batería SQL/core.

[Seguro] #176/#178 siguen abiertos como coordinación del rediseño: #219 declara #217 como dependencia (CLOSED) y prohíbe rediseño adicional. Se conserva presentación integrada y no se acredita cancha/lector/zoom humano por capturas. #220 conserva billing/anuncios/QR; Next sigue en coexistencia hasta WEB-10. #209 mantiene aceptación operacional externa pendiente. No se añaden CSV/gráficos/calendario ni cliente móvil/offline.

## Verificación reproducible

```sh
corepack pnpm --filter @asisteam/web-vite typecheck
corepack pnpm --filter @asisteam/web-vite build
corepack pnpm --filter @asisteam/web-vite test
corepack pnpm --filter @asisteam/web-vite test:e2e activities-reports.spec.ts
corepack pnpm ci:checks
corepack pnpm ci:backend
corepack pnpm ci:staging
corepack pnpm ci:extended
corepack pnpm ci:qualification
git diff --check
```

[Seguro] Entorno Node24.16.0/pnpm10.33.2, Chromium/axe y PostgreSQL17/S3 sintéticos propios. Los cinco escenarios crean grupos/personas sintéticos y conservan constraints/RLS; se desecha el contenedor completo al terminar. Antes de cada escenario se restablece exclusivamente el bucket de login de la IP loopback del fixture, manteniendo limits durante el recorrido. No se usan datos reales ni proveedores externos. La prueba de write incierto deja que el POST/PATCH llegue al servidor y aborta la respuesta; no equivale a simular un rechazo previo al write.

## Resultados

[Seguro] Los cuatro gates completos y qualification técnico terminaron PASS. Se ejecutaron sobre el árbol del issue antes del commit: los JSON conservan la base sourceCommit/checkoutCommit y el [manifiesto SHA256](evidence/source-manifest.json) identifica 30 archivos de implementación/pruebas verificados. El SHA de entrega se obtiene del commit/PR; estas corridas no se presentan como CI remoto.

| Check | Resultado |
| --- | --- |
| [ci:checks](evidence/checks.json) | PASS exit0: lint/contratos/tipos/build/Next HTTP/retiro/unidades; core 150, Next 961/84 opt-in omitidas existentes, Vite 58/0, API/Worker/SDK |
| [ci:backend](evidence/backend.json) | PASS exit0: PostgreSQL17/API/Worker/tipos/backup/PITR, integraciones nativas/OAuth/portabilidad,1.646 aserciones SQL de 40 suites y 84 integraciones de producto/0 omitidas |
| [ci:staging](evidence/staging.json) | PASS exit0: Docker propio, dos artefactos/releases, roles mínimos, rollback manual/automático, privacidad, integración y cleanup |
| [ci:extended](evidence/extended.json) | PASS exit0: Next 47/47(128,94s), Vite 35/35(74,97s), transporte 1/1(14,08s),0 omitidas |
| [ci:qualification](evidence/qualification.json) | PASS técnico/carga: 500 ATHLETE/5000 registros, 8 celdas/192 requests, p95 máximo 91,48ms; acceptance NO-GO |
| [Vite final y ejecución](evidence/execution-summary.json) | PASS 35/35 exit0,74,095 s/0 omitidas/0 flaky; todos los casos existentes y5 WEB-07 |
| Verificación después del ajuste final de ASI-01 | Typecheck/build/control browser 180 módulos/lint y matriz completa Vite 35 PASS |
| Diff y auto-revisión | PASS; revisión acotada al issue, git diff --check |
| CI remoto | PENDIENTE publicación/ejecución; no se infiere PASS |
| Aceptación humana/externa | NO-GO: baseline/carga representativa acordados, recibos de proveedores, lector/zoom nativo/axe incompletos/cancha y aceptación operacional #209 |

[Seguro] Los FAIL marcados expected en backend/staging son fallos inyectados cuyo cleanup/rollback verifican sus runners; no son fallos de producto aprobados por omisión. Las 84 omisiones de Vitest Next son integraciones opt-in existentes ejecutadas en backend con 0 omitidas. V3/menores conservan cobertura SQL/nativa: guardianships 42, visibilidad 84 y suites completas PASS. El nuevo E2E acredita pérdida de vínculo/visibilidad preservando R1; no fuerza un cumpleaños modificando birthdate por fuera del flujo protegido.

[Seguro] Después del gate extendido, la revisión visual retiró el padding duplicado de Page exclusivamente en ASI-01 para mantener el ancho de los cuatro estados y la primera fila a 375 px. El cambio posterior se verificó con typecheck/build/control de artefacto/lint y una nueva matriz Vite completa35/35; los JSON originales del gate se conservan sin atribuirles esa repetición. El control browser final PASS 180 módulos no incorpora Next/servidor/DB/jobs. Aviso no bloqueante de chunk principal 640 kB (192 kB gzip), frente a 633 kB de base; no se alteran presupuestos.

[Seguro] Capturas sintéticas de la matriz Vite final35/35 revisadas: [asistencia375](evidence/attendance-375.png), [historial375](evidence/history-375.png) y [reporte375](evidence/reports-375.png). Documentan estos estados; los escenarios incluyen reflow 320/375/768/1024/1440 y axe sin violaciones automáticas, sin reemplazar lector/zoom/cancha. Solo se versionan JSON sanitizados y estas capturas; no se copian tokens, sesiones, correos ni reportes browser crudos.

[Seguro] El resumen conserva los fallos iniciales de preparación y sus correcciones: capacidad SaaS, método PUT de fallo, fecha de creación de temporada y protección de birthdate/R1. Ningún caso vigente ni regla axe se eliminó. La auto-revisión también corrigió clases de controles, IDs de pupilo inválidos, retorno seguro de sesión, contexto de borradores y el texto null. El archivo Next next-env generado por runners se restauró a su contenido previo y no forma parte del cambio.


## Corrección del CI remoto del PR #229

[Seguro] La [primera corrida remota](https://github.com/AlexxSome/asisteam/actions/runs/38184281818) del SHA `a1169fd3d8510f3aaa4bedc3b48af9aa0c4c0735` terminó con checks/staging/extended PASS y backend FAIL en `next-social-auth-browser`; required falló por dependencia. Los builds, PostgreSQL/API/Worker/backup/PITR e integraciones nativas previos fueron PASS. El [artefacto del fallo](evidence/ci-correction/remote-social-failure.json) registra fase accept-terms, timeout, cero Server Actions, cero pageErrors y checkbox false. [Runner backend original](evidence/ci-correction/remote-backend-failure.json).

[Seguro] El smoke OAuth y AcceptTermsForm no cambiaron en WEB-07 frente a la base cuyo CI pasó. La reproducción local previa con CPU ×6/red JS500ms pasó22,36s; no reprodujo el timeout remoto exacto. [Probable] El estado remoto es compatible con una interacción antes del commit de React al seguir el redirect OAuth. El smoke nativo ya espera el handler del formulario; el social solo esperaba URL/visibilidad. La prueba corregida observó un botón Google SSR todavía sin handler y esperó97ms al montaje; esto acredita la ventana general, no demuestra la causa exacta de la fase accept-terms remota.

[Seguro] Corrección acotada a `apps/web/scripts/social-auth-smoke.mjs`: esperar el handler React19 existente del control/formulario y dos frames de efectos antes de login Google, aceptación y vinculación. Se conserva timeout30s, todos los asserts y un único click/envío; se agrega assert de exactamente una Server Action de consentimiento. No se añaden reintentos, sleeps fijos de recuperación, excepciones axe ni cambios de Auth/consentimiento del producto. El marcador interno de React queda limitado al harness de la versión fijada y falla si cambia.

[Seguro] Verificación local de la corrección: [smoke lento](evidence/ci-correction/local-social-slow-pass.json) PASS22,29s, CPU ×6/red JS500ms, cero pageErrors/axe; [smoke por defecto](evidence/ci-correction/local-social-default-pass.json) PASS15,37s, consentimiento enviado una vez, cero pageErrors/axe. El assert adicional de una acción se añadió después de la corrida lenta y se verificó en la corrida por defecto. Lint, node --check y diff PASS. [Manifiesto del script](evidence/ci-correction/source-manifest.json) identifica el contenido final comprobado. La nueva corrida del commit correctivo se comprueba en el PR; estos JSON locales no la sustituyen. Producción y aceptación externa mantienen NO-GO.


### Segunda corrida: precondición de cookie de grupo

[Seguro] La [segunda corrida remota](https://github.com/AlexxSome/asisteam/actions/runs/38185384906), SHA `f7203071f0803e25eb95fb44b236ae9d712d2ab7`, confirmó checks/staging/backend PASS; el [smoke OAuth corregido](evidence/ci-correction/remote-social-corrected-pass.json) completó con una acción de consentimiento, cero pageErrors/axe. Extended pasó Next47/47 y falló Vite34/35 en `access.spec.ts:247`, aserción final de descarte de cookie ajena ([artefacto sanitizado](evidence/ci-correction/remote-extended-cookie-failure.json)). La prueba no cambió en el primer commit correctivo y había pasado en la corrida original.

[Probable] Carrera del fixture: el test esperaba únicamente la URL del redirect raíz antes de reemplazar la cookie; el montaje del GroupSelector escribe la preferencia del grupo activo en un efecto. La URL no acredita que loader/vista/efectos hayan terminado. El runner remoto publica ubicación sanitizada, sin detalle crudo suficiente para demostrar esa causalidad exacta.

[Seguro] La corrección del test espera Inicio y la cookie guardada del grupo autorizado; luego navega a Mis grupos, donde el selector activo está desmontado, e inyecta y verifica la cookie ajena antes de volver a raíz. Se mantienen los asserts de recordar grupo autorizado y descartar el ajeno, sin cambios del loader/producto, reintentos, omisiones ni ampliación de timeout.

[Seguro] Verificación final de esta corrección: [matriz Vite](evidence/ci-correction/local-vite-cookie-pass.json) PASS35/35,0 omitidas/0 flaky, sin reintentos; lint/diff PASS. La primera iteración dirigida pasó5/5 antes de añadir poll/assert explícitos de cookie; la matriz completa verifica el contenido final identificado por SHA256. Backend completo local del primer correctivo pasó sus14 checks; no se repiten localmente gates independientes ya aprobados. El CI del nuevo commit se comprueba aparte en el PR.
