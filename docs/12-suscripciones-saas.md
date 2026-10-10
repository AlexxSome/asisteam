# Suscripciones SaaS por club — HU-ADM-21 / #56 [P2 autorizado]

[Seguro] Vigencia MIG-24 (#168, 2026-10-10): Nest/Node24, PostgreSQL17 independiente, Auth propio y S3 privado son el único stack del repositorio. Dominio, RLS/V1–V6, menores, consentimientos y métricas se mantienen. [Evidencia y aceptación externa](migration/issue-168/README.md). Producción continúa NO-GO; no ejecutar corte/deploy real ni apagar receptores remotos.


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

`begin_subscription_checkout`, `get_subscription_context`, `lookup_billing_subscription`, `claim_subscription_creation`, `reject_subscription_creation`, `sync_group_subscription` y `sync_subscription_invoice` tienen EXECUTE exclusivamente para asisteam_billing. El cliente no puede confirmar pagos, indicar precios/cupos ni suplantar al actor de una RPC. El correo de pago se valida y se transmite a Mercado Pago durante la creación; no se persiste ni se registra en logs de Asisteam. No se almacenan datos de tarjeta ni payloads completos del proveedor.

## Checkout, conciliación y eventos

El controller Nest autentica el JWT contra Auth propio de Nest, vuelve a comprobar el ADMIN en DB y toma precio, periodicidad, moneda y referencia del servidor. Crea una suscripción mensual sin plan asociado (`POST /preapproval`, `pending`) y entrega exclusivamente su checkout HTTPS alojado por Mercado Pago. El retorno del navegador no confirma pago.

La reserva local es única por grupo mientras exista un contrato abierto. Un único ejecutor puede reclamar el POST remoto. Después de un resultado incierto se busca por `external_reference` en `/preapproval/search`, sin repetir automáticamente la creación. Una respuesta definitiva de rechazo permite iniciar otro intento. Si el proveedor no encuentra la creación incierta, se mantiene el estado sin habilitar cupos: un operador debe comprobar la referencia en Mercado Pago antes de liberar esa reserva. No existe botón cliente para saltarse esa protección ni RPC de autopago.

`mercadopago-webhook` acepta los tópicos `subscription_preapproval`, `subscription_authorized_payment` y `payment`. Verifica HMAC-SHA256 de `x-signature`, `x-request-id` y `data.id` (normalizado a minúsculas), ventana de 10 minutos, y coincidencia del ID entre query/body. Luego consulta el recurso a la API fija de Mercado Pago. Los estados del body nunca son evidencia de pago. Comprueba referencia de contrato, colector, frecuencia mensual, importe CLP y asociación factura/suscripción. Para acreditar un pago consulta también `/v1/payments/:id`; AUTHORIZED no es PAID.

Eventos repetidos o antiguos no duplican ni regresan facturas, gracias a IDs únicos y `provider_updated_at`. Cancelar es terminal para esa suscripción. Eventos de contrato actualizan solamente su estado; eventos de factura/pago actualizan su factura. La acción ADMIN «Actualizar estado de pago» reconcilia contrato y facturas paginadas (incluye rechazos, reembolsos y contracargos consultados al proveedor). Una factura pendiente se muestra OVERDUE desde el día siguiente a `debit_date` en America/Santiago. No se inventan facturas mensuales ajenas a Mercado Pago ni se borra el ledger.

Errores usan `{error:{code,message,details:{}}}` y mensajes públicos en español. Los fallos de persistencia/proveedor retornan error para permitir reintento; no se confirma recepción exitosa antes de guardar.

## Runtime y operación vigente

[Seguro] Nest recibe checkout/conciliación/cancelación y webhook MP firmado. asisteam_billing tiene únicamente capacidades privadas SQL; autoridad NEST exclusiva. Ledger/cupos/locks siguen canónicos; retorno web no confirma pago, reserva incierta no repite POST y webhook solo ACK tras persistencia. Código relay y dispatchers origen se retiraron del repositorio; no se apagan receptores remotos por inferencia.

[Seguro] Variables privadas de API: MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET, MERCADOPAGO_COLLECTOR_ID, BILLING_WEB_URL y BILLING_WEBHOOK_URL; URLs HTTPS y secreto externo. Ninguna credencial llega a NEXT_PUBLIC o al repositorio. MP externo/URLs/reintentos requieren recibos de sandbox y aprobación operacional.

## Validaciones locales reproducibles

```bash
pnpm ci:checks
pnpm ci:backend
pnpm ci:extended
```

[Seguro] HTTP Nest/Auth/PostgreSQL reales, transporte MP sintético, reserva concurrente/pagos/idempotencia/cupos/consentimiento. SQL preserva RLS/precios/historial/mora Chile/planes50–200–1000, acompañantes/downgrade/lotes/reportes. Calificación usa500 atletas/5000registros y192requests SQL/HTTP; la carga de producción debe acordarse y verificarse externamente.

## Referencias primarias de Mercado Pago

- [Suscripción sin plan asociado y checkout pendiente](https://www.mercadopago.cl/developers/es/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments).
- [Crear preapproval](https://www.mercadopago.cl/developers/es/reference/online-payments/subscriptions/create-preapproval/post).
- [Consultar factura recurrente](https://www.mercadopago.cl/developers/es/reference/online-payments/subscriptions/get-authorized-payment/get) y [buscar facturas por suscripción/pago](https://www.mercadopago.cl/developers/es/reference/online-payments/subscriptions/authorized-payment-search/get).
- [Webhooks, tópicos y configuración de Suscripciones](https://www.mercadopago.cl/developers/es/docs/links-and-debts/additional-content/your-integrations/notifications/webhooks?scope=prod) y [validación de firma](https://www.mercadopago.cl/developers/es/docs/qr-code/additional-content/your-integrations/notifications/webhooks).
