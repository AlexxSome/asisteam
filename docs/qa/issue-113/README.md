# Issue #113 — Evidencia de agenda y edición

Revisión del 2026-10-04 con datos sintéticos. Base: `bfb6dff6`.

Las capturas usan los componentes reales de Next.js en una ruta temporal local; la ruta y los fixtures se retiraron antes de entregar. El «antes» conserva el formulario y el fragmento de agenda de la base. No se hicieron escrituras contra Supabase ni se usaron cuentas o datos reales.

## Antes y después

| Vista (375 px) | Antes | Después |
| --- | --- | --- |
| Agenda global | [Antes](agenda-before-375.png) | [Después](agenda-after-375.png) |
| Editar actividad | [Antes](form-before-375.png) | [Después](form-after-375.png) |

También se adjuntan [agenda a 1440 px](agenda-after-1440.png), [formulario a 1440 px](form-after-1440.png), [agenda ampliada 200 %](agenda-after-zoom200.png), [formulario ampliado 200 %](form-after-zoom200.png) y [serie con edición pendiente y confirmación de eliminación](series-delete-dirty-375.png).

## Comportamiento comprobado

- Chrome con locale es-CL; fechas de la agenda en America/Santiago.
- Agenda y formulario sin desbordamiento horizontal a 320, 375, 768, 1024 y 1440 px.
- Ampliación al 200 % mediante CSS `zoom: 2` a 1440 px, sin desbordamiento horizontal. Esta comprobación no equivale a una prueba en todos los motores de navegador.
- En navegador real: rechazar Cancelar y Atrás conserva el borrador; aceptar Cancelar regresa a la agenda. Escape cierra la confirmación de eliminación y devuelve el foco al botón que la abrió.
- Vitest verifica cancelación sin cambios, restauración de valores originales, navegación por enlace y selector de grupo, cierre/recarga, guardado exitoso sin aviso de descarte, conservación del borrador ante error, selección de alcance sin restablecer fechas y confirmación adicional para eliminar asistencia.
- Pruebas de agenda verifican día chileno al cruzar medianoche UTC, agrupación, horario de invierno/verano, paginación y vistas vacías por rol. Las tres pantallas consumen el mismo componente.
- Pruebas del detalle verifican historial propio/pupilo según rol y navegación de origen. Se usan enlaces a los historiales autorizados existentes; el detalle no añade consultas de asistencia ni de terceros.

Los resultados de medidas y navegación están en [checks.json](checks.json). No se añadieron filtros de búsqueda/tipo ni se cambiaron lecturas paginadas, métodos de guardado, límites de recurrencia, DB/RLS/RPC o tipos de BD.

## Gate local

| Componente | Comprobación | Resultado |
| --- | --- | --- |
| Web | `vitest run` | 734 PASS; 81 integraciones opt-in omitidas |
| Core | `vitest run` | 150 PASS |
| Web | `next typegen` + `tsc --noEmit` | PASS |
| Core | `tsc --noEmit` | PASS |
| Web | `next build` (Turbopack) | PASS |
| Diff | `git diff --check` | PASS |

Se ejecutaron los binarios locales de `node_modules/.bin`, equivalentes a los scripts del proyecto. El build requirió permitir el puerto interno de Turbopack fuera del sandbox. No existen scripts de lint ni los skills auxiliares `frontend-check`, `frontend-ci` o `ship` en las ubicaciones de skills del proyecto/usuario; se aplicaron los scripts disponibles y el flujo de entrega de la skill principal.
