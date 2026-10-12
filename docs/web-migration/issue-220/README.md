# WEB-08 · Billing, anuncios y QR en Vite (#220)

[Seguro] Base: `47d1e26536bf435979b0c88e477adfe263b811dc` (`develop`), 2026-10-11 America/Santiago. La épica #212 autoriza la migración de la web; #217 y #219 están integrados. Esta entrega conserva #55–#59 y coordina con WEB-04: `/check-in` es público para leer/limpiar el fragmento y pedir sesión; la llegada requiere ATHLETE ACTIVE propio en servidor. Next permanece hasta WEB-10. Producción continúa NO-GO.

## Cambio verificable

[Seguro] Antes, el router paralelo no resolvía las cuatro rutas. Después, [billing](../../../apps/web-vite/src/routes/billing.tsx), [anuncios](../../../apps/web-vite/src/routes/announcements.tsx), [QR ADMIN](../../../apps/web-vite/src/routes/qr.tsx) y [check-in](../../../apps/web-vite/src/routes/check-in.tsx) usan loaders y SDK cookie/CSRF. Los adapters de componentes conservan el diseño, textos, schemas, controles44px y confirmaciones actuales. No hay segunda caché, fallback, cola offline ni reenvío automático de writes inciertos.

| Capacidad | Paridad preservada | Evidencia sintética |
|---|---|---|
| Suscripción del club | Catálogo50/200/1000, precio servidor, ledger50/página, deuda/estado/capacidad del DTO. Checkout alojado HTTPS y URLs de retorno/webhook canónicas. Query `status=approved`/`payment_id` no confirma pagos. Reintento incierto obliga a consultar estado. | [Sin contrato/cupo](billing-375.png), [ledger pendiente/vencido/cancelado](billing-ledger-375.png); checkout y retorno con capacidad0, conciliación, red y alta sin cupo. |
| Anuncios | Lectura de roles ACTIVE; solo ADMIN escribe. Texto plano, request_id estable, versión UTC exacta y borrado lógico. Muro30s/foco/acción explícita con editor/confirmación pausados, borrador y feedback conservados. Opt-in global confirmado tras servidor, sin prometer Web Push/móvil. | [Muro con conflicto actualizado](announcements-375.png); publicar/conflicto/recarga/borrar/roles/opt-in/red. |
| QR ADMIN | Firma, clave y reloj SQL; SVG local con margen y blanco, vence/rota por hora servidor y temporizador monotónico, se retira al ocultarse. Ajustes plegados guardan solo por acción explícita y afectan todo el grupo. | [QR enmascarado y ajustes guardados](qr-375.png); emisión/configuración y negación COACH/ATHLETE/GUARDIAN. |
| Llegada propia ASI-04 | Fragmento se limpia preservando el estado Router. Token solo en memoria; login email/contraseña en la misma pantalla. Cuenta sin aceptación legal u otro método de login requiere completar acceso y reescanear. Caducidad/ventana/membership se deciden en SQL; registro anterior se conserva. | [Llegada confirmada](check-in-375.png); vencido durante login, fallo login sin perder campos/token, reescaneo, reuso, reintento de red, rol/tenant/membership revocada. |

[Seguro] `BILLING_WEB_URL` debe apuntar al origen público de la SPA y conserva `/groups/:groupId/billing`; `BILLING_WEBHOOK_URL` sigue en Nest `/api/v1/billing/mercadopago-webhook`. El fixture comprueba HTTPS/origen/rutas sin persistir payer ni payload remoto y intercepta el checkout externo en navegador. `/auth/callback/google`/`apple`, `/auth/callback`, `/auth/refresh`, `/auth/complete` siguen WEB-02/04; no se introduce callback de pagos en la SPA ni se traslada verificación/webhooks al cliente. La configuración externa real corresponde a WEB-09/#209: no se cambia ningún proveedor remoto.

[Seguro] Core browser exporta solo schemas/DTOs públicos de estos módulos; handlers/provider IDs privados y jobs siguen en entrypoints de servidor. `qrcode.react4.2.0` coincide con Next y es la única adición del lockfile. No hay cambios en RPC/RLS/migraciones, métricas ni tipos PostgreSQL.

## Verificaciones reproducibles

