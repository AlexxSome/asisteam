# Suscripciones SaaS por club — HU-ADM-21 / #56 [P2 autorizado]

Decisión de producto del 03-10-2026: **el club paga a Asisteam**, mediante Mercado Pago. Esta decisión sustituye el alcance original de #56 sobre cuotas de deportistas. Un club/equipo/academia es el tenant `groups.id` actual; no se agrega una organización global ni cobros a integrantes.

## Catálogo y capacidad

| Código | Plan | CLP por mes | ATHLETE ACTIVE |
|---|---|---:|---:|
| TEAM | Equipo | 4.990 | 50 |
| CLUB | Club | 9.990 | 200 |
| ACADEMY | Academia | 15.990 | 1.000 |

Todos incluyen las mismas funciones. El importe entero CLP es el total enviado a la pasarela; no se calculan impuestos ni se agregan comisiones al cliente. ADMIN, COACH y GUARDIAN no consumen el cupo comercial. Una cuenta MANAGED sí consume un cupo cuando su membership ATHLETE está ACTIVE. Un ADMIN+ATHLETE consume un cupo por su rol ATHLETE.

- Grupos nuevos: pueden crearse/configurarse y contratar el servicio; no activan ATHLETE hasta el primer pago aprobado consultado a Mercado Pago. No hay plan gratuito ni prueba temporal implícita.
- Grupos anteriores al despliegue: snapshot privado `app_private.billing_legacy_groups`, conservan el límite histórico de 500 memberships ACTIVE hasta su primer plan pagado. El cliente no puede crear excepciones ni borrarlas.
- Grupos con un plan pagado: máximo operativo de 5.000 memberships ACTIVE, independiente de la facturación. Permite 1.000 deportistas, sus acompañantes y staff; no implica un plan sin límite. Además se aplica el cupo ATHLETE del último contrato pagado.
- Mora, pausa y cancelación conservan acceso, cupos ya habilitados e historial. Cancelar no recupera el límite legacy ni un plan anterior más grande. Un cambio de plan requiere cancelar renovación y contratar el nuevo, con nuevo ciclo mensual y sin prorrateo automático.
- Al bajar de plan, los miembros actuales permanecen; las altas/reactivaciones se bloquean si exceden el nuevo límite. Los cambios de estado compiten bajo lock del grupo y trigger de capacidad. R1 (menor/apoderado/consentimiento) y los 30 grupos por usuario continúan aplicando.
- Asistencia mantiene lotes transaccionales de hasta 500. La web divide «todos presentes» en lotes secuenciales y conserva los ya confirmados si falla uno. La lista muestra 50 por página y busca sobre la nómina completa cargada en páginas de 100.

## Permisos y datos

Solo ADMIN ACTIVE de ese grupo accede a `/groups/:groupId/billing`, con 403 para otros roles del propio grupo y 404 para otro tenant. No existen roles globales de facturación. La página es dinámica, sin cache compartida, con sesión SSR existente en cookies.

`billing_plans` contiene el catálogo; `group_subscriptions` conserva el plan/importe/límite contratado y los IDs/fechas/estado necesarios; `subscription_invoices` conserva una fila por factura remota. RLS activa y sin acceso base de clientes a suscripciones/facturas. `get_group_billing(group,page)` entrega solo el DTO ADMIN del tenant, historial de 50 filas y total vencido independiente de la página. No expone IDs internos del proveedor, correo del pagador ni payloads.

`begin_subscription_checkout`, `get_subscription_context`, `lookup_billing_subscription`, `claim_subscription_creation`, `reject_subscription_creation`, `sync_group_subscription` y `sync_subscription_invoice` tienen EXECUTE exclusivamente para service_role. El cliente no puede confirmar pagos, indicar precios/cupos ni suplantar al actor de una RPC. El correo de pago se valida y se transmite a Mercado Pago durante la creación; no se persiste ni se registra en logs de Asisteam. No se almacenan datos de tarjeta ni payloads completos del proveedor.

## Checkout, conciliación y eventos

