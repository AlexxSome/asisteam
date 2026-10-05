# QA visual, accesible y responsive — #120

Método reproducible sobre Next y Supabase **locales**, con datos sintéticos. Establece la infraestructura al inicio; la matriz completa de la épica #100 es el gate final. No certifica WCAG completa, lector de pantalla ni producción.

## Preparación y ejecución

```sh
pnpm install --frozen-lockfile
pnpm exec supabase start
pnpm --filter @asisteam/web exec playwright install chromium
pnpm --filter @asisteam/web test:e2e
pnpm --filter @asisteam/web test:e2e:full
pnpm --filter @asisteam/web test:e2e:report
```

Ejecutar desde la raíz. Docker y la base local con sus migraciones deben estar disponibles; nunca usar staging/producción. La suite rápida es el gate habitual; `@extended` contiene las capturas por breakpoint y se ejecuta separada para preservar el presupuesto total de CI de 12 minutos. No existe actualmente workflow CI ni script lint versionado; estos comandos no afirman configurar CI remoto.

El servidor usa 127.0.0.1:3120 y `.next/qa-app`, sin reutilizar otro proceso. Limpia solo esa caché QA al arrancar: se observó que reutilizarla después de un build producía 404 espurios; la ejecución desde caché limpia elimina esa interferencia. Ejecutar build/typecheck y E2E en secuencia, no al mismo tiempo. Obtiene las credenciales del stack local con `supabase status`, valida el host y no persiste service-role ni sesiones. El navegador usa el login real. No se mockean autorizaciones ni se desactivan constraints para preparar datos. No se ejecutan cobros, correos externos ni operaciones destructivas sobre datos del usuario.

`e2e/data.mjs` identifica las cinco cuentas de prueba (ADMIN, ATHLETE, GUARDIAN, COACH y ADMIN+ATHLETE), sus credenciales exclusivamente sintéticas y UUIDs estables. La semilla conserva cuatro clubes separados: 0, 1, 50 y 500 ATHLETE activos, un menor pendiente que no entra a la nómina y un pupilo con consentimiento vigente. Las suscripciones locales permiten la nómina; no equivalen a pagos reales. El reloj SQL coloca el entrenamiento el día anterior, las membresías 90 días antes y el grupo 100 días antes. Diez actividades históricas por deportista reproducen 6 PRESENT, 1 LATE, 2 ABSENT y 1 EXCUSED (77.8 %), calculado por la métrica existente: datos deterministas dentro del día de ejecución, zona de presentación America/Santiago.

Los fixtures se mantienen localmente para revisión manual y se re-preparan al ejecutar. Solo se reinician registros de asistencia de las cuatro actividades QA conocidas. Nunca se hace `db reset`, limpieza global ni borrado de consentimientos/historia del usuario.

## Seguridad de la evidencia

`logging.serverFunctions: false` evita serializar argumentos de acciones durante desarrollo; se mantienen los diagnósticos de peticiones. El runner inspecciona stdout/stderr en memoria y persiste únicamente flags de login/registro, argumentos, PII sintética y tokens en `.next/qa/log-check.json`. Los errores de arranque se redactan. No adjuntar el log crudo.

Trazas, vídeos y capturas automáticas de errores están desactivados. Las capturas explícitas enmascaran email, contraseña, código de invitación y SVG visibles (incluido QR); ocultan únicamente el overlay de desarrollo de Next; no capturan la barra de URL. Los reportes axe retienen identificadores de reglas/selectores, nunca snippets HTML. Revisar cada artefacto antes de copiarlo a GitHub. `.next/qa` es temporal; no versionar reportes completos ni sesiones. Se versiona solo evidencia mínima seleccionada y revisada.

## Matriz de recorridos de cierre de épica

Cada fila exige indicar commit, fecha, navegador/SO, rol, fixture, viewport, resultado PASS/FAIL/PENDIENTE y enlace de evidencia. **PENDIENTE no significa PASS**. Repetir la celda afectada al cambiar su implementación; no crear snapshots del markup completo.

