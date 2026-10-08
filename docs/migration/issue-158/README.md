# MIG-14 · Billing y webhook Mercado Pago en Nest (#158)

[Seguro] Base `7fe73371849cf5095f8c530c938abf56fcbbbc64` de `origin/develop`; rama `codex/158-billing-mercadopago-nest`, fecha 2026-10-07. Dependencias #149/#151/#152/#157 cerradas y verificadas integradas. Se preserva el cambio ajeno de `apps/web/next-env.d.ts`. Código localizado con graphify actualizado sobre la base.

## Contrato y fuente canónica

[Seguro] [Billing Nest](../../../apps/api/src/billing.ts) añade `GET /api/v1/groups/:groupId/billing?page=1` y `POST /api/v1/billing/subscriptions` (checkout/sync/cancel), con OpenAPI/SDK generados desde core. SessionGuard verifica identidad; Database.authenticated exige sesión/perfil/consentimiento vigentes y ADMIN ACTIVE del grupo: rol propio no autorizado403, otro tenant404. El cliente rechaza actor/precio/cupo/estado extra. La web selecciona BILLING=nest en página y Server Action; conserva cookies SSR/tokens exclusivamente servidor, no-store, errores españoles, confirmación y revalidación posterior al acuse.

[Seguro] `POST /api/v1/billing/mercadopago-webhook` es público con firma propia; no usa un JWT ni está expuesto como método del SDK. El [motor compartido](../../../packages/core/src/billing/handler.ts) conserva las comprobaciones y consultas del backend Edge, mediante sus reexports Deno: HMAC SHA256, ventana10min, IDs acotados/minúsculas para firma, igualdad query/body, colector, referencia, CLP/monto mensual del servidor y relación factura/contrato/pago. IDs repetidos en query se rechazan; evento payment sin facturas verificables devuelve503 para reintento/conciliación.

[Seguro] El proveedor usa exclusivamente `https://api.mercadopago.com`, rechaza redirects y tiene deadline12s por consulta. `/authorized_payments/search` pagina100 hasta10.000; una reconciliación incompleta falla, conserva lo confirmado y puede repetirse idempotentemente. Cada escritura SQL confirma antes del éxito HTTP. Fallos de proveedor/persistencia retornan error, sin payload/SQL/PII/tokens en logs. HTTP/API cliente deben configurar60s (máximo120s); el timeout no cancela una creación remota o escrituras ya confirmadas.

[Seguro] Las siete funciones SQL de producto pasan a `app_private.billing_canonical_*`; conservan sus cuerpos/invariantes sin reimplementar precios/cupos/ledger en Nest. Adaptadores públicos LEGACY mantienen firmas/grants para Edge; adaptadores privados NEST solo conceden EXECUTE a `asisteam_billing`. Ambos comprueban el modo SQL con lock compartido. Los operadores de confianza conservan acceso canónico para pruebas/conciliación; ningún runtime puede saltarse el gate, cambiar el modo ni leer/escribir tablas base. No existe bypass de RLS/ownership/service_role en Nest. El rol API solo obtiene EXECUTE de `get_group_billing`, cuyo DTO ADMIN omite IDs privados/PII del proveedor.

[Seguro] La reserva por grupo y claim transaccional permiten un único POST remoto incluso con dos instancias/transportes. La reserva se confirma antes de contactar MP. Una respuesta incierta se recupera por external_reference sin repetir automáticamente POST; ausencia/ambigüedad permanece409. Solo rechazo definitivo permite nuevo intento. Retorno web y AUTHORIZED nunca acreditan PAID: se consulta `/v1/payments/:id`. Replay/antiguos usan claves únicas y provider_updated_at; cancelación terminal, cobros/reversiones separados del contrato, mora Chile y cupo del último contrato pagado mantienen el SQL existente. No se borran ledger ni miembros por cancelación/reembolso/downgrade.

## Configuración y handoff

[Seguro] Variables privadas del proceso Nest: BILLING_DATABASE_URL, MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET, MERCADOPAGO_COLLECTOR_ID, BILLING_WEB_URL, BILLING_WEBHOOK_URL. La primera debe apuntar al mismo host/puerto/base que DATABASE_URL con rol `asisteam_billing`; el migrador lo crea NOLOGIN y el operador provisiona LOGIN/clave/TLS en su gestor de secretos. Nunca conectar como postgres, service_role o propietario. URLs HTTPS sin credenciales/query; web es origen sin ruta. Sin configuración el módulo falla cerrado. No incluir secretos en Next ni NEXT_PUBLIC.

[Seguro] La migración instala **LEGACY**, por lo que aplicar SQL/compilar no corta tráfico. Después de verificar el artefacto compatible en el entorno:

