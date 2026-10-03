# Evidencia UX y accesibilidad — issue #103

Validación del 03-10-2026. Base: `e4df762728cda316712443b13fa04d41e65f3c6b`.

## Antes y después

Las capturas de asistencia y suscripción renderizan los componentes reales con datos sintéticos y acciones simuladas, sin escrituras en Supabase ni operaciones en Mercado Pago. La versión anterior de cada panel se obtuvo de `develop`; ambas usan los tokens de #102. El login final se capturó en el build de producción local.

| Pantalla (375 px) | Antes | Después |
| --- | --- | --- |
| Asistencia | [Captura](attendance-before-375.jpg) | [Captura](attendance-after-375.jpg) |
| Suscripción | [Captura](billing-before-375.jpg) | [Captura](billing-after-375.jpg) |
| Login con errores | Errores de login/registro sin `aria-describedby` | [Captura](login-after-375.jpg) |

## Comportamiento y medidas

- Antes: ambas confirmaciones anunciaban `alertdialog`, pero el foco permanecía en el disparador.
- Después: grupo inline con título y descripción; foco inicial en Cancelar/Volver, Tab puede salir, Escape cancela cuando no procesa y devuelve foco al disparador. Si este queda deshabilitado tras completar el lote, el foco pasa al resultado.
- Campos auth: label, ayuda y error conectados; el primer campo inválido recibe foco. Se preservan schemas y acciones existentes.
- Envíos: las etiquetas permanecen estables; estado loading accesible y guardas síncronas impiden repetir la operación. Se probaron fallos, reintento parcial de lotes, notas y restricciones del rol.
- Login, asistencia y suscripción: sin scroll horizontal en 320, 375, 768, 1024 y 1440 px; altura mínima de acciones 44 px. [Medidas DOM](responsive-results.json).
- Zoom nativo de Chrome al 200%: verificado en las tres pantallas con ancho efectivo de 384 px; sin scroll horizontal ni pérdida de controles. Zoom y viewport restaurados después.
- CardTitle ya soportaba h1/h2/h3 desde #102. Se conserva esa API; enlaces navegan y botones ejecutan acciones.

## Gate local

- `pnpm --filter @asisteam/web test`: 543 PASS; 76 integraciones opt-in omitidas por la configuración existente.
- `pnpm --filter @asisteam/web typecheck`: PASS.
- `pnpm --filter @asisteam/web build`: PASS.
- `git diff --check`: PASS.
- Auto-revisión limitada al diff del issue: sin hallazgos pendientes.

No se modificaron DB/RLS/RPC ni tipos generados. No existe script lint en el paquete web, ni están instaladas las skills heredadas frontend-check/frontend-ci/ship; se ejecutaron los scripts oficiales disponibles. El build emite el aviso preexistente de Next sobre middleware/proxy.

## Alcance del sistema compartido

Button/ActionLink, Input/Textarea, Field, Alert, Badge, PageHeader, EmptyState, Pagination e InlineConfirmation tienen consumidores en las pantallas migradas. Select, Checkbox/Radio/Switch, Dialog/Drawer/Menu se reservan para sus issues de módulo, donde existan consumidores reales.