| Recorrido | Fixtures y estados | Comprobación automática inicial | Gate manual/final |
| --- | --- | --- | --- |
| Login/registro/invitación | invitado, errores, envío, sin red, éxito | login real, labels/error/foco, offline, registro duplicado y privacidad de logs; formulario de invitación | registro nuevo, aceptar/expirar/rechazar invitación y contexto de destino |
| Cambio de grupo | ADMIN/ATHLETE/GUARDIAN/COACH/multirol; nombre largo | navegación real por rol, drawer, Escape y retorno | cambiar desde lista/reporte y descartar IDs ajenos |
| Integrantes y menores | 0/1/50/500; menor pendiente; capacidad | semilla y conteos reales, exclusión del pendiente, búsqueda vacía | alta menor, vincular apoderado, consentimiento, confirmación ADMIN; R1 nunca se omite |
| Actividad y serie | vacía/con datos, validación, fecha Chile, processing/error/success | formulario real en todos los breakpoints | crear/editar serie y preservar ocurrencias con asistencia |
| Asistencia | sin marcar, guardando, guardado, error, no-results, disabled, offline | teclado de confirmación, petición demorada, guardado real, rollback y recarga tras offline | pasada a una mano, selección sin depender del color, lote/paginación |
| Historial y reportes | 0/1/50, null y métricas, tabla ancha | superficie real, axe, reflow y zoom CSS | V1/V2/V4/V5, tabla con lector, filtros y porcentajes canónicos |
| Perfil | adulto/menor, errores, datos/foto, permisos | superficie real por breakpoint | lector de pantalla, formularios independientes y descarte |
| Billing/anuncios/QR existentes | sin capacidad/con capacidad; read/error/processing | superficies reales; QR enmascarado | revisar confirmaciones sin pagar; redactar tokens; expirar QR y reintentar |
| Loading/error global | carga demorada, servidor caído, recurso ajeno | processing de asistencia y fallo de transporte auth | skeleton/error boundary, recuperación y foco en navegación |

Aplicar 375/768/1024/1440 px a superficies principales y 320 px a reflow. La suite ampliada captura esas cinco anchuras. El zoom CSS 200% es una comprobación adicional y **no sustituye** el zoom nativo al 200%.

## Pasada manual con teclado y tecnología de asistencia

1. Abrir solo el stack local con los fixtures. Registrar SO/navegador/lector y versión. Usar VoiceOver+Safari/Chrome o NVDA+Firefox; no marcar probado sin haber escuchado su salida.
2. Navegar con Tab/Shift+Tab/Enter/Espacio y Escape. Comprobar enlace de salto, landmarks, un H1, orden de encabezados, nombre/rol/estado de controles y selección textual.
3. Abrir drawer: foco inicial, límites de Tab, Escape y retorno al disparador; ampliar a escritorio con drawer abierto. Confirmaciones inline no deben anunciar un modal falso. Comprobar que el foco nunca queda tapado por cabecera ni fuera de pantalla.
4. Provocar errores y demorar/pérdida de red. Escuchar errores asociados al campo, estado de envío, resultado y recuperación. Al reconectar no debe existir cola local ni envío automático.
5. Recorrer tablas por fila/columna y escuchar caption/cabeceras; mover horizontalmente la región de tabla enfocada, nunca toda la página. Verificar null = «Sin datos».
6. Repetir a 200% de zoom nativo y movimiento reducido del SO. Medir texto ≥4.5:1 (grande ≥3:1), foco y controles aplicables ≥3:1 sobre los colores compuestos reales; axe deja casos `incomplete` para revisión. Objetivo táctil de producto 44 px; criterio AA de targets 24 px con sus excepciones.
7. Registrar fallos/pendientes con el paso mínimo, evidencia redactada y responsabilidad; una suite verde no cierra esta revisión.

## Regresiones de datos y validación

Este cambio no modifica DB/RLS/RPC, tipos de DB ni la métrica. Cuando se modifiquen, ejecutar las integraciones por rol y pgTAP correspondientes, negativos V1–V6/R1 y batería SQL↔core; regenerar tipos. Los E2E UI no sustituyen esos gates.