1. Congelar checkout/sync/cancel durante la ventana; configurar `BILLING_TRANSPORT_DISABLED=1` y retirar/deshabilitar todas las versiones anteriores de subscription-billing. Bloquear nuevas invocaciones y esperar las solicitudes HTTP/DB/proveedor activas. El flag solo afecta versiones que lo leen: retirar versiones viejas es obligatorio.
2. Deshabilitar el receptor Edge con ejecución propia mientras se drena. Los eventos fallidos deben reintentarse/conciliarse; nunca devolver200 mientras el destino no está disponible. Verificar ausencia de procesos suspendidos y solicitudes inciertas al proveedor; un plazo fijo no lo demuestra. Conciliar toda creación incierta mediante búsqueda por referencia, sin repetir POST ni liberar reserva sin evidencia de ausencia remota.
3. Mantener el receptor Nest compilado/configurado y la misma DB. Ejecutar como operador `select app_private.billing_handoff(true);` solo tras demostrar quiescencia. El booleano es constancia operativa; SQL espera transacciones antiguas pero no puede cancelar HTTP en curso. El runtime nunca tiene permiso de handoff.
4. Activar `ASISTEAM_TRANSPORT_BILLING=nest`, origen API, mismo proyecto Supabase y timeouts60s en Next/Nest. Nuevos contratos reciben BILLING_WEBHOOK_URL terminado en `/api/v1/billing/mercadopago-webhook`.
5. Para contratos existentes que conservan la URL Supabase, desplegar [receptor antiguo](../../../supabase/functions/mercadopago-webhook/index.ts) con `BILLING_NEST_WEBHOOK_URL` HTTPS hacia esa ruta Nest. Puede mantenerse `BILLING_TRANSPORT_DISABLED=1` en Edge: relay no instancia el motor legado. Reenvía solo body, data.id, x-signature y x-request-id, sin JWT/credenciales del cliente. No sigue302; solo un200 del destino después de persistir es200 al proveedor. Cualquier fallo/202/redirect devuelve503. El destino conserva la verificación de firma original y es el único ejecutor.
6. Comprobar tópicos subscription_preapproval/subscription_authorized_payment/payment por ambas URLs, replay, recibos en ledger y rechazo por fallo DB. Reconciliar backlog mediante acción ADMIN y comparar IDs/conteos/cupos. Abrir de nuevo checkout al terminar.

[Seguro] Rollback restaura el artefacto Nest compatible y mantiene modo NEST, misma DB, reservas y ledger; no volver a Supabase mediante solo una bandera ni recuperar snapshot anterior a escrituras. La API antigua de efectos queda bloqueada en NEST. Cualquier retorno de ejecutor requiere otro procedimiento de quiescencia/reconciliación; este entregable no lo automatiza.

## Continuidad de contratos y límite externo

[Seguro] El relay implementado mantiene accesible la URL antigua mientras MP la utilice. **Supabase no puede retirarse por completo mientras esa URL dependa de Edge**. El inventario operativo debe identificar contratos existentes y su notification_url sin publicar datos privados. Mantener el relay hasta confirmar que todos migraron su receptor o terminaron y agotaron reintentos; contratos/ledger permanecen históricos.

