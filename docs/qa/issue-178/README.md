# UI-08 · Reportes e historiales con tarjetas y tablas del panel

[Seguro] Implementación de #178 sobre `develop@e5aa6c76a3bad7cdae17082e2067cdf40d5ba7ea`, 13-10-2026 America/Santiago. #171/#172/#175 cerrados y transporte Nest de #156 vigente. Graphify actualizado sobre la base:3431 nodos/170661 aristas. Referencias Next del issue trasladadas a las rutas React Router vigentes;39 destinos conservados.

[Seguro] Reportes ADMIN/COACH, agregados permitidos y consultas propias/pupilos comparten tarjetas de presentación. Cada consumidor usa su DTO: SQL/core continúa como fuente de métrica y tonos, sin cambiar RLS/HTTP/auth. Total ponderado y promedio individual conservan valores separados; agregados sin promedio no lo inventan. PageHeader/ancho1280, tablas antes del borrador, acceso al filtro de44 px y cabecera fija del historial extienden el contrato UI-01. Notas propias/pupilos siguen autorizadas y no se muestran en agregados de terceros.

## Reproducción

```sh
pnpm install --frozen-lockfile
pnpm ci:checks
pnpm ci:backend
node scripts/ci/probe.mjs
pnpm ci:staging
pnpm ci:extended
pnpm ci:qualification
```

[Seguro] `.github/workflows/ci.yml` aplica a todos los PR sin filtros: checks→ci:checks; backend→ci:backend+probe; staging→ci:staging; extended→ci:extended; qualification depende de esos cuatro y required exige cinco resultados success. Node24.16.0/pnpm10.33.2 y fixtures Docker locales propios PostgreSQL17/S3/Nest; Chromium instalado por extended. Extended QA programado/manual no se dispara por el PR; usa el mismo comando extended.

[Seguro] La prueba específica en nest-reports verifica ADMIN/COACH/ATHLETE/GUARDIAN/multirol×375/720/1440, historiales propio/pupilo, axe, ausencia de overflow de página, primera columna/cabecera fija, tabla antes del borrador, y cambios de período sin aplicar que conservan resultado/URL. La regresión existente conserva paginación/orden/inactivos/custom,77.8/null, V1/V2 con toggles apagados, agregados y revocación, COACH sin PII/notas, transporte sin falso vacío. Ocho casos unitarios verifican77.8/null/cero/69.9/70/84.9/85 y ponderado/promedio distintos.

[Seguro] Auto-revisión limitada al diff del issue: la primera matriz detectó que un enlace Router de fragmento retiraba la consulta; se sustituyó por un ancla HTML nativa y se añadió comprobación explícita de la consulta. El selector nuevo de Período se ajustó al rol combobox canónico. Se retiró un nombre duplicado de región para mantener navegación accesible única y se conservó el dato Mejor asistencia ya existente. No se añade ranking ni CSV/gráficos/enlaces ADMIN inexistentes. Capturas sintéticas enmascaran secretos/SVG;720 px prueba reflow aproximado, no zoom nativo. Lector escuchado, zoom real200 %, teléfono real, axe incomplete y aceptación externa siguen pendientes de #100/#181/#209. Producción NO-GO; no se ejecutó corte/deploy real.

## Capturas y accesibilidad

[Seguro] Catorce capturas finales con fixtures sintéticos; el color magenta es la máscara de SVG del helper de seguridad, no un token de producto. Los reportes ADMIN/COACH/multi muestran el borrador personalizado sin aplicar sobre los resultados de temporada. El historial móvil se captura tras desplazar la tabla200 px para mostrar la primera columna fija.

| Consulta |375 px|1440 px|
|---|---|---|
| ADMIN |[Reporte](ui178-admin-reports-375.png)|[Reporte](ui178-admin-reports-1440.png)|
| COACH |[Reporte](ui178-coach-reports-375.png)|[Reporte](ui178-coach-reports-1440.png)|
| ATHLETE |[Reporte](ui178-athlete-reports-375.png) · [Historial](ui178-athlete-history-375.png)|[Reporte](ui178-athlete-reports-1440.png) · [Historial](ui178-athlete-history-1440.png)|
| GUARDIAN |[Reporte](ui178-guardian-reports-375.png) · [Historial](ui178-guardian-history-375.png)|[Reporte](ui178-guardian-reports-1440.png) · [Historial](ui178-guardian-history-1440.png)|
| Multirol ADMIN+ATHLETE |[Reporte](ui178-multi-reports-375.png)|[Reporte](ui178-multi-reports-1440.png)|

[Seguro] Veintiún análisis específicos×375/720/1440 se registran en [accessibility.json](accessibility.json), con cero violaciones y resultados incomplete preservados. `aria-valid-attr-value` del aria-controls del Menú cerrado y revisión humana siguen pendientes; no se considera aprobación WCAG por ausencia de violaciones. La [primera matriz fallida](initial-browser.json) conserva54 PASS/3 FAIL; tras corregir enlace y selector se pasó la suite específica8/8 y se repitieron gates afectados. Backend/probe se conservan porque las correcciones solo afectan presentación/enlace/prueba web, sin cambios en SQL/API/Worker/SDK/auth.

[Seguro] Los resultados locales finales se registran en [validation.json](validation.json); no constituyen aprobación del CI remoto.


## Gates finales

|Correspondencia workflow|Comando local|Resultado|
|---|---|---|
|CI/checks|`pnpm ci:checks`|PASS:154 core/501 web, lint, contratos, tipos/builds/artefacto, API/Worker/SDK; cero omisiones.|
|CI/backend|`pnpm ci:backend` + `node scripts/ci/probe.mjs`|PASS:40 suites/1646 SQL,50 guards nativas,84 integraciones, backup/PITR/portabilidad;4 fallos de probe esperados detectados.|
|CI/staging|`pnpm ci:staging`|PASS:53 registros, artefactos API/web y rollback explícito/automático, privacidad/limpieza; fallo inyectado esperado.|
|CI/extended|`pnpm ci:extended`|PASS:57 nativos +42 paridad Vite +1 transporte; cero omisiones/flaky.|
|CI/qualification|`pnpm ci:qualification`|PASS técnico: carga500 ATHLETE/5000 registros,8 celdas/192 peticiones, p95 máximo85.93ms; bundle gzip200254bytes, presupuesto PASS.|
|CI/required|Agregación de los cinco jobs|Todos los resultados locales PASS; CI remoto pendiente al crear PR.|

[Seguro] La validación local final cubre el contenido publicado mediante SHA-256 de nueve fuentes y catorce capturas. Después de corregir el enlace/selector se repitieron checks, staging y extended; las suites backend/probe aprobadas se conservaron sin modificar sus módulos/contratos/aserciones. La documentación/evidencia añadida después de los gates no cambia el artefacto. Los resultados GitHub y la aceptación humana/externa deben distinguirse de esta ejecución local.
