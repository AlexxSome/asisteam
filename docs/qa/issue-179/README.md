# UI-09 · Grupos, primer uso, perfil y acceso

[Seguro] Implementación de #179 sobre `develop@844be5667c7398d43e7ca09398f7f3e5d2640898`, 13-10-2026 America/Santiago. Rama `codex/179-grupos-perfil-acceso`; dependencias #171/#172/#175 cerradas. Graphify actualizado (3443 nodos/177268 aristas) y grafo acotado de rutas (123 nodos/675 aristas) identifican los módulos vigentes React Router; las referencias Next del issue son históricas.39 destinos conservados.

[Seguro] Se extiende UI-01: listas1280 px, formularios672 px, tarjetas/roles/identidad y agenda existente; primer uso conserva cupos/primer pago, R1 y actor de cada paso. Cabecera pública y soporte usan AuthPage sin sidebar, avisos informados y destinos de acceso actuales. El aviso también se sirve como HTML estático sin JS; su generador toma los tokens canónicos del CSS. Perfil conserva datos/foto independientes, previews/errores, corrección de edad y canales manuales de privacidad. No se cambia HTTP/SQL/RLS/auth ni aceptación legal. Join/invitación reutilizan SubmissionForm para el bloqueo de envíos simultáneos; join vincula su error de validación al código y enfoca el campo.

## Reproducción y gates

```sh
CI=true corepack pnpm install --frozen-lockfile
corepack pnpm ci:checks
corepack pnpm ci:backend
node scripts/ci/probe.mjs
corepack pnpm ci:staging
corepack pnpm ci:extended
corepack pnpm ci:qualification
```

[Seguro] `.github/workflows/ci.yml` aplica a todos los PR sin filtros. Checks ejecuta ci:checks; backend ejecuta ci:backend+probe; staging ejecuta ci:staging; extended ejecuta ci:extended; qualification depende de los cuatro y required exige cinco success. Extended QA programado/manual no se dispara por PR y comparte el mismo comando. Node24.16.0/pnpm10.33.2, Chromium y fixtures locales propios Nest/PostgreSQL17/S3. El ensayo staging/rollback opera solo en Docker local; no es un deploy externo.

## Evidencia y límites

[Seguro] Matriz específica `groups-access-ui.spec.ts`: público acceso/registro/recovery/reset/aviso/invitación inválida y privado grupos/crear/join/perfil/revisión a320/375/720/1440; verifica main/H1, overflow, axe, soporte, ausencia de navegación privada, ancho del formulario, destinos/roles, identidad confirmada, error asociado/foco y canales manuales. El recorrido `public-final.spec.ts` conserva aceptación persistida en DB, bienvenida sin grupos y recuperación real, ampliando aceptación/bienvenida a esas cuatro anchuras. El CI extendido conserva recorridos de invitación/activación MANAGED/OAuth/cookies/logout, avatar/restricciones/preview/red, menor pendiente/apoderado/consentimiento y capacidades por rol.

[Seguro] La auto-revisión detectó una prueba que esperaba el enlace antiguo del grupo; ahora verifica CTA explícito y destino exacto, conservando la desaparición del contenido al expirar. Los avisos previos a aceptar siguen comprobados como dos enlaces en nueva pestaña con noopener/noreferrer. La primera matriz identificó el aviso servido sin JS y un selector de error que asumía role alert; se armonizó el generador y se comprobó el error asociado real de Field. La revisión de aceptación pendiente llevó el soporte directamente al canal mailto existente, accesible antes de aceptar, y eliminó el padding duplicado dentro de AppShell. No se eliminó caso vigente ni se alteró CI para pasar.

[Seguro] Capturas solo sintéticas y enmascaradas;720 px representa reflow aproximado de1440/2, no zoom nativo. Axe conserva resultados incomplete y no acredita WCAG. Lector escuchado, zoom real200 %, teléfono real y aceptación humana/externa #100/#181/#209 siguen pendientes. Producción NO-GO; sin corte/deploy real ni cierre del issue.

## Capturas

[Seguro] Dieciocho capturas375/1440 con fixtures sintéticos; el magenta en campos/SVG es máscara del helper de seguridad y no un token. Revisión visual de composición, ajuste/foco y pasos legales; no es aceptación humana del rediseño.

|Ruta|375 px|1440 px|
|---|---|---|
|Acceso|[Captura](ui179-login-375.png)|[Captura](ui179-login-1440.png)|
|Registro|[Captura](ui179-register-375.png)|[Captura](ui179-register-1440.png)|
|Aviso sin JS|[Captura](ui179-legal-2026-09-21-375.png)|[Captura](ui179-legal-2026-09-21-1440.png)|
|Mis grupos|[Captura](ui179-groups-375.png)|[Captura](ui179-groups-1440.png)|
|Crear grupo|[Captura](ui179-groups-new-375.png)|[Captura](ui179-groups-new-1440.png)|
|Unirme/error|[Captura](ui179-join-375.png)|[Captura](ui179-join-1440.png)|
|Perfil|[Captura](ui179-profile-375.png)|[Captura](ui179-profile-1440.png)|
|Aceptación|[Captura](ui179-terms-375.png)|[Captura](ui179-terms-1440.png)|
|Bienvenida|[Captura](ui179-welcome-375.png)|[Captura](ui179-welcome-1440.png)|

