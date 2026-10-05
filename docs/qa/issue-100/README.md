# QA de cierre técnico — épica #100

Fecha: **05-10-2026**. Base: `1329031fab90a684048c3d49dc0ccbcc4f8c90aa`; cambios de la rama `codex/100-completar-qa`. Entorno: macOS arm64, Chromium de Playwright 1.63.0, Next 16.2.10, axe 4.13.0 y Supabase/Docker locales. Solo fixtures sintéticos.

**Estado de la épica: PENDIENTE.** La verificación técnica adicional no sustituye la pasada humana con lector de pantalla, zoom nativo y asistencia a una mano. El usuario aceptó realizar la prueba guiada; todavía no se recibió el resultado. Tampoco se afirma despliegue ni certificación WCAG.

## Cambios y evidencia

- El reintento de `ErrorState` ahora hace `router.refresh()` además de `reset()`, con botón ocupado. Antes, tras recuperar el backend, `reset()` volvía a mostrar la respuesta fallida. La prueba de fallo de transporte reproduce el caso y verifica su recuperación.
- Se corrigen nombres accesibles sobre contenedores genéricos: grupos de acceso social, métodos de invitación, preview de logo y resumen de suscripción. El código de invitación se presenta mediante `output` etiquetado.
- Los logs de desarrollo omiten peticiones con query e invitaciones con token en el path; se conserva la protección de argumentos de Server Actions. El runner registra únicamente indicadores sanitizados. Esto no certifica los logs del hosting o de proveedores externos.
- Se amplía Playwright con recorridos reales de Auth/Edge/Postgres, estados de carga/error y revisión de los resultados incompletos de axe. Se conservan RLS, constraints, reglas de negocio y métrica; no hay migraciones.
- Las integraciones antiguas ahora invocan la CLI local y preparan capacidad legacy explícita, limitada a sus grupos sintéticos. Los flujos nuevos usan suscripciones sintéticas. La limpieza de integraciones está limitada a sus fixtures únicos; los fixtures E2E permanecen disponibles para revisión. Ninguna prueba usa staging/producción.
- Se corrige una carrera de la prueba de perfil: espera el efecto que retira la preview tras subir la foto, sin cambiar el comportamiento del perfil. La espera se valida junto con las pruebas existentes.

Capturas revisadas a 375 px: [error del servidor](server-error.png) y [página recuperada](server-recovered.png).

Resultados seleccionados: [checks.json](checks.json), [accesibilidad](accessibility.json), [privacidad de logs](log-check.json). Los reportes completos, tokens y sesiones no se versionan.

## Resultados finales

| Verificación | Resultado |
| --- | --- |
| Playwright | 33 PASS, 0 omitidas, 0 reintentos, 78.4 s |
| Fallo de transporte y recuperación | 1 PASS, 17.1 s |
| Axe | 40 análisis, 0 violaciones automáticas; dos clases de `incomplete` revisadas abajo |
| Vitest web | 821 PASS; 81 integraciones omitidas en este comando y ejecutadas aparte |
| Integraciones de módulos | 81 PASS, 0 omitidas |
| Vitest core / pgTAP | 150 PASS / 1.487 PASS en 33 archivos SQL |
| Typecheck web/core | PASS |
| Build web | PASS antes de los últimos ajustes de semántica HTML; aviso preexistente middleware → proxy. Los ajustes posteriores tienen comprobaciones de tipos, componentes y E2E. |
| Lector, zoom nativo, prueba a una mano | PENDIENTE |

## Matriz adicional sobre #120

