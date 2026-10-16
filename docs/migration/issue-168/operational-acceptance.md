# MIG-24: aceptación operacional y handoff — 10-10-2026

[Seguro] Seguimiento vigente al 16-10-2026: #168 y #144 se cerraron administrativamente; la aceptación operacional pendiente se transfirió a [#209](https://github.com/AlexxSome/asisteam/issues/209). Alex (`@AlexxSome`) es responsable y aprobador del ensayo de **desarrollo**. El [registro de desarrollo](../issue-209/README.md) separa regresión sintética, destino local preparado, proveedores, decisiones y C-01…C-20. El cierre administrativo no acredita los gates siguientes ni aceptación de producción. El stack web actual es React/Vite/Router según doc06 y WEB-10; los resultados MIG-24 siguientes son históricos.

[Seguro] El retiro del repositorio no acredita el corte real. #166 y #167 figuran CLOSED por sus PR de ensayo; sus comentarios mantienen pendientes la aceptación externa y el NO-GO. [#166](https://github.com/AlexxSome/asisteam/issues/166) registra ensayo/runbook; [#167](https://github.com/AlexxSome/asisteam/issues/167) exige carga acordada, contratos de proveedores y validaciones humanas. Ningún responsable, ventana ni presupuesto RPO/RTO se infiere de ese cierre administrativo.

## Matriz de gates heredados y seguimiento de desarrollo

| Gate | Evidencia técnica disponible | Input externo y criterio de aceptación | Responsable/estado |
|---|---|---|---|
| Artefacto y regresión | CI checks/backend/staging y QA nativos; inventario sin SDK/CLI; 40 suites/1646 SQL, 50 guards y 80 casos/628 aserciones | SHA final aprobado y artefactos inmutables del mismo SHA | Alex en desarrollo; regresión y aceptación separadas en #209 |
| Destino PostgreSQL | Roles mínimos, catálogo/tipos, RLS y migración en bases desechables | URL privada/TLS, región/residencia aprobada, versión 17, pools/conexiones/capacidad y permisos comprobados en destino real | Alex en desarrollo; destino local preparado, aceptación pendiente |
| Datos y objetos privados | Transferencia congelada, FK/R1, checksums y delta, S3 privado en ambos extremos | Inventario autorizado real y reconciliación por tabla/objeto sin publicar PII; acceso, cifrado y retención aceptados | Alex en desarrollo; conjunto completo y retención pendientes |
| Identidad y proveedores | Auth nativo, recovery/login/claim/social con fixtures; IDs e historial preservados | Credenciales/orígenes/redirects Google y Apple reales, correo Resend y URLs firmadas/reintentos Mercado Pago; contratos y receipts verificados en sandbox correspondiente | Alex en desarrollo; proveedores pendientes |
| Worker y notificaciones | Leases/idempotencia/reclaim; persistencia antes de ACK; opt-in y recibos sintéticos | Un ejecutor autorizado, scheduler/zonas horarias, credenciales push y entrega/receipt real; plan móvil sigue independiente | Alex en desarrollo; recepción pendiente |
| Carga acordada | Ensayo sintético de 500 ATHLETE, 5000 registros y 192 solicitudes/8 celdas, p95 ≤500 ms | Volumen, concurrencia, períodos, dataset sintético aprobado y umbrales acordados para el entorno real; informe reproducible de ese entorno | Alex en desarrollo; carga adoptada/medida PASS, aceptación pendiente |
| Observabilidad | Logs sin passwords/tokens/PII, health/readiness y fallos controlados | Dashboards/alertas/Sentry conectados, rutas de aviso, guardia y umbrales comprobados en entorno destino | Alex en desarrollo; canal/alerta pendientes |
| Continuidad | Backup lógico, PITR, abort previo a escritura y recuperación hacia adelante con delta | RPO/RTO numéricos aprobados, backups externos cifrados/retención/acceso y ensayo restauración con reloj/carga destino; el presupuesto sintético de 60 s no es SLA | Alex en desarrollo; objetivos adoptados, restore local PASS, continuidad sostenida pendiente |
| Ventana y autoridad | Tooling exige writers congelados y destino nuevo sin historia | Hora/fecha/zona/duración aprobadas; lista completa de writers/receivers externos y plan verificable de mantenimiento/reintentos; decisión GO/NO-GO humana registrada | Alex coordina desarrollo; backups hasta07:30 del16-10-2026, aceptación final pendiente |
| Producto y legal | Roles, menores/consentimiento, V1–V6, métricas, axe/teclado/viewports automatizados | Validación humana de lector de pantalla/cancha y checklist legal C-01…C-20, aceptación por roles, soporte y comunicación al usuario | Alex sigue desarrollo; revisión competente y humana pendientes |

## Secuencia de handoff

1. El coordinador completa cada celda con responsable, enlace a evidencia, fecha y aprobación. Una ausencia mantiene **NO-GO**.
2. Adjunta los informes del SHA final, manifiesto del artefacto y configuración privada validada. Los reportes públicos solo contienen counts, checks y hashes; secretos/snapshots permanecen fuera del repositorio.
3. Reproduce primero `pnpm ci:checks`, `pnpm ci:backend`, `node scripts/ci/probe.mjs`, `pnpm ci:staging`, `pnpm ci:extended` y `pnpm ci:qualification` en fixtures sintéticos. Estos comandos no son deploy ni corte externo.
4. El operador prepara una copia del procedimiento de congelación/transferencia de `packages/db/scripts/cutover.mjs` para el destino autorizado. Debe enumerar todos los writers, parar procesos y receptores externos según contrato, revocar CONNECT, terminar sesiones y comprobar **cero writers** antes del snapshot. Los helpers rechazan writers abiertos, catálogo/ledger/checksums divergentes y restauración sobre historia existente.
5. El GO humano autoriza la ventana y el procedimiento externo exactos. Antes de la primera escritura el abort vuelve al único origen autorizado; después de nuevas escrituras la recuperación usa el delta y un destino nuevo, nunca retrocede datos ni reabre dos autoridades.
6. Registra reconciliación, proveedores/reintentos, observabilidad, RPO/RTO medidos y aceptación de producto en #209. #168 se cerró por entrega técnica y transferencia explícita; completar la aceptación de desarrollo exige esa evidencia y decisión de Alex, y no autoriza producción.

[Seguro] No se ejecutó deploy/corte real, apagado de receptores, borrado de recursos/datos ni merge automático. La aceptación externa no obliga a conservar tooling Supabase en el repositorio.
