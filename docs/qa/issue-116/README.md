# Cuenta, privacidad y soporte — issue #116

Validación con datos sintéticos del 2026-10-04. Base: `5bd980cb6ff566d7244e335141528410e9213552`.

## Cambio comprobado

- Datos personales y foto tienen estados pendientes, resultados y reintentos independientes. Guardar datos no sube ni descarta la foto seleccionada. Los permisos de imagen muestran su resultado junto al pupilo correspondiente.
- Validación cliente con los schemas de core, errores vinculados al campo y foco en el primer campo inválido. Email de solo lectura explicado y copiable.
- Vista previa en memoria antes de subir foto, con descarte explícito y liberación del object URL. Se mantiene la validación del servidor y el bloqueo por fecha/consentimiento de menores.
- Recuperación de contraseña enlazada a `/forgot-password`; cierre de sesión disponible en el menú compartido de #101.
- Copia, supresión, revocación y ayuda dirigen a `soporte@asisteam.cl`, canal confirmado por el responsable del producto en esta implementación. Los asuntos no contienen PII. La interfaz explica que hay que enviar el correo y que no se ejecuta ninguna operación automática al abrirlo. El consentimiento de menores también ofrece la revocación por este canal, sin marcar ninguna autorización.
- Cambios sin guardar protegidos por el guard existente: enlaces, selector de grupo, Atrás, cierre/recarga y cierre de sesión; descartar un formulario conserva el otro. Abrir correo no pide descartar porque no abandona la edición. El borrador vive en memoria; no se añade persistencia local de PII.

## Evidencia visual

Los componentes reales se renderizaron en rutas locales temporales con fixtures sintéticos; para «antes» se usaron los archivos de la base. Se conservaron AppShell y los controles compartidos. Las rutas y fixtures se retiraron antes del build final. No se hicieron escrituras reales de perfil, autorizaciones ni pruebas enviando correos.

| Escenario | Evidencia |
| --- | --- |
| Antes, 375 px | [Captura](profile-before-375.jpg) |
| Después, 375 px | [Captura](profile-after-375.jpg) |
| Después, 320 px | [Captura](profile-after-320.jpg) |
| Después, 1440 px | [Captura](profile-after-1440.jpg) |
| Ampliación CSS al 200 % | [Captura](profile-after-zoom200.jpg) |
| Menor con foto bloqueada | [Captura](profile-minor-blocked-375.jpg) |
| Error y foco del teléfono | [Captura](profile-validation-375.jpg) |
| Foto sintética en preview, aún sin subir | [Captura](profile-preview-375.jpg) |

Las medidas en [checks.json](checks.json) verifican ausencia de desbordamiento horizontal a 320, 375, 768, 1024 y 1440 px, y con `zoom: 2` a 1440 px. Esta ampliación CSS no equivale a probar el zoom nativo de todos los navegadores. En el navegador se comprobó el error asociado al teléfono, foco correcto y preview real antes de subir.

El controlador del navegador se bloqueó al manejar la confirmación nativa de descarte y no permitió completar ese escenario. No se reporta como validación manual aprobada. Vitest sí verifica conservar/descartar, navegación por enlaces y selector, Atrás, `beforeunload`, cierre de sesión, guardado sin confirmación indebida y `mailto` sin pérdida real. La navegación con teclado también se verificó con Testing Library; queda pendiente una pasada humana del diálogo y zoom nativo con tecnología de asistencia.

## Gate local y auto-revisión

| Comprobación | Resultado |
| --- | --- |
| Suite web completa, `vitest run` | 774 PASS; 81 integraciones opt-in omitidas |
| Regresión final de permisos, `vitest run src/app/profile/avatar-permissions.test.tsx` | 3 PASS (incluye una prueba adicional posterior a la suite completa) |
| Core, `vitest run` | 150 PASS |
| Web, `next typegen` + `tsc --noEmit` | PASS, tras retirar fixtures |
| Core, `tsc --noEmit` | PASS |
| Web, `next build` (Turbopack) | PASS, tras retirar fixtures |
| `git diff --check` | PASS |

Se ejecutaron los binarios locales equivalentes a los scripts del proyecto. El lanzador `pnpm` intentó acceder a red y falló; no se cambiaron dependencias. No existe script de lint ni skills auxiliares `frontend-check`, `frontend-ci` o `ship` en las ubicaciones de skills del proyecto y usuario. Se aplicó el gate disponible de Asisteam y la entrega explícita de la skill principal.

La auto-revisión se limitó al diff de #116 y al contexto mínimo del guard/acciones existentes. La fecha del perfil ya no se usa como key de remount para evitar perder la foto pendiente al refrescar; las respuestas exitosas actualizan el snapshot de datos guardados. Los estados de autorización por pupilo se sincronizan con respuestas nuevas del servidor.

No se modificaron DB/RLS/RPC ni tipos generados: no correspondía ejecutar pgTAP o integración de backend. El build conserva el aviso preexistente de Next sobre la convención `middleware`. Añadir el canal no acredita cumplimiento legal ni cambia las reglas de retención/supresión del backend.