| Recorrido | Evidencia técnica | Resultado / límite |
| --- | --- | --- |
| Acceso e invitación | Registro nuevo, condiciones versionadas, invitación real por Edge, rechazo de cuenta ajena, replay y vencimiento; recuperación real y URL limpia | PASS local; emisión sintética mediante RPC, sin entrega externa de correo ni OAuth de proveedor |
| Menor por código | PENDING, aprobación bloqueada sin vínculo/consentimiento, vínculo por ADMIN, consentimiento GUARDIAN, aprobación posterior | PASS; no se omite R1 |
| MANAGED | Alta UI, consentimiento del apoderado, membresía ACTIVE con cuenta MANAGED sin Auth | PASS |
| Actividad recurrente | Creación de tres ocurrencias y edición de serie preservando la que tiene asistencia | PASS |
| Asistencia | Nóminas 0/1/50/500, búsqueda/paginación; lote conserva un ABSENT previo y marca 499 PRESENT; teclado, guardando, offline/rollback y recarga | PASS técnico; 20 deportistas/<60 s a una mano PENDIENTE |
| Historial y reportes | ATHLETE/GUARDIAN ven lo propio con toggles apagados; 77.8 %, sin filas ajenas; integración negativa de visibilidad | PASS técnico; lectura de tablas con VoiceOver/NVDA PENDIENTE |
| Anuncios | Publicar/editar, conservar borrador ante desconexión y lectura GUARDIAN sin edición | PASS; sin entrega externa de push |
| QR | Token correctamente firmado pero vencido, recuperación con token válido, segundo escaneo idempotente | PASS local; sin publicar tokens |
| Perfil | Validación/foco y confirmación nativa de descarte sin persistir | PASS técnico; lector PENDIENTE |
| Billing | Cancelación de confirmación con Escape/retorno del foco; tests de selección, cupos y contratos | PASS local; sin cobros ni checkout de proveedor |
| Carga/error global | Demora real del transporte, skeleton, error 503, reintento tras recuperación, recurso ajeno 404 | PASS; proxy aislado en otro proceso |
| Responsive | 11 superficies × 320/375/768/1024/1440; rutas secundarias a 320; cinco roles y teclado | PASS en Chromium; no es todas las combinaciones de rutas/roles/estados |
| Zoom y movimiento | Zoom CSS 200 % y preferencia reduced-motion en pruebas | PASS técnico; zoom nativo 200 % y ajuste del SO PENDIENTES |

El inventario continúa en [doc 05](../../05-pantallas.md): 39 páginas después de #107. La decisión de alcance de #121 se conserva; CSV, Expo y otros huecos históricos no se implementan por inferencia. Todas las intervenciones #101–#121 estaban cerradas al revisar #100, pero eso no demuestra la aceptación humana de esta matriz.

## Revisión de accesibilidad

Axe no certifica WCAG. Se conservan análisis por ruta y viewport, sin HTML ni valores de formularios. Las transiciones finitas terminan antes de medir colores; no se deshabilitan reglas ni se ignoran violaciones.

| Hallazgo | Disposición |
| --- | --- |
| `aria-prohibited-attr` en `div` genérico / párrafo del código | Corregido con semántica apropiada; análisis de acceso, invitación y ajustes repetidos. Resumen de billing cubierto por tests de componente; su estado de checkout externo no se ejerce. |
| `aria-valid-attr-value` del disparador Menú | Referencia comprobada al `dialog` existente pero oculto. Apertura, análisis axe abierto, Escape y retorno de foco verificados. Se conserva el registro `incomplete` del estado cerrado. |
| `color-contrast` en ✓ de PRESENT | Símbolo no textual, `aria-hidden`, estado anunciado por nombre del botón y `aria-pressed`. Contraste renderizado de símbolo y borde 6.49:1; objetivo observado 76.25 × 44 px. Se conserva el registro `incomplete` y la medición. |
| Foco / otras superficies | Foco visible y outline ≥2 px comprobados en el recorrido de asistencia. No se infiere una auditoría exhaustiva de cada control a partir de esa muestra. La revisión humana final sigue abierta. |

## Reproducir

Requiere dependencias instaladas, Docker y Supabase local iniciado. Ejecutar las suites en secuencia; no ejecutar `next build` mientras el servidor QA está activo: limpia subdirectorios de `.next`. Los reportes temporales también pueden borrarse; copiar solo evidencia sanitizada tras la pasada.

Desde la raíz:

```sh
corepack pnpm exec supabase start
# Terminal 1. Secreto exclusivamente sintético; no reutilizar fuera del entorno local.
cat > /tmp/asisteam-qa100-edge.env <<'ENV'
INVITATION_PROXY_SECRET=qa100-local-synthetic-proxy-secret-only
INVITATION_ALLOWED_ORIGINS=http://127.0.0.1:3120
ENV
corepack pnpm exec supabase functions serve accept-invitation --env-file /tmp/asisteam-qa100-edge.env
```

Terminal 2, desde la raíz:

