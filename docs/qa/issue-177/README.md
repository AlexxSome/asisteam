# UI-07 · Integrantes, apoderados, aprobaciones y gestión

[Seguro] Entrega de #177 sobre `develop@8d2a5d02e9c79bdec56abf33be4c81f11966df2a`, 12-10-2026 America/Santiago. Dependencias #171/#172 y transportes #152/#153 cerrados. Graphify actualizado sobre la base para identificar rutas/componentes React Router; las referencias Next del issue son históricas. No se agregan destinos al inventario de 39 páginas.

[Seguro] La nómina pasa de una columna de máximo 768 px a la superficie de listas 1280 px de UI-01: toolbar de búsqueda/roles/estados en tarjeta, filas compactas con cuenta/membresía distinguidas, acciones y retorno a aprobaciones. Los formularios de alta, vínculo e invitación usan la tarea 672 px. Las fichas de aprobación muestran pasos y responsables en un panel; los enlaces conservan `membership` y las páginas vacías ofrecen volver a página 1. Datos y código, Visibilidad y Tipos reutilizan la navegación contextual de AppShell y comparten PageHeader y superficies blancas. La vista previa de permisos usa valores confirmados y mantiene separados los roles ATHLETE/GUARDIAN.

[Seguro] Búsqueda y paginación siguen Router→SDK→Nest; identidad de cada acción y key sigue `membership_id`, sin fusionar roles de una persona. Vínculos/consentimientos/R1/capacidad/último ADMIN/desactivación/historia permanecen en los servicios/RPC vigentes. Datos/tipos/invitaciones requieren guardado explícito; cada toggle guarda únicamente su clave, bloquea cambios simultáneos y conserva el valor confirmado ante fallo. Incertidumbre de envío nunca se presenta como éxito ni provoca reenvío automático. Alta MANAGED autorizada por ADMIN puede activarse al consentir si hay cupo; ingreso por código requiere revisión ADMIN posterior, según canon.

## Evidencia visual

[Seguro] Chromium Playwright1.63, macOS arm64, Node24.16.0/pnpm10.33.2 y fixtures locales PostgreSQL17/Nest propios. ADMIN sintético, club con 50 ATHLETE activos, menor PENDING excluido de asistencia, roles múltiples y cuentas MANAGED sin credenciales. Capturas enmascaran email, contraseñas, código y SVG; no incluyen barra de URL ni datos reales. La selección versionada excluye la captura anterior de Configuración porque mostraba el enlace sintético de ingreso; el helper ahora enmascara también ese campo. Los artefactos completos permanecen temporales en `.qa/regression-results`.

| Superficie | Antes | Después |
| --- | --- | --- |
| Nómina 375 px | [Captura](before-members-375.png) | [Captura](after-members-375.png) |
| Nómina 1440 px | [Captura](before-members-1440.png) | [Captura](after-members-1440.png) |
| Aprobaciones 375 px | [Captura](before-pending-375.png) | [Captura](after-pending-375.png) |
| Vínculo 375 px | [Captura](before-guardian-375.png) | [Captura](after-guardian-375.png) |
| Visibilidad 1440 px | [Captura](before-visibility-1440.png) | [Captura](after-visibility-1440.png) |

[Seguro] Reproducir después de compilar: el servidor Playwright sirve el artefacto estático vigente, no reconstruye un `dist` existente. La primera pasada final individual detectó este artefacto anterior al buscar el nuevo enlace página 1; se conservó el fallo y se reconstruyó antes de repetir. El CI canónico ya compila antes de los recorridos.

```sh
pnpm install --frozen-lockfile
pnpm --filter @asisteam/web build
pnpm --filter @asisteam/web test:e2e:full members-management.spec.ts
pnpm ci:checks
pnpm ci:backend
node scripts/ci/probe.mjs
pnpm ci:staging
pnpm ci:extended
pnpm ci:qualification
```

## Verificación y límites

