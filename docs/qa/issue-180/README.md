# UI-10 · Anuncios, suscripción y QR

[Seguro] Implementación de #180 sobre `develop@b9f0c9ed30cf6ecc2639fe7fd6d0d3f3b28631e6`, 13-10-2026 America/Santiago. Rama `codex/180-anuncios-suscripcion-qr`; dependencias #171/#172 cerradas. Graphify actualizado sobre esa base (3457 nodos/183906 aristas) identifica las rutas React y sus componentes vigentes; las referencias Next del issue son históricas.

[Seguro] El muro comparte PageHeader y ancho 1280 px sin duplicar márgenes del shell. Lectura y paginación preceden gestión/avisos en DOM y móvil; desde xl usa 7:4 con panel contextual mínimo 320 px. Tarjetas editoriales conservan texto completo, párrafos, fechas Chile y ajuste de palabras largas. Publicación/edición ADMIN conservan borrador, versiones y pausa del refresco; opt-in continúa global, sin push de navegador ni app móvil implementada.

[Seguro] Billing presenta resumen de contrato/capacidad/renovación, verificación y planes con las superficies canónicas. Planes finitos 50/200/1000, primer pago backend, comparación/selección/correo/confirmación, reserva incierta y cancelación conservan sus reglas. La tabla de cobros tiene región nombrada/enfocable, ancho mínimo 600 px, números tabulares, cabecera neutral y filas de 24 px de padding vertical. El retorno `status=approved` no altera el ledger ni cupos.

[Seguro] ASI-04 usa PageHeader y superficie QR blanca con SVG local negro/blanco, margen de 4 módulos y tamaño objetivo 280 px adaptable. Instrucciones y contador aparecen debajo en móvil y al lado desde md; los segundos continúan fuera de regiones vivas. Ajustes siguen plegados y guardan solo al enviar. Llegada usa tarjeta de 672 px, sin token en enlaces/historial/storage; conserva login en memoria, registrando, confirmación, registro previo, vencido, no disponible y reintento manual. Se mantienen firma/caducidad/idempotencia y permisos ADMIN/ATHLETE propios.

## Reproducción y correspondencia CI

```sh
CI=true corepack pnpm install --frozen-lockfile
corepack pnpm ci:checks
corepack pnpm ci:backend
node scripts/ci/probe.mjs
corepack pnpm ci:staging
corepack pnpm ci:extended
corepack pnpm ci:qualification
```

[Seguro] `.github/workflows/ci.yml` aplica a todo PR sin filtros: checks/backend+probe/staging/extended/qualification y agregación required. Extended QA semanal/manual no se dispara por PR y usa el mismo runner extended. Runtime local Node 24.16.0/pnpm10.33.2, Chromium y fixtures propios Nest/PostgreSQL 17/S3 sintéticos. Los permisos de red/sockets/Docker permiten ejecutar los scripts vigentes; no se altera CI. Staging/rollback es ensayo Docker local, no despliegue externo.

## Matriz específica y límites

[Seguro] `capabilities-ui.spec.ts` pasa 3 escenarios, cero omisiones/flaky, con 320/375/720/1440 px: destino del último anuncio del grupo, texto/párrafos/orden de lectura, cinco roles del muro, preferencias con móvil pendiente; retorno de pago ignorado y catálogo finito; tabla enfocada y scroll contenido a 320/375; QR negro/blanco y tamaño renderizado ≥200 px; abrir ajustes con teclado sin cambios en DB; registro único, previo, vencido y procesando/fallo/reintento. Verifica acciones visibles ≥44 px de alto en muro/QR/reintento, H1/main, ausencia de overflow y axe.

[Seguro] La tabla con dos cobros usa una respuesta HTTP sintética sobre el DTO validado para probar presentación; no escribe ni acredita pagos. El resto de la matriz consulta Nest/PostgreSQL reales locales. Las suites backend de billing prueban conciliación, firmas, estados e historial con transporte MP sintético; la matriz nativa vigente conserva gestión/cola de anuncios, retorno billing, login/caducidad QR y permisos. Las pruebas unitarias cubren vencimiento/renovación/pestaña oculta, reescaneo, recuperación y guardado explícito.

[Seguro] Primera ejecución de checks falló por una aserción de precio que esperaba un único nodo, ahora dividido visualmente entre importe/moneda. Se conserva el mismo importe comprobando el artículo Academia. La primera matriz usó el prefijo API bearer en vez de `/web-api/v1/` cookie; la segunda asumía scroll obligatorio a 720 px, donde 600 px caben. Se corrigieron ambos fixtures sin cambiar producto ni retirar aserciones de contenido/scroll móvil. [Fallos iniciales sanitizados](initial-failures.json).