```sh
export INVITATION_PROXY_SECRET=qa100-local-synthetic-proxy-secret-only
corepack pnpm --filter @asisteam/web test:integration:modules
corepack pnpm exec supabase test db
corepack pnpm --filter @asisteam/core test
corepack pnpm --filter @asisteam/core typecheck
corepack pnpm --filter @asisteam/web exec vitest run --maxWorkers=2
corepack pnpm --filter @asisteam/web typecheck
corepack pnpm --filter @asisteam/web build
RUN_INVITATION_E2E=1 corepack pnpm --filter @asisteam/web test:e2e:full
corepack pnpm --filter @asisteam/web test:e2e:faults
```

Sin `RUN_INVITATION_E2E=1`, las dos pruebas Edge se omiten explícitamente. No registrarlas como PASS. El runner de fallos usa 3130/54330 y requiere los fixtures creados por la suite normal. No modifica la DB para simular errores. El runner de integraciones requiere el mismo secreto que el runtime Edge; no envía correo real ni pagos.

Para conservar un servidor de revisión humana (terminal separada, desde `apps/web`):

```sh
INVITATION_PROXY_SECRET=qa100-local-synthetic-proxy-secret-only node e2e/server.mjs
# Otra terminal, también en apps/web:
node e2e/manual-fixture.mjs
```

`ASISTEAM_QA_REUSE=1` permite ejecutar Playwright contra ese servidor explícitamente supervisado. Las invitaciones usan una IP de documentación sintética distinta por prueba para aislar el presupuesto de intentos; el rate limit real permanece activo. El fixture manual de 20 personas no se toca en las suites automáticas.

## Guion humano pendiente

Entrar en `http://127.0.0.1:3120/login` con la cuenta ADMIN sintética de `apps/web/e2e/data.mjs`. Registrar navegador/versión, SO, lector/versión, fecha y resultado de cada paso. No usar datos ni cuentas reales.

1. Activar VoiceOver (macOS: ⌘F5) o NVDA. Escuchar etiquetas y errores al enviar login vacío; recorrer landmarks, salto de contenido y menú con Tab/Shift+Tab, Enter y Escape.
2. Abrir `/groups/01200000-0000-4000-8000-000000006000/activities/01200000-0000-4000-8000-000000006002/attendance`. Escuchar nombre, estado seleccionado y guardado de una fila. Abrir/cancelar «Marcar todos» y comprobar retorno del foco. Comprobar que el foco no queda oculto.
3. Abrir `/groups/01200000-0000-4000-8000-000000000003/reports?period=season`. Recorrer caption/cabeceras/celdas con el lector. Usar **zoom nativo del navegador al 200 %**; comprobar controles, texto y desplazamiento contenido de tabla. Repetir con movimiento reducido del SO.
4. En `/profile`, editar nombre sin guardar; cancelar salida y luego descartarla con teclado. Escuchar el diálogo/feedback y comprobar que conserva o descarta según la decisión.
5. En un teléfono real, una persona representativa toma asistencia a **20 deportistas**, usando estados mixtos y una corrección, a una mano. Registrar tiempo, errores y dispositivo; objetivo <60 s. La emulación 375 px en escritorio puede preparar el guion, pero no sustituye este paso. El servidor loopback actual necesita un acceso local supervisado apropiado para el dispositivo antes de hacer la prueba real.

Formato de resultado: `paso — PASS/FAIL — navegador/dispositivo/lector — observación; tiempo del paso 5`. Si aparece un fallo, registrar el paso mínimo y corregirlo antes de cerrar. No hay resultados humanos inventados en esta entrega.

## Incidencias de ejecución

Las primeras corridas detectaron fixtures antiguos sin capacidad, acumulación del límite local de invitaciones, un pupilo desplazado a otra página por nuevos fixtures, una aserción de desmarcado con texto equivocado y medición axe en mitad de una transición. Se corrigieron fixtures/esperas sin relajar los contratos del producto. Una ejecución Vitest simultánea con E2E/typecheck agotó el tiempo de la prueba de lote de 1.000 personas; se repitió en secuencia con dos workers. Los resultados finales y las limitaciones se registran por separado.

No hay script lint ni workflow CI versionado. El build mantiene el aviso preexistente de Next sobre `middleware` → `proxy`. No hay cambios DB/RLS ni tipos que regenerar.