`subscription-billing` autentica el JWT contra Supabase Auth, vuelve a comprobar el ADMIN en DB y toma precio, periodicidad, moneda y referencia del servidor. Crea una suscripción mensual sin plan asociado (`POST /preapproval`, `pending`) y entrega exclusivamente su checkout HTTPS alojado por Mercado Pago. El retorno del navegador no confirma pago.

La reserva local es única por grupo mientras exista un contrato abierto. Un único ejecutor puede reclamar el POST remoto. Después de un resultado incierto se busca por `external_reference` en `/preapproval/search`, sin repetir automáticamente la creación. Una respuesta definitiva de rechazo permite iniciar otro intento. Si el proveedor no encuentra la creación incierta, se mantiene el estado sin habilitar cupos: un operador debe comprobar la referencia en Mercado Pago antes de liberar esa reserva. No existe botón cliente para saltarse esa protección ni RPC de autopago.

`mercadopago-webhook` acepta los tópicos `subscription_preapproval`, `subscription_authorized_payment` y `payment`. Verifica HMAC-SHA256 de `x-signature`, `x-request-id` y `data.id` (normalizado a minúsculas), ventana de 10 minutos, y coincidencia del ID entre query/body. Luego consulta el recurso a la API fija de Mercado Pago. Los estados del body nunca son evidencia de pago. Comprueba referencia de contrato, colector, frecuencia mensual, importe CLP y asociación factura/suscripción. Para acreditar un pago consulta también `/v1/payments/:id`; AUTHORIZED no es PAID.

Eventos repetidos o antiguos no duplican ni regresan facturas, gracias a IDs únicos y `provider_updated_at`. Cancelar es terminal para esa suscripción. Eventos de contrato actualizan solamente su estado; eventos de factura/pago actualizan su factura. La acción ADMIN «Actualizar estado de pago» reconcilia contrato y facturas paginadas (incluye rechazos, reembolsos y contracargos consultados al proveedor). Una factura pendiente se muestra OVERDUE desde el día siguiente a `debit_date` en America/Santiago. No se inventan facturas mensuales ajenas a Mercado Pago ni se borra el ledger.

Errores usan `{error:{code,message,details:{}}}` y mensajes públicos en español. Los fallos de persistencia/proveedor retornan error para permitir reintento; no se confirma recepción exitosa antes de guardar.

## Migración de transporte · MIG-14 (#158)

[Seguro] [Contrato, handoff, continuidad y evidencia](migration/issue-158/README.md) migran página/acciones con BILLING=nest, checkout/conciliación/cancelación y receptor firmado a Nest sobre la misma base. Motor de proveedor compartido con Edge; ledger/cupos permanecen en SQL. La migración inicia LEGACY y habilita adaptadores privados mediante rol mínimo asisteam_billing solo tras quiescencia/handoff operativo. La URL anterior puede permanecer como relay que espera persistencia del único destino Nest. Retorno web/AUTHORIZED no acreditan PAID; reserva incierta no repite POST. Sandbox real y corte externo permanecen pendientes.

[Seguro] Variables privadas del runtime Nest y selector Next se documentan en ese runbook; las instrucciones Edge siguientes corresponden al ejecutor LEGACY. Tras el handoff no basta volver la bandera web a supabase: el gate SQL bloquea ese ejecutor. Mantener receptor antiguo mientras existan contratos que lo utilicen impide acreditar retiro completo de Supabase.

## Despliegue LEGACY y verificación del operador

Variables **exclusivamente en Supabase Edge secrets**, nunca `NEXT_PUBLIC_*` ni archivos versionados:

| Variable | Valor esperado |
|---|---|
| MERCADOPAGO_ACCESS_TOKEN | Credencial privada de la cuenta de Asisteam (pruebas y producción separadas) |
| MERCADOPAGO_WEBHOOK_SECRET | Secreto de firma de la aplicación Mercado Pago |
| MERCADOPAGO_COLLECTOR_ID | ID numérico de la cuenta cobradora de Asisteam |
| BILLING_WEB_URL | Origen HTTPS de la web, sin ruta; ej. `https://asisteam.example` |
| BILLING_WEBHOOK_URL | URL HTTPS pública de `functions/v1/mercadopago-webhook` |
| BILLING_ALLOWED_ORIGINS | Orígenes exactos separados por coma; default BILLING_WEB_URL |

SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los provee el runtime Edge. Sin configuración de MP el módulo falla cerrado, sin iniciar cobros ni habilitar cupos.

Después de aplicar migraciones y configurar secretos mediante el gestor de secretos del entorno:

```sh
pnpm exec supabase functions deploy subscription-billing --no-verify-jwt
pnpm exec supabase functions deploy mercadopago-webhook --no-verify-jwt
```

Ambas funciones validan su autenticación internamente: JWT de usuario en la primera, firma MP en la segunda. No debe activarse validación JWT de Supabase en el webhook de MP. Configurar la recepción de los tres tópicos con el secreto de la aplicación; para Suscripciones, la documentación de MP indica configurar la URL durante la creación (se envía `notification_url`). No usar IPN: carece de la validación de firma requerida.

Antes de habilitar producción, validar con credenciales de prueba de la cuenta real: checkout mensual CLP, entrega firmada de los tópicos, recuperación de creación incierta, primer pago, cobro posterior, rechazo, cancelación, reembolso y reintentos. Comprobar que importe, colector y referencia coincidan y que un simple retorno web no acredite pago. Esta validación externa no se sustituye por los mocks y requiere la cuenta/configuración MP del operador. No se ejecutaron cargos reales como parte del desarrollo.

Si un evento reintentado llega con firma fuera de la ventana temporal, se rechaza y puede reconciliarse mediante «Actualizar estado de pago». Si la creación quedó incierta, verificar en la API de MP que no existe contrato/cobro para la referencia antes de usar `reject_subscription_creation` como operador; jamás cambiar la fila a PAID manualmente. El acceso ya contratado permanece mientras se resuelve la incidencia.

## Validaciones locales reproducibles

```sh
pnpm typecheck
pnpm test
pnpm --filter @asisteam/web build
pnpm exec supabase test db
RUN_BILLING_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run subscription-billing.integration.test.ts
RUN_MANAGED_MEMBER_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run managed-member.integration.test.ts
pnpm exec supabase gen types typescript --local | python3 -c 'import sys; sys.stdout.write(sys.stdin.read().rstrip()+"\n")'
```

Las integraciones exigen Supabase Docker local, crean únicamente fixtures sintéticos y simulan el transporte Mercado Pago. Prueban JWT/tenant reales, reserva concurrente, pago verificado, dos altas que compiten por un cupo y consentimiento de menores. pgTAP cubre RLS, replay, precios, histórico, mora Chile, planes 50/200/1.000, acompañantes, downgrade, asistencia en dos lotes y reporte de 1.000 deportistas. Medición local observada: p95 11,654 ms en 20 consultas con 1.000 atletas y 1.000 registros (dato sintético, sin carga concurrente). Esta medición no garantiza el p95 de producción: revisar con la carga real antes de modificar la estrategia de reportes.

## Referencias primarias de Mercado Pago

- [Suscripción sin plan asociado y checkout pendiente](https://www.mercadopago.cl/developers/es/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments).
- [Crear preapproval](https://www.mercadopago.cl/developers/es/reference/online-payments/subscriptions/create-preapproval/post).
- [Consultar factura recurrente](https://www.mercadopago.cl/developers/es/reference/online-payments/subscriptions/get-authorized-payment/get) y [buscar facturas por suscripción/pago](https://www.mercadopago.cl/developers/es/reference/online-payments/subscriptions/authorized-payment-search/get).
- [Webhooks, tópicos y configuración de Suscripciones](https://www.mercadopago.cl/developers/es/docs/links-and-debts/additional-content/your-integrations/notifications/webhooks?scope=prod) y [validación de firma](https://www.mercadopago.cl/developers/es/docs/qr-code/additional-content/your-integrations/notifications/webhooks).