## Evidencia y resultados — 2026-10-05

Base: `07e5bb9a53b93e2f5f5f7535687a639450e87b65`. Chromium de Playwright 1.63.0, macOS arm64, Next 16.2.10, axe 4.13.0, Supabase local. Toda evidencia corresponde a fixtures sintéticos; no se usaron cuentas reales.

Antes: la base no tenía runner Playwright/axe ni este método persistente; Next no desactivaba los argumentos de Server Actions (hallazgo de logs documentado en #120). Después: se ejercitan login/registro reales y [los indicadores de captura](log-check-after.json) confirman peticiones ejecutadas sin argumentos, PII sintética ni JWT. No se copia el log previo con credenciales. El cambio no modifica el diseño de las pantallas, por eso las capturas documentan cobertura y estados, no un rediseño visual antes/después.

| Comprobación | Resultado |
| --- | --- |
| Playwright completo | 18 PASS en 44,3 s: 12 rápidos y 6 ampliados |
| Superficies por anchura | 11 × 320/375/768/1024/1440 px; HTTP 200, un H1, main visible, sin scroll horizontal global |
| Axe | 8 análisis; cero violaciones automáticas; casos `incomplete` registrados para revisión humana |
| Contraste | Mínimo textual observado 6,4:1. Ratios de colores renderizados en [accessibility.json](accessibility.json); no se cuentan como PASS los casos `incomplete` |
| Reporte real | 50 filas, fixture canónico 77.8 %, tablas contenidas y zoom CSS 200 % |
| Vitest web | 821 PASS, 81 integraciones opt-in omitidas |
| Vitest core | 150 PASS |
| Typecheck web/core | PASS |
| Build web | PASS; aviso preexistente middleware → proxy |
| Diff y auto-revisión | Acotados al cambio; `git diff --check` PASS |

La primera ejecución de Vitest tuvo un fallo intermitente en `profile-form.test.tsx` al retirar la preview tras «Foto guardada». La repetición completa pasó sin modificar perfil ni su prueba. Se conserva esta incertidumbre; no se afirma haber reparado la causa.

Capturas seleccionadas revisadas visualmente: [ADMIN 375](admin-375.png), [GUARDIAN 375](guardian-375.png), [asistencia 320](attendance-320.png), [reportes 768](reports-768.png), [suscripción 1440](billing-1440.png), [reporte con zoom CSS 200 %](reports-css-zoom-200.png). Asistencia conserva una captura de viewport; los demás casos capturan la página completa. Los artefactos restantes se regeneran con `test:e2e:full` y permanecen fuera de Git.

**Pendiente para el gate final de la épica:** pasada humana con lector de pantalla y zoom nativo 200 %, revisión de los casos axe incompletos, foco/contraste no textual exhaustivo y combinaciones de estados/roles indicadas en la matriz. Los E2E comprueban teclado en Chromium automáticamente; no equivalen a haber escuchado VoiceOver/NVDA. No se ejecutaron cobros reales, invitaciones por email/Edge ni la cadena completa de alta/consentimiento/serie. Esos recorridos quedan explícitos para completar al cierre; las superficies existentes sí se capturan. DB/RLS/RPC no cambiaron: pgTAP, regeneración de tipos e integraciones opt-in no se ejecutaron en esta rama.

Referencias: [Next logging](https://nextjs.org/docs/app/api-reference/config/next-config-js/logging), [Playwright accesibilidad](https://playwright.dev/docs/accessibility-testing), [contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [targets](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [diálogos](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).


## Seguimiento de la épica #100

La [pasada adicional del 05-10-2026](../issue-100/README.md) completa recorridos técnicos que esta evidencia histórica dejó pendientes. Incluye los límites restantes y el guion humano. El runner actual también omite URLs con query e invitaciones en los logs de desarrollo, y permite reutilizar explícitamente el servidor supervisado con `ASISTEAM_QA_REUSE=1`. Los resultados anteriores se conservan como registro de #120.