[Seguro] Node24.16.0, pnpm10.33.2/Corepack, Chromium Playwright1.63.0, macOS arm64, Nest/PostgreSQL17 Docker propios y transports externos sintéticos. La matriz no mockea autorización, sesión, permisos, ledger ni idempotencia SQL. Cada runner elimina sus contenedores y secretos sintéticos al finalizar. No se usaron menores reales, pagos/emails/push externos ni entornos productivos.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @asisteam/web-vite typecheck
corepack pnpm --filter @asisteam/web-vite test
corepack pnpm --filter @asisteam/web-vite test:e2e capabilities.spec.ts
corepack pnpm ci:checks
corepack pnpm ci:backend
corepack pnpm ci:staging
corepack pnpm ci:extended
corepack pnpm ci:qualification
git diff --check
```

[Seguro] En este host el `pnpm` global11 interfiere con subprocesses de Turbo. Se usó un shim temporal del PATH que ejecuta Corepack/pnpm10.33.2; no se modificó la versión del proyecto. La instalación offline no encontró paquetes; se completó con el lockfile congelado y red para las dependencias existentes.

[Seguro] Implementación verificada: `bf70623eee3244692dd98863c168209ecdc03e32`. Resultado final de los gates y SHA de implementación: [validation.json](validation.json). Las corridas iniciales detectaron fixtures de jsdom oculto, factura incompleta, versión no avanzada, selector SVG y escenarios que presuponían guardado optimista/membership ajena. Se corrigió la preparación/assertion de los tests, preservando las reglas de producto y repitiendo toda la matriz; no se eliminó ningún caso vigente.

| Gate sobre bf70623 | Resultado |
|---|---|
| ci:checks | PASS: lint/contratos/tipos/build/bundle; core150, web961, Vite125.84unitarias opt-in no se ejecutan aquí; se ejecutan en backend. |
| ci:backend | PASS: SQL1646/40suites, guards/métrica, HTTP/Auth/Worker,84integraciones sin omisiones, backup/PITR y limpieza/fallo controlado. |
| ci:staging | PASS: artefactos inmutables, roles, rollback manual/automático, integración PostgreSQL y limpieza local. |
| ci:extended | PASS:47Next+39Vite+1transporte;87recorridos sin omisiones, incluidos los4de #220. |
| ci:qualification | PASS técnico, aceptación NO-GO. Carga500atletas/5000registros,8celdas/192consultas, p95 máximo362.37ms. |
| Diff/auto-revisión | PASS; sin hallazgos abiertos ni cambios ajenos incluidos. |
| Proveedores reales/humano/producción | Omitido; requieren aceptación/provisión externas. CI remoto pendiente de la publicación del PR. |

## Auto-revisión y límites

[Seguro] Auto-revisión limitada al diff de #220 respecto de su base, incluyendo archivos nuevos. Se verificaron adaptación de imports, revalidación/feedback/borrador, autorización por grupo, input validado, checkout HTTPS, conservación de request_id/versión, token en fragmento/memoria y artefactos enmascarados. No quedan hallazgos abiertos introducidos por este cambio.

[Seguro] Las capturas anteriores se revisaron visualmente; la matriz comprueba un main/H1, reflow320/375/768/1024/1440 y cero violaciones automáticas axe acotadas. QR está enmascarado y las capturas no incluyen barra URL. No se versionan trazas, sesiones, tokens ni logs crudos. Los casos axe `incomplete`, lector de pantalla, zoom nativo200%, uso a una mano, dispositivos/push reales, sandbox Mercado Pago/Google/Apple/Resend y aceptación operacional mantienen su gate externo; estos resultados no certifican WCAG completa ni producción.

[Seguro] UI-10 (#180) conserva su rediseño pendiente. WEB-09/10 y #209 deben integrar artefacto/proxy/URLs públicas y aceptar la operación externa; no se retira Next ni se ejecuta corte/deploy real ni se apagan receptores remotos. El issue se referencia y el PR se entrega a `develop` sin cerrar ni mergear.


## Seguimiento del CI remoto · PR #230, 2026-10-11

[Seguro] La [corrida38189628149](https://github.com/AlexxSome/asisteam/actions/runs/38189628149), head `fe95c4c3106fff83a5f603c495c6e181543b9b21`, aprobó checks/backend/staging y los47recorridos Next. Extended falló en Vite:38/39PASS, ubicación `apps/web-vite/e2e/members.spec.ts:26:241`, conteo de dos «Cuenta propia» después del filtro ADMIN. Las cuatro pruebas de WEB-08 pasaron. El reporte publicado conserva ubicación/contadores, sin diagnóstico crudo ni datos sensibles.

[Probable] El conteo inmediato (`count()` + `toBe(2)`) sufría una carrera con la actualización visual de Router; la URL puede cambiar antes de la siguiente pintura. Esa aserción venía de WEB-06 (`744e4b93`) y la secuencia local previa pasó16/16, por lo que no hay evidencia de una discrepancia persistente de datos/permisos. Se sustituye por `await expect(locator).toHaveCount(2)`, que espera exactamente el mismo resultado sin cambiar datos, tiempos globales ni reintentos del runner.

[Seguro] Verificación posterior: lint y typecheck Vite PASS; la secuencia capabilities + groups-profile + members pasó16/16 en51.6s, con fixtures Nest/PostgreSQL reales y transportes externos sintéticos. Diff/auto-revisión PASS; solo cambió la sincronización de esa aserción y esta evidencia. No se repiten gates locales de SQL/backend que no fueron afectados; GitHub ejecuta todos los required en el nuevo head del mismo PR. Su estado vivo se consulta en [checks del PR230](https://github.com/AlexxSome/asisteam/pull/230/checks). La evidencia original de bf70623 se conserva como histórica y no se presenta como CI remoto del nuevo head.