[Seguro] [Mediciones de accesibilidad](accessibility.json) conservan57 análisis específicos, cero violaciones y resultados incomplete del Menú cerrado (`aria-valid-attr-value`) y del aria-label de las fechas time de ActivityDateMark existente (`aria-prohibited-attr`), pendientes de revisión humana. Se conserva evidencia acotada de contraste; los valores son observaciones automáticas, no certificación WCAG. Los resultados finales y hashes se registran en validation.json. El CI remoto debe consultarse en el PR y no se infiere de local.

[Seguro] [Fallo conservado del gate backend](backend-initial-failure.json): la primera ejecución pasó84/84 integraciones de producto; una repetición posterior devolvió503 `service_unavailable` al registrar una invitación de apoderado (83/84). El adaptador/backend de ese caso no fue modificado por UI-09. La repetición completa secuencial posterior pasó84/84 sin alterar tests ni backend. El fallo queda conservado; su causa no fue demostrada y no se atribuye por inferencia a la carga concurrente. La publicación se basa en los gates finales, no en ocultar esta ejecución fallida.


## Gates de la entrega UI-09 inicial

|Correspondencia workflow|Comando local|Resultado|
|---|---|---|
|CI/checks|`corepack pnpm ci:checks`|PASS: lint, contratos, tipos/builds/artefacto, 154 core/501 web, API/Worker/SDK; cero omisiones.|
|CI/backend|`corepack pnpm ci:backend`|PASS: 40 suites/1646 SQL, 50 guards nativas, 84 integraciones de producto, backup/PITR/portabilidad/OAuth; fallo inyectado esperado detectado.|
|CI/backend · probe|`node scripts/ci/probe.mjs`|PASS: los cuatro fallos controlados SQL/tipos/retiro se detectaron; fuentes temporales retiradas.|
|CI/staging|`corepack pnpm ci:staging`|PASS: 53 registros, artefactos API/web y rollback explícito/automático, privacidad/limpieza; fallo inyectado esperado.|
|CI/extended|`corepack pnpm ci:extended`|PASS: 59 nativos + 42 paridad Vite + 1 transporte; cero omisiones/flaky.|
|CI/qualification|`corepack pnpm ci:qualification`|PASS técnico: 500 ATHLETE/5000 registros, 8 celdas/192 peticiones, p95 máximo111.35 ms; bundle gzip200267 bytes, presupuesto PASS.|
|CI/required|Agregación de los cinco jobs|Todos los resultados locales PASS; CI remoto pendiente al crear PR.|

[Seguro] [Validation.json](validation.json) registra resultados sanitizados, correspondencia del workflow y SHA-256 de23 fuentes y18 capturas finales. El contenido de producto/pruebas publicado coincide con esos hashes; después de los gates solo se finalizó documentación/evidencia. Auto-revisión final limitada al diff, sin hallazgos pendientes introducidos por UI-09. Lector/zoom nativo/teléfono, axe incomplete y aceptación externa continúan pendientes; cualificación técnica PASS conserva aceptación NO-GO.


## Corrección del CI remoto · transporte HIBP sintético

[Seguro] El run [38346903536](https://github.com/AlexxSome/asisteam/actions/runs/38346903536) aprobó checks/staging/extended, pero backend falló82/84 integraciones de producto en registro de invitación de apoderado y de una invitación emitida; qualification se omitió por dependencia y required falló. [Evidencia remota sanitizada](remote-backend-failure.json).

[Seguro] El harness de producto sustituía Resend/MercadoPago pero dejaba HIBP real; registro/reset llaman al screening de contraseñas antes de escribir. Una reproducción con red disponible pasó84/84. Al bloquear únicamente HIBP con un503 en un preload temporal, fallaron exactamente los dos registros (11/13); tras aislar HIBP en el transporte test-only pasaron13/13 con el mismo bloqueo y las mismas aserciones. [Comparación y límites](hibp-isolation.json). El artefacto remoto conserva archivos fallidos, no la excepción de red original; la prueba controlada demuestra este patrón y la dependencia externa eliminada.

[Seguro] `native-provider-transport.mjs` entrega el mismo formato sintético válido de rango que los fixtures Auth existentes, conserva correo/billing sintéticos y HTTP real hacia Nest. Dos pruebas unitarias comprueban el aislamiento aunque la red falle, el formato y el encaminamiento de cada transporte. No se altera Passwords, auth, SQL ni el CI; el test nativo sigue exigiendo503 y cero perfiles si el proveedor falla en producción. Los gates completos de esta corrección y los hashes de sus tres fuentes test-only se registran en [ci-correction-validation.json](ci-correction-validation.json).


|Gate local repetido para la corrección|Resultado|
|---|---|
|ci:checks|PASS: 154 core/503 web y todos los checks de lint/contratos/tipos/build/artefacto/API/Worker/SDK.|
|ci:backend + probe|PASS: 84/84 producto,40 suites/1646 SQL,Auth/Worker/backup/PITR/OAuth/portabilidad y cuatro fallos controlados detectados.|
|ci:staging|PASS:53 registros,artefactos API/web,rollback/roles/privacidad/limpieza en Docker local.|
|ci:extended|PASS:59 nativos +42 paridad Vite +1 transporte, cero omisiones/flaky.|
|ci:qualification|PASS técnico; aceptación externa NO-GO.|

[Seguro] Carga sintética final:500 ATHLETE/5000 registros,192 peticiones,p95 máximo 127.54 ms; bundle gzip 200267 bytes y presupuesto PASS. El CI remoto del nuevo commit se comprobará tras publicar la corrección.