[Probable] Cambiar la configuración general de la aplicación MP no garantiza modificar notification_url de contratos ya creados. La integración entregada no altera esos contratos ni ejecuta PUT de cambio de URL por inferencia. El operador debe validar la actualización compatible en sandbox con recibos reales antes de planificar su retiro (#166/#168).

[Seguro] Sandbox MP real permanece **PENDIENTE**: no hay cuenta/credenciales sintéticas de proveedor configuradas/autorizadas en esta sesión. Matriz pendiente: checkout CLP, primer/pago recurrente, rechazo, cancelación, reembolso/contracargo, búsqueda incierta, firma/replay y entregas de un contrato anterior por URL antigua/nueva. No se ejecutaron cargos reales. Los mocks no sustituyen esa evidencia ni acreditan corte productivo.

## Evidencia local

[Seguro] macOS arm64, Node24.16.0/pnpm10.33.2, Docker/Supabase PostgreSQL17 local sintético. Resultados iniciales y repeticiones finales se registran aquí:

| Check | Resultado |
| --- | --- |
| Lint/typecheck/build/contrato/CI checks | PASS; core150, web886 en la corrida completa inicial; repetición web final889 tras conservar3 tests legacy, lint y typecheck finales PASS. Las81 opt-in omitidas en unitarias se ejecutaron separadamente |
| Billing unitarias web / API | PASS:44 web (motor19+panel19+acciones6),13 API totales (incluye3 billing) |
| Billing integración HTTP/PostgreSQL | PASS,0 omitidas: rol/tenant, precio/actor extra, dos solicitudes/único POST, reserva incierta recuperada, firma/replay, retorno/AUTHORIZED sin PAID, mora, reversión/contracargo,102 facturas/páginas, cancelación terminal, relay/acuse/fallo persistencia |
| pgTAP nuevo / canónico billing | PASS17 +53 assertions; tests temporales conceden solo SET/admin y USAGE de helpers pgTAP dentro de BEGIN/ROLLBACK |
| Tipos regenerados | PASS: públicos idénticos; wrappers conservan firmas, funciones nuevas privadas |
| Edge Deno local | PASS: motor compartido rechaza firma ausente401; relay rechaza IDs ambiguos400 |
| Backend completo | FAIL: únicamente pgTAP send_invitations #15 preexistente; todos los módulos HTTP Nest y worker PASS. Edge quedó sin ejecutar en esa corrida y se ejecutó separadamente abajo |
| Portabilidad PostgreSQL17.9 | PASS: restauración, RLS/roles mínimos, inventarios/contratos y cleanup. Fallo inyectado esperado FAIL y cleanup posterior PASS |
| Integraciones Edge separadas | PASS81/81,0 omitidas,52.62s |
| Playwright MIG-14 | PASS1/1,0 omitidas,9.6s: Chromium/macOS arm64,375×812, Next→Nest→PostgreSQL, ADMIN, resumen/historial vacío, retorno sin PAID, teclado, error de proveedor, layout y axe. No hubo lector humano ni checkout externo |
| CI remoto | PENDIENTE; no acreditado por los checks locales |
| Sandbox MP y handoff externo | PENDIENTE, sin cargos ni corte |

[Seguro] Reproducción: `pnpm ci:checks`, `pnpm ci:backend`, `API_RLS_TEST=1 pnpm --filter @asisteam/api exec node --test test/billing.integration.mjs`, `pnpm exec supabase test db supabase/tests/billing_nest.test.sql supabase/tests/group_subscriptions.test.sql`, `ASISTEAM_QA_NEST=1 pnpm --filter @asisteam/web test:e2e:full --grep MIG-14`. SQL/HTTP crean fixtures con IDs aleatorios y restauran roles/modo; no resetean ni borran fixtures ajenos. El bootstrap de portabilidad incluye el nuevo rol mínimo para reconciliar ACLs en PostgreSQL17.9 independiente.

[Seguro] El fallo global se reproduce usando el archivo **exacto de la base**: `git show 7fe73371849cf5095f8c530c938abf56fcbbbc64:supabase/tests/send_invitations.test.sql > /tmp/issue158-base-send-invitations.test.sql`, seguido de `pnpm exec supabase test db /tmp/issue158-base-send-invitations.test.sql`: FAIL15, count global observado1/esperado0,50/51 assertions aprobadas. Es la aserción «rechazos no consumen cuota», cuyo conteo no se limita al fixture de la prueba. La fila corresponde al grupo QA120 `01200000-0000-4000-8000-000000005000`, creado2026-10-05 17:05:36 UTC; contador día2026-10-07,attempts4. [MIG-13](../issue-157/README.md#evidencia) ya documenta el mismo caso.

[Seguro] Diagnóstico aislado: copiar ese archivo añadiendo `delete from app_private.invitation_send_limits where group_id='01200000-0000-4000-8000-000000005000';` inmediatamente después de su BEGIN, ejecutar la copia con Supabase pgTAP y conservar su ROLLBACK: PASS51/51. Al terminar la fila original sigue presente con los mismos metadatos; no se cambia el test versionado ni se elimina el fixture ajeno. Billing no escribe cuotas de invitación. Las81 Edge se ejecutaron después mediante el runner `withEdge` y `check('product-integrations',...)` de `scripts/ci/backend.mjs`, con `requireAll:true`, para que el stop previo no las oculte.

[Seguro] Los gates de la migración billing (RLS/roles17 y reglas canónicas53), tipos e integraciones pertinentes pasan. La política de PR exige pgTAP completo verde: **el resultado local global FAIL no acredita ese gate**. La entrega es un PR draft para revisión; merge y corte quedan bloqueados hasta disponer del check global verde en entorno limpio y completar la validación externa exigida. No se modifica alcance ajeno para ocultar el fallo ni se declara CI remoto aprobado.

[Seguro] Auto-revisión final contra la base corrigió dos supuestos de tests: conservó las3 pruebas legacy de Server Actions al añadir3 Nest y usó el historial vacío real del fixture Playwright. Los cambios finales de tests se verificaron con889 unitarias web, lint/typecheck y Playwright afectados. Los fallos previos de compilación de tipos compartidos y restauración del rol billing se corrigieron y sus gates repitieron PASS; no quedan hallazgos introducidos identificados.
