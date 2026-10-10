> **Evidencia histórica del alcance inicial, commit 6ffbf2d.** El CI remoto posterior falló y el usuario amplió el retiro. Los PASS de esta matriz no acreditan las reparaciones actuales ni CI remoto verde. Ver [estado vigente](README.md).

# Evidencia de entrega técnica #168

[Seguro] Base revisada: `develop@847a666b081353382cf60550030660db4821b43c`; rama `codex/168-retiro-tecnico-supabase`. Entorno local sintético: Node24.16.0/pnpm10.33.2/Docker, 2026-10-09. Los reportes locales registran la base más el diff pendiente; no representan un deploy ni aceptación del commit remoto.

| Verificación | Resultado | Alcance |
|---|---|---|
| `pnpm ci:checks` | PASS | Lint, generación/contrato HTTP, tipos, build, gate retiro, core, web, worker, API y cliente |
| Web actual | 478 PASS / 80 condicionadas omitidas | Suites de `src`, DTO/API nativos, UI y regresiones; omisiones requieren flags/integración |
| Web origen | 465 PASS / 1 condicionada omitida | `test/legacy`, comportamiento histórico Supabase, no prueba producto nativo |
| Core | 150 PASS / 0 omitidas | Incluye métrica canónica |
| API unit | 21 PASS / 0 omitidas | Incluye configuración/JWT nativos y suites origen marcadas |
| Regresión nativa crítica | 13 PASS / 0 omitidas | Logout anónimo y CSRF, PKCE retirado, register/claim, rechazo transaccional, PENDING/INACTIVE, bienvenida, guardian paginado |
| Gate `ci:retirement` | PASS (6 gates) | Fuentes/manifests, trazas, bundles server/browser y dist API/worker; sin SDK, llamadas proveedor ni harness |
| PostgreSQL independiente/API/worker/tipos/backup/PITR | PASS | Contenedor independiente, baseline/tipos/RLS, dominios nativos y restauración sintética; no proveedor real |
| Browser Auth nativo | PASS | Chromium + Next/Nest/PG real: registro, perfil, cookies, CSRF, refresh, logout, recovery/reset/login; HIBP/Resend simulados |
| Browser social nativo | PASS | Google sintético firmado, nueva cuenta/consentimiento, login/link, binding cookie, axe y reflow375; Apple callback y políticas de cookie unitarios, no proveedor real |
| `pnpm ci:staging` | PASS | 21 gates PASS y 1 fallo inyectado esperado recuperado; esquema mínimo/health/rollback, `NODE_ENV=test`, no staging funcional |
| Backend obligatorio, gates individuales | PASS tras reparación del gate final | El recorrido inicial falló por ruta CLI del fixture movido; corregido y reejecutado con el mismo helper CI: origen81/81, 0 omitidas. Destino independiente final PASS tras ajuste del helper de sesión. |
| CI remoto | PENDIENTE | Verificar en PR; ningún resultado local se promueve a CI remoto |
| Carga/proveedores/corte/aceptación real | PENDIENTE / NO-GO | #166/#167, operadores/ventana/RPO/RTO y contratos/reintentos MP no acreditados |

[Seguro] No se cambiaron migraciones, esquema, RLS ni historial; no corresponde regeneración de tipos por esta entrega. Se verifican tipos del origen y destino en CI backend. No se incluyó el cambio ajeno `apps/web/next-env.d.ts`.

[Seguro] Auto-revisión del diff: se corrigieron consumo activo de RPC en contador guardian, bienvenida a perfil nativo, logout anónimo con validación de Origin, redirección INACTIVE de invitación y validación de identidad antes de acceder al provider. Se revisó que Google/Apple conserven callbacks nativos, que el retiro no abra fallback por error, y que snapshots/harness no se tracen ni desplieguen. El staging mínimo se identifica como sintético y no debilita requisitos de configuración productiva.

[Seguro] Prueba negativa del retiro PASS: reintroducir temporalmente un import SDK provoca FAIL del gate de fuentes. El probe conserva tres FAIL esperados (SQL, tipos, SDK) y elimina sus archivos; el gate final vuelve a PASS. [Resultados saneados](results.json).

[Seguro] La matriz completa Playwright/QA120 extendida no se ejecutó en esta entrega; los navegadores documentados arriba cubren Auth/social y el ensayo independiente. El tooling E2E histórico sigue en dev; su sesión híbrida no acredita este candidato. La aceptación visual/funcional integral permanece en #167 y no se deduce del build o de los tests de origen.
