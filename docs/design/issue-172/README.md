# UI-02 · Sidebar, cabecera y contexto — #172

[Seguro] Implementación sobre `develop@2fa6dd5` (UI-01 #171/PR210), 10-10-2026. El [contrato UI-01](../issue-171/README.md) y [PNG inmutable](../asisteam-dashboard-reference.png) guían composición, sin copiar datos ni ampliar permisos.

[Seguro] AppShell organiza la página en sidebar blanca de 256 px desde 1024 y espacio de tarea flexible `min-width:0`, con main máximo 1280. Marca, nombre completo, logo real o iniciales, roles y selector viven en sidebar/drawer. No hay alto fijo de mockup ni sidebar sticky: menús largos crecen con el documento. Header mínimo 64, breadcrumb con nombre de grupo autorizado y etiqueta de tarea, más Mi cuenta; en móvil integra el logo/nombre y acceso Menú. Nombres largos ajustan; los IDs de actividad/pupilo no aparecen en el breadcrumb.

[Seguro] SVG locales de UI-01 tienen `aria-hidden` y `focusable=false`, texto visible y estado activo. Gestión expone Configuración, Visibilidad, Tipos y Suscripción para ADMIN; Integrantes y Asistencia y consulta mantienen destinos existentes y composición multirol. Ayuda y soporte usa `/profile#privacy`. El breadcrumb enlaza solo al espacio personal y grupo ya autorizado; la tarea actual es texto. No consulta perfiles adicionales: Mi cuenta conserva la identidad textual sin foto ficticia.

[Seguro] `pendingApprovals` es un punto de integración opcional para el conteo completo autorizado de UI-03. Se muestra solo para ADMIN, entero seguro positivo; ausente/cero/error no inventa badge ni se convierte en aprobación pendiente. #173 continúa abierto y su DTO/productor no se implementa aquí; no se estima contando páginas de integrantes ni se consulta otro backend. El criterio conectado del badge depende de esa entrega.

[Seguro] Se reutilizan navegación/cookies de GroupSelector y `switchedGroupPath`, con protección de cambios sin guardar. Cambiar grupo descarta IDs/filtros de actividad/pupilo y pierde rutas ADMIN si el nuevo rol no las admite. Drawer conserva foco inicial Cerrar, límites Tab, Escape/retorno y cambio de desktop al main; salto, sesión y cierre siguen su contrato. No cambia auth, DTO HTTP, SQL, RLS, R1/V1–V6, métrica ni capacidades autorizadas.

## Verificación reproducible

```sh
corepack pnpm ci:checks
corepack pnpm ci:backend
corepack pnpm ci:staging
corepack pnpm ci:extended
corepack pnpm ci:qualification
```

[Seguro] Vitest extiende la suite compartida para breadcrumb sin IDs, enlaces reales, Visibilidad activa única y badge ADMIN/invalidación. Playwright `e2e/shell.spec.ts` verifica el shell sobre login/transporte Nest reales con fixture multirol, 320/375/768/1024/1440, ancho sidebar 256, Gestión, axe, foco inicial/límite/Escape/retorno, cuenta, cierre al pasar a desktop y zoom CSS 200 %. La matriz existente cubre ADMIN/ATHLETE/GUARDIAN/COACH/multirol y cambio de grupo.

[Seguro] [Captura móvil 375](shell-375.png) y [desktop 1440](shell-1440.png) revisadas visualmente: identidad reconocible, controles accesibles y tarea visible; menús/documento crecen sin altura fija. La revisión corrigió alineación vertical del separador del breadcrumb. [Resultados sanitizados y hashes de fuentes](validation.json) registran base + diff y distinguen las revalidaciones finales. [Axe](accessibility.json): 63 análisis de la matriz completa y cinco finales del shell, cero violaciones automáticas; `aria-valid-attr-value`/`color-contrast` incomplete conservan su revisión humana pendiente.

| Gate | Resultado local |
| --- | --- |
| ci:checks final | PASS: lint, contratos, tipos, build/artefacto, 150 core, 961 web; 84 opt-in omitidas aquí y ejecutadas completas en backend. |
| ci:backend | PASS: 40 suites/1646 aserciones SQL, guards nativas, API/Worker/backup/PITR, 84/84 integraciones producto. Fallo de portabilidad inyectado esperado y cleanup PASS. |
| ci:staging | PASS: Docker local, roles mínimos, artefactos/rollback explícito y automático, privacidad y cleanup. Artefacto inválido inyectado falló como se esperaba. |
| ci:extended | PASS: 47/47 recorridos completos + 1/1 fallos de transporte; cero omisiones/flaky. |
| Revalidación visual final | PASS: ci:checks completo y caso shell a cinco anchuras/axe/teclado/cuenta/zoom tras corregir `items-center` del breadcrumb y encuadrar la captura al viewport. Backend/staging no cambian; matriz completa anterior al ajuste queda fechada separadamente. |
| ci:qualification | technicalStatus PASS; acceptance NO-GO con límites externos/humanos. |
| CI remoto | PENDIENTE al publicar; consultar el SHA del PR, sin heredar PASS local. |

[Seguro] El zoom CSS no acredita zoom nativo. Lector escuchado, teléfono a una mano, casos axe incomplete y aceptación visual humana continúan en #100/UI-11. Producción sigue NO-GO; no se despliega ni se hace merge.

[Seguro] macOS arm64, Node24.16.0, Chromium Playwright1.63.0/axe4.13.0, fixtures Nest/PostgreSQL17 locales. Auto-revisión limitada al diff del issue; git diff --check PASS. El cambio original ajeno en next-env.d.ts se conserva fuera del commit. No hubo migración ni tipos DB que regenerar.