[Seguro] Matriz específica: ocho superficies×375/1440, un H1, ausencia de scroll horizontal de página, axe, retorno desde página999 y navegación de gestión por Enter. Pruebas de acciones: dos memberships de una persona conservan filas e ID/rol de la mutación; preview no cambia mientras guarda ni ante fallo; bloqueo menor/último ADMIN y consentimientos existentes se preservan. Cancelación/foco/formularios y cadena real de vínculo/consentimiento/confirmación siguen cubiertos por las suites de componentes y la matriz nativa completa.

[Seguro] Los resultados locales finales se registran en [validation.json](validation.json) y [análisis de accesibilidad](accessibility.json); la correspondencia con workflows vigentes es `CI/checks→ci:checks`, `CI/backend→ci:backend+probe`, `CI/staging→ci:staging`, `CI/extended→ci:extended`, `CI/qualification→ci:qualification`. `required` exige éxito de esos cinco jobs. Extended QA programado no se dispara por este PR; su comando es el mismo gate extended. No hay matrices ni filtros de rutas adicionales en el workflow del PR.

[Seguro] La primera matriz completa detectó una regresión del texto accesible Estado al agregar la etiqueta Membresía: 51 recorridos PASS / 1 FAIL. La paridad Vite detectó además el prefijo Cuenta: que alteraba la etiqueta canónica exacta Cuenta propia (41 PASS / 1 FAIL); se retiró ese prefijo. Se preservaron las etiquetas de core y Estado en su propio párrafo accesible, separado de la etiqueta de columna, y se repitió el recorrido nativo de desactivar/reactivar y los gates afectados sin debilitar la prueba. Auto-revisión acotada al diff de #177: la comparación visual retiró una barra contextual redundante y el padding adicional de las rutas porque AppShell ya aporta los destinos y el margen de 16/24/32 px; sin modificar SQL, RLS, RPC, contratos ni auth. Las pruebas específicas complementan los gates completos; la validación local no acredita CI remoto ni aceptación humana. Lector de pantalla escuchado, zoom nativo 200 %, teléfono real y revisión de axe incomplete siguen pendientes en #100/#181/#209. No se añade directorio/desvinculación de apoderados, detalle ADMIN independiente, endpoints, CSV, gráficos ni cliente móvil. Producción continúa NO-GO y no se ejecuta deploy/corte real.


| Gate local sobre el contenido final | Resultado |
| --- | --- |
| `ci:checks` | PASS: 154 core, 493 web, lint, contratos, tipos, builds, artefacto, infraestructura, API/Worker/SDK. Cero omisiones. |
| `ci:backend` + `probe` | PASS: 40 suites / 1646 aserciones SQL, 50 guards nativas, 84 integraciones, PostgreSQL/API/Worker/backup/PITR/portabilidad. Fallos controlados esperados detectados. |
| `ci:staging` | PASS: 53 registros; artefactos API/frontend, roles mínimos, rollback explícito/automático, privacidad y limpieza. Un fallo inyectado esperado. |
| `ci:extended` | PASS: 52 recorridos nativos + 42 de paridad Vite + 1 de fallos de transporte; cero omisiones/flaky. |
| `ci:qualification` | PASS técnico: carga 500 atletas / 5000 registros, 8 celdas / 192 peticiones, p95 máximo 129,06 ms; bundle inicial gzip 200263 bytes, presupuesto PASS. |
| CI remoto | Pendiente al entregar; consultar el PR. |
| Aceptación humana/operacional | PENDIENTE / NO-GO: lector escuchado, zoom nativo, teléfono, incomplete de `aria-controls` del Menú y aceptación externa. El drawer sí conserva pruebas automáticas de teclado/foco/Escape/retorno. |

[Seguro] Después de los últimos ajustes de presentación se repitieron checks, compilación estática, staging y las matrices completas de navegador. Los resultados backend se conservaron porque no cambiaron SQL, API, Worker, SDK, autenticación ni sus aserciones. Los SHA-256 del código/pruebas y de las capturas permiten verificar el contenido publicado; la evidencia se refiere a la base más el diff de este issue.