[Seguro] Auto-revisión limitada al diff de #180: loaders/actions/DTO/RPC/RLS/auth no cambian. No se agregan destinos ni funcionalidades, ni se requieren migraciones/tipos DB. 39 destinos conservados. Axe sin violaciones no acredita WCAG; los casos incomplete se conservan en [accessibility.json](accessibility.json). 720 px es reflow aproximado de 1440/2, no zoom nativo. Lector escuchado, zoom real 200 %, teléfono/cámara reales y aceptación humana #100/#181/#209/externa siguen pendientes. Producción NO-GO; sin corte/deploy real ni cierre del issue.

## Capturas sintéticas

[Seguro] Las 14 capturas 375/1440 están enmascaradas mediante el helper existente: ningún QR/token, email/contraseña ni URL sensible se publica. La máscara magenta pertenece al harness, no a la paleta. El color y tamaño reales del SVG se comprueban en DOM antes de capturarlo.

[Seguro] Revisión visual de las 14 capturas: tarjetas/editorial, tres planes/cupos y tabla enfocada/scroll local, QR principal con contador/instrucciones y ajustes secundarios, llegada previa/vencida/procesando/fallo mantienen lectura y ajuste. Los 29 análisis específicos de axe no tienen violaciones; conservan `aria-valid-attr-value` y `color-contrast` incomplete, con 911 muestras de contraste automático. La máscara impide publicar el QR real; negro/blanco y tamaño se comprobaron en DOM. No equivale a lectura física mediante cámara ni aceptación humana.

|Ruta/estado|375 px|1440 px|
|---|---|---|
|Muro|[Captura](ui180-wall-375.png)|[Captura](ui180-wall-1440.png)|
|Suscripción|[Captura](ui180-billing-375.png)|[Captura](ui180-billing-1440.png)|
|Cobros · DTO sintético|[Captura](ui180-invoices-375.png)|[Captura](ui180-invoices-1440.png)|
|QR enmascarado|[Captura](ui180-qr-375.png)|[Captura](ui180-qr-1440.png)|
|Registro previo|[Captura](ui180-receipt-375.png)|[Captura](ui180-receipt-1440.png)|
|Vencido|[Captura](ui180-expired-375.png)|[Captura](ui180-expired-1440.png)|
|Registrando|[Captura](ui180-registering-375.png)|—|
|Fallo/reintento|[Captura](ui180-retry-375.png)|—|

## Gates finales de la entrega

|Correspondencia workflow|Comando local|Resultado|
|---|---|---|
|CI/checks|`corepack pnpm ci:checks`|PASS: lint, contratos, tipos/builds/artefacto, 154 core/503 web, API/Worker/SDK; cero omisiones.|
|CI/backend|`corepack pnpm ci:backend`|PASS: 40 suites/1646 SQL, 50 guards nativas, 84 integraciones de producto, backup/PITR/portabilidad/OAuth; fallo inyectado esperado.|
|CI/backend · probe|`node scripts/ci/probe.mjs`|PASS: cuatro fallos controlados SQL/tipos/retiro detectados; fuentes temporales restauradas.|
|CI/staging|`corepack pnpm ci:staging`|PASS: 53 registros, artefactos API/web, rollback explícito/automático, roles/privacidad/limpieza en Docker local.|
|CI/extended|`corepack pnpm ci:extended`|PASS: 62 nativos +42 paridad Vite +1 transporte; cero omisiones/flaky.|
|CI/qualification|`corepack pnpm ci:qualification`|PASS técnico: 500 ATHLETE/5000 registros, 8 celdas/192 peticiones, p95 máximo84.25 ms; bundle gzip200277 bytes, presupuesto PASS.|
|CI/required|Agregación de los cinco jobs|Todos los resultados locales PASS; CI remoto pendiente al crear PR.|

[Seguro] [Validation.json](validation.json) registra resultados sanitizados, correspondencia exacta del workflow y SHA-256 de fuentes/documentación/capturas finales. Las 14 capturas de la matriz completa coinciden con las revisadas. Tras los gates solo se finalizó evidencia documental; lint y `git diff --check` finales PASS. Auto-revisión limitada al diff y sus efectos, sin hallazgos introducidos pendientes. CI remoto se consultará en el PR y no se deduce de local; aceptación humana/externa y producción NO-GO siguen pendientes.
