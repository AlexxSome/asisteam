# Sistema visual web

Base P0 de [#102](https://github.com/AlexxSome/asisteam/issues/102), según la dirección de la [épica #100](https://github.com/AlexxSome/asisteam/issues/100). Fuente ejecutable: `apps/web/src/app/globals.css`. Tema claro único: `color-scheme: only light`; la preferencia oscura del sistema no cambia la paleta. No añadir clases `dark:` ni una clase `.dark` a la aplicación.

## Color y superficies

| Token / utilidad Tailwind | Valor | Uso |
|---|---|---|
| `background` | `#F8FAFC` | Fondo de página |
| `surface` / alias `card` | `#FFFFFF` | Tarjetas, filas de asistencia, controles y tablas |
| `foreground` / `card-foreground` | `#0F172A` | Texto principal |
| `primary` / `primary-foreground` | `#1D4ED8` / blanco | Acción dominante |
| `primary-hover` | `#1E40AF` | Hover opaco de acción dominante |
| `secondary` / `secondary-foreground` | `#F1F5F9` / `#0F172A` | Hover de acciones de contorno |
| `neutral` / `muted-foreground` | `#475569` | Texto secundario y Justificado |
| `neutral-subtle` / `muted` | `#F1F5F9` | Cabeceras de tabla y fondo neutral |
| `border` | `#CBD5E1` | Divisores estructurales y superficies |
| `input` | `#64748B` | Borde perceptible de controles |
| `focus` / alias `ring` | `#2563EB` | Contorno de foco: 2 px, separación 2 px |
| `success` / `success-subtle` | `#166534` / `#DCFCE7` | Presente, éxito |
| `warning` / `warning-subtle` | `#92400E` / `#FEF3C7` | Atrasado, advertencia |
| `error` / `error-subtle` | `#991B1B` / `#FEE2E2` | Ausente, error |
| `destructive` | alias `error` | Compatibilidad de errores existentes |
| `info` / `info-subtle` | `#1E40AF` / `#DBEAFE` | Información contextual |

El borde estructural no identifica por sí solo un control: usar `border-input` para controles y `border-border` para divisores. El estilo base asigna un borde explícito también a superficies existentes que usan `border` sin color. No añadir gradientes ni sombras a filas o cards; `shadow-overlay` queda reservado para overlays (0 4px 16px, negro azulado al 12 %).

Los colores semánticos oscuros son texto/borde sobre su fondo `*-subtle`, blanco o fondo de página. No usar texto blanco sobre un fondo sutil ni reducir la opacidad de estados habilitados. Disabled puede tener opacidad reducida; debe acompañarse del estado textual de la operación.

## Tipografía, ritmo y tamaño

System sans de Tailwind; sin descarga de fuentes. `body` usa números tabulares para fechas, conteos y porcentajes; las tablas mantienen `tabular-nums` explícito. El nivel del encabezado HTML indica jerarquía y no se elige por tamaño visual.

| Rol | Utilidad | Tamaño/interlínea (px) | Uso |
|---|---|---|---|
| Display | `text-display` | 32/40, semibold | Porcentaje destacado |
| H1 | `text-h1` | 24/32 móvil; 28/36 desde 768 | Título de página |
| H2 | `text-h2` | 20/28, semibold | Sección |
| H3 | `text-h3` | 16/24, semibold | Sub-sección o nombre de actividad |
| Body | `text-body` | 16/24 | Texto principal y entradas de datos |
| Small | `text-small` (`text-sm` equivalente) | 14/20 | Ayudas, estado, tablas |
| Caption | `text-caption` (`text-xs` equivalente) | 12/16 | Metadatos no esenciales |
| Label | `text-label` | 14/20, medium | Etiquetas y botones |

`cn()` registra estos tamaños en `tailwind-merge`: combinar `text-label text-primary-foreground` debe conservar ambos. `CardTitle` acepta `as="h1" | "h2" | "h3"` y aplica el rol correspondiente; por defecto es H2. Acceso, registro, recuperación e invitaciones usan H1. Asistencia, historial y reportes aplican los roles en sus encabezados y resúmenes. Otras pantallas conservan su composición para las intervenciones específicas de la épica.

- Espaciado: escala nativa de Tailwind de 4 px; preferir 4/8/12/16/24/32/48/64 (`1/2/3/4/6/8/12/16`). Padding de página objetivo 16 móvil, 24 tablet, 32 escritorio, según el layout de la tarea.
- Radio: `rounded-md` 6 px para controles; `rounded-lg` 8 px para superficies; `rounded-sm` 4 px para elementos pequeños. Chips conservan `rounded-full`.
- Altura: `min-h-control` = 44 px, equivalente a `min-h-11`. Preferir altura mínima para admitir texto en varias líneas y zoom; inputs usan texto de 16 px. El resto de controles nativos se unificará en #103.
- Breakpoints nativos: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536 px. Sin breakpoints paralelos. Mantener tablas en una región de scroll identificada y enfocable.
- Movimiento: transición de color 150 ms en botones compartidos; sin transición con `prefers-reduced-motion: reduce`.

## Asistencia y porcentajes

`apps/web/src/lib/attendance-presentation.ts` es la fuente de clases web compartida por controles de asistencia, historial y reportes. Los estados conservan las etiquetas de `packages/core` y verde/ámbar/rojo/gris. La selección añade una marca **✓**, borde reforzado y `aria-pressed`; la marca se oculta al lector de pantalla para conservar el nombre textual del botón. La reversión de un guardado fallido también retira la marca.

`reportAttendanceTone()` permanece en core y devuelve semántica: `neutral` si null, `success` desde 85 %, `warning` desde 70 % y `error` bajo 70 %. `reportAttendanceClass()` solo traduce esa clasificación a tokens web. La fórmula, redondeo, datos, permisos y contratos de servidor no cambian. Null sigue siendo «Sin datos».

## Evidencia y validación — 03-10-2026

Base: `ed483f376eacf82c0fbd3b363e51ef95489bf120`. Capturas de login real local y fixture aislado que monta los componentes reales `LoginForm`, `Button`, `Input`, `AttendanceSheet`, `AttendanceHistoryContent`, `ReportFilters`, `ReportTable` y `StatsTable`. El fixture contiene cinco personas sintéticas, los cuatro estados, sin marcar, porcentajes en ambos umbrales y null. Sus acciones son simuladas: no envía correos ni usa cuentas, pagos o datos reales.

| Contexto a 375 px | Antes | Después |
|---|---|---|
| Acceso local real | ![Acceso antes](evidence/issue-102/login-before-375.jpg) | ![Acceso después](evidence/issue-102/login-after-375.jpg) |
| Asistencia sintética | ![Asistencia antes](evidence/issue-102/attendance-before-375.jpg) | ![Asistencia después](evidence/issue-102/attendance-after-375.jpg) |
| Historial con preferencia oscura | ![Historial antes](evidence/issue-102/history-dark-before-375.jpg) | ![Historial después](evidence/issue-102/history-dark-after-375.jpg) |

[Estado de validación del login](evidence/issue-102/login-error-375.jpg): errores textuales y borde rojo del input con `aria-invalid=true`.

Medición WCAG de luminancia sRGB, sobre colores calculados en DOM y fondos compuestos hasta la superficie opaca, excluyendo controles disabled. [Resultados de contraste](evidence/issue-102/contrast.json): mínimo de texto **6.37:1** (Atrasado); Presente 6.49:1, Ausente 6.80:1, Justificado 6.92:1. Botón primario 6.70:1. Borde de input sobre blanco **4.76:1**; foco **5.17:1** sobre blanco y **4.94:1** sobre background. No se usa opacidad en estados habilitados. Estas mediciones cubren las parejas renderizadas del fixture, no son una certificación integral WCAG.

[Responsive](evidence/issue-102/responsive.json): 320/375/768/1024/1440 px, sin overflow global; tablas de 865 px contenidas en regiones de 286/341/718 px en los tres anchos menores. Inputs y estados miden 44 px. [Zoom nativo Chrome 200 %](evidence/issue-102/zoom-200.json): ventana 1512 px → viewport CSS 756 px, sin overflow global ni recorte de controles.

Preferencia oscura probada en un iframe con `color-scheme: dark`: se verificó `matchMedia('(prefers-color-scheme: dark)').matches === true` dentro del documento y se conservaron fondo claro, colores semánticos y `color-scheme: only light`. Teclado: Tab muestra contorno azul sólido de 2 px con separación 2 px; Enter selecciona y Espacio desmarca; los tests verifican marca visible, `aria-pressed`, reversión ante error y conservación de guardados/lotes. Se ejercitaron error de validación, sin datos, sin marcar, seleccionado y guardando/disabled.

Comandos del repositorio (mediante Corepack, pnpm 10.33.2):

```sh
corepack pnpm --filter @asisteam/core test
corepack pnpm --filter @asisteam/web test
corepack pnpm --filter @asisteam/core typecheck
corepack pnpm --filter @asisteam/web typecheck
corepack pnpm --filter @asisteam/web build
git diff --check
```

No existe script `lint` en el root ni en los paquetes afectados. Las integraciones Supabase se omiten por defecto (76 casos); no hubo cambios de DB/RLS/RPC ni regeneración de tipos de DB. El build necesitó permiso para el puerto interno de Turbopack; el wrapper Turbo raíz encuentra pnpm global 11, por lo que se ejecutan los scripts por paquete con Corepack. El warning de Next sobre `middleware` → `proxy` es preexistente. QA completa de todas las rutas/roles y lector de pantalla corresponde a #120; la composición de navegación, formularios y diálogo de asistencia permanece en sus issues.
