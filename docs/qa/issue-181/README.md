# UI-11 · Regresión visual y accesible del rediseño (#181)

[Seguro] Base `develop@2349c3f358c7f65e150676979ba459a0cbf54134`, 13-10-2026. UI-04…UI-10 (#174–#180) están integradas. Se usa el artefacto React19/Vite7/Router7, Nest/Node24 y PostgreSQL17/S3 sintéticos locales. Se conservan 39 destinos, roles por membresía, V1–V6/R1 y el canon SQL/core. Producción continúa NO-GO.

[Seguro] Esta entrega amplía la matriz automatizada y prepara una sesión humana reproducible. La aceptación de #181/#170/#100/#209 sigue **PENDIENTE** hasta recibir lector escuchado, zoom nativo y prueba en teléfono de 20 deportistas a una mano. PASS técnico no cierra esos criterios. No se ejecutan deploy/corte, pagos, correo/push externo ni receptores remotos.

## Cambio y hallazgo reproducido

[Seguro] La matriz general de `qa.spec.ts` pasa a **320/375/768/1024/1440/1536 px**. Cada una de sus 11 superficies reales verifica H1/main, overflow, axe y captura enmascarada. No se eliminan recorridos anteriores. `redesign-final.spec.ts` agrega las seis anchuras para ADMIN/COACH/ATHLETE/GUARDIAN/ADMIN+ATHLETE con nombres largos, tablas ADMIN, paneles propios/pupilos, toggles apagados, CTA ≥44×44 y movimiento reducido.

[Seguro] `redesign-fixture.mjs` crea 20 ATHLETE ACTIVE: 17 adultos MANAGED, ATHLETE, ADMIN+ATHLETE y un pupilo menor con vínculo y consentimiento vigentes. Otro menor PENDING sin consentimiento queda fuera de la nómina. Diez registros 6 PRESENT/1 LATE/2 ABSENT/1 EXCUSED producen **77,8 %**; los otros diez permanecen sin marcar. Un grupo ADMIN separado sin actividades comprueba vacío/null. Fechas relativas al reloj local, visualizadas en Chile; ningún nombre/conteo de referencia es fallback de producto.

[Seguro] La primera corrida detectó overflow de 399 px con viewport 320: `ActionLink` contenía texto sin espacios de 350 px dentro de una caja de 222 px. Se añade `overflow-wrap:anywhere` al enlace compartido para ajustar su nombre completo, conservando foco/destino/target. [Antes](overflow-before-320.png) y [comparación anotada](comparison.html) documentan el caso y el dashboard conectado. La repetición específica pasó los cinco perfiles, sin omisiones/reintentos.

## Matriz de evidencia y límites

| Criterio | Verificación reproducible | Límite |
| --- | --- | --- |
| Seis anchuras/nombres largos | UI181: 5 perfiles × 6; matriz general: 11 superficies × 6; layout/axe por celda | Chromium/macOS; no todas las combinaciones de 39 destinos |
| Composición desktop/móvil | Capturas de producto y comparación #170/#171 | Referencia/contrato estático son antecedentes fechados, no producto previo |
| Carga/error/reintento | Suite nativa/fallos de transporte: demora/recuperación manual; errores secundarios UI04 | No se sustituyen fallos por cero ni se acredita backend externo |
| Vacío/null/sin resultados | Grupo sin actividades, búsqueda de nómina y reportes canónicos | «Sin datos» nunca 0 %/100 % |
| Procesando/disabled/guardado/offline | qa.spec: pausa POST, Guardando/bloqueo/persistencia, rollback/desconexión/recarga | Sin cola offline ni envío automático al reconectar |
| Roles/cambio de grupo | UI181/UI05/smoke: unión multirol, drawer, sección autorizada | UI complementa HTTP/SQL, no sustituye autorización |
| V1–V6/R1/consentimiento | Backend SQL/HTTP, UI05 toggles/revocación y flujos nativos de menores | Fixtures sintéticos; sin migraciones/políticas nuevas |
| Teclado/foco/tablas | Drawer Tab/Shift+Tab/Escape/retorno, foco visible, tabla con scroll local, lote | Lector escuchado y revisión exhaustiva siguen humanos |
| Contraste/targets | Axe por superficie/perfil; símbolo/borde/target en accessibility-final; CTA UI181 ≥44×44 | Incomplete se conserva; no certifica WCAG ni todo contraste no textual |
| Reflow/movimiento | Layout 320, reflow 720 y zoom CSS 200 %, media query reduce | No sustituye zoom nativo 200 % ni ajuste del SO |
| Cancha 20/<60 s | Fixture 20 y protocolo humano abajo | PENDIENTE: persona representativa/teléfono/una mano |

[Seguro] [validation.json](validation.json) registra correspondencia CI/resultados; [accessibility.json](accessibility.json) conserva rutas sin queries/tokens, anchuras, violaciones, incomplete y muestras de contraste. No se versionan logs crudos/sesiones/payloads/HTML de formularios ni reports Playwright completos. Las capturas enmascaran SVG/QR, emails/contraseñas, output y enlaces de invitación con el helper vigente. La máscara magenta es del harness.

## Reproducción del CI aplicable

```sh
CI=true corepack pnpm install --frozen-lockfile
corepack pnpm ci:checks
corepack pnpm ci:backend
node scripts/ci/probe.mjs
corepack pnpm ci:staging
corepack pnpm ci:extended
corepack pnpm ci:qualification
```

[Seguro] `.github/workflows/ci.yml` aplica a todo PR: checks, backend+probe, staging y extended → qualification → required. Runtime Node24.16.0/pnpm10.33.2. Los scripts canónicos ejecutan instalaciones/builds/servicios/combinaciones completos, con cero omisiones permitidas. `extended.yml` semanal/manual no agrega jobs al evento PR. Staging/rollback es ensayo Docker propio local; CI remoto se consulta en el PR.

[Seguro] La prueba focal se reproduce con `corepack pnpm --filter @asisteam/web test:e2e:full redesign-final.spec.ts`, tras build. CI extended la incluye sin opt-in adicional. El fixture es idempotente dentro del servidor supervisado y conserva marcas. `localConfig()` exige contenedor `asisteam-native-*` y API loopback; no se preparan datos en bases externas.

## Sesión humana pendiente · continuidad de #100

[Seguro] Los comandos históricos Next/Supabase de #100/#120 corresponden a aquel corte. Para este stack, abrir dos terminales desde `apps/web`, después de build/instalación:

```sh
# Terminal 1: mantiene Nest/PostgreSQL/artefacto propios vivos.
node e2e/regression/server.mjs
# Terminal 2: prepara únicamente el fixture en la DB validada del servidor.
node e2e/regression/redesign-fixture.mjs
```

[Seguro] El segundo comando muestra rutas de grupo/asistencia/pupilo sin credenciales. Cuentas exclusivamente sintéticas en `e2e/regression/data.mjs`. Ingresar en `http://127.0.0.1:3120/login`. No ejecutar otra suite durante la sesión: cada runner usa una DB efímera que termina con su servidor. Al finalizar Ctrl+C limpia solo su contenedor propio.

1. [Seguro] Registrar fecha/commit/SO/navegador/versión/lector; activar VoiceOver o NVDA y **escuchar** login/errores, landmarks, salto, drawer, foco/retorno y nombre/estado de controles.
2. [Seguro] Usar las rutas emitidas: ADMIN en inicio/asistencia/reportes; GUARDIAN en pupilo. Escuchar selección/guardado y cabeceras/celdas. Confirmar exclusión del menor PENDING; recorrer perfiles/cambio de grupo.
3. [Seguro] Aplicar **zoom nativo 200 %** y movimiento reducido del SO. Revisar nombres completos, controles/foco/scroll local. Resolver cada incomplete de axe con resultado humano, sin marcar PASS por ausencia de violaciones.
4. [Seguro] Con acceso local supervisado aprobado para teléfono real, una persona representativa toma asistencia a 20 deportistas con estados mixtos/corrección a una mano. Registrar segundos (objetivo <60), errores/dispositivo. Loopback no proporciona acceso al teléfono por sí solo; no se expone/publica automáticamente.
5. [Seguro] Registrar `paso — PASS/FAIL/PENDIENTE — commit/entorno/rol/fixture — observación — evidencia`; añadir segundos/errores de cancha. Fallos bloquean aceptación hasta corregir/repetir. No sustituir experiencia humana por Playwright.

[Seguro] Lector, zoom nativo, foco/contraste exhaustivo y cancha: **PENDIENTE**, vinculado a [#100](../issue-100/README.md), #181/#209. Implementación/capturas permiten revisión; no autorizan cierre ni producción.

## Resultados locales finales

| Workflow/check | Resultado del comando canónico |
| --- | --- |
| CI/checks | [Seguro] PASS: 14: lint/contrato/tipos/build/artefacto; core 154/web 503, cero omisiones |
| CI/backend | [Seguro] PASS: 16: SQL 40 suites/1646 aserciones, guards nativas, integraciones 84, API/Worker/backup/PITR/portabilidad |
| CI/backend · probe | [Seguro] PASS: cuatro fallos inyectados detectados; fuentes temporales restauradas |
| CI/staging | [Seguro] PASS: 53 registros: roles, artefactos API/web, rollback explícito/automático y limpieza Docker propia |
| CI/extended | [Seguro] PASS: 111, 68 nativos+42 paridad+1 transporte, cero omisiones/flaky |
| CI/qualification / required | [Seguro] PASS técnico: cinco jobs locales reconciliados; CI remoto se consulta tras publicar |

[Seguro] Carga sintética del gate general: 500 ATHLETE/5000 registros, 8 celdas/192 peticiones, p95 máximo 86,7 ms. Bundle inicial 200272 bytes gzip, presupuesto PASS. Estas mediciones no son un benchmark de cancha ni aceptación externa.

[Seguro] La matriz nativa conserva 307 análisis axe, cero violaciones, y cuatro tipos incomplete: `aria-prohibited-attr`, `aria-valid-attr-value`, `color-contrast`, `th-has-data-cells`. Las filas de [accessibility.json](accessibility.json) mantienen los selectores/checks que requieren revisión; no se declaran PASS humano. [Fallos iniciales](initial-failures.json) documenta el overflow y la repetición sin relajar layout/axe.

| Perfil/estado | 375 px | 1440 px |
| --- | --- | --- |
| ADMIN | [Captura](ui181-admin-375.png) | [Captura](ui181-admin-1440.png) |
| COACH | [Captura](ui181-coach-375.png) | [Captura](ui181-coach-1440.png) |
| ATHLETE | [Captura](ui181-athlete-375.png) | [Captura](ui181-athlete-1440.png) |
| GUARDIAN | [Captura](ui181-guardian-375.png) | [Captura](ui181-guardian-1440.png) |
| ADMIN+ATHLETE | [Captura](ui181-multi-375.png) | [Captura](ui181-multi-1440.png) |
| Nómina 20 | [Captura](ui181-attendance-20-375.png) | — |
| Vacío/null | [Captura](ui181-empty-null-375.png) | — |

[Seguro] [ADMIN 1536](ui181-admin-1536.png) y [ATHLETE 320 después](ui181-athlete-320.png) completan la comparación. Revisión visual: nombres ajustan, texto/CTA siguen completos, tabla se desplaza localmente, variantes propias/pupilos no muestran tabla ADMIN y null se presenta «Sin datos». Las máscaras protegen SVG; no acreditan iconografía/QR físicos.

[Seguro] Auto-revisión limitada al diff de #181 y sus efectos: sin hallazgos introducidos pendientes. Los hashes de validation identifican fuentes/documentos/capturas finales; los reports del runner señalan HEAD de base más este diff. Tras consolidar evidencia se repiten checks y qualification; no hay cambio adicional de producto ni de contratos/SQL. No se cierra #181/#100 ni se realiza merge/despliegue.
