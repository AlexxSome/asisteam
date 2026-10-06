# MIG-01 · Infraestructura, costos y calendario

[Seguro] El usuario confirmó **un desarrollador, ningún despliegue de producción ni usuario real, y solo datos de prueba** el 2026-10-06. No confirmó proveedor, región, presupuesto, dedicación, RPO/RTO ni ventana/observación. [Suposición] Las cantidades y objetivos siguientes son un escenario de discusión; **no constituyen un presupuesto aprobado, compra ni fecha comprometida**.

## Opción para evaluar antes del lanzamiento

[Probable] Evaluar AWS `sa-east-1` (São Paulo): PostgreSQL 17 gestionado en RDS, S3 privado y API/worker como **procesos separados en una sola VM** inicialmente. API y worker siguen siendo dos aplicaciones con límites y ciclo de vida separados; coubicarlos evita operar otra VM sin carga real medida. Una VM y una DB separadas para staging contienen exclusivamente fixtures sintéticos. Next.js conserva Vercel.

[Probable] Esta opción reduce servicios nuevos para una sola persona, pero obliga a mantener SO, TLS, contenedores, despliegue y recuperación de la VM. Single-AZ y una sola VM no ofrecen redundancia de aplicación/DB. El worker deberá tener límites de recursos para no agotar la API; separar su VM o aumentar capacidad depende de mediciones, no de estimaciones de usuarios inexistentes.

[Seguro] AWS documenta [peering Lightsail con RDS](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-set-up-vpc-peering-with-aws-resources.html) a través de la VPC por defecto de la región. [Probable] #147 debe comprobar red privada, subredes/grupos de seguridad, TLS PostgreSQL, salida a integraciones y credenciales distintas de staging; la existencia de peering no configura aislamiento por sí sola. RDS permanece sin acceso público. Si las restricciones de red no encajan, recotizar compute en la VPC requerida antes de elegir proveedor.

## Tarifas y cálculo reproducible

[Seguro] Fuentes consultadas el **2026-10-06**, USD sin impuestos: [Lightsail](https://aws.amazon.com/lightsail/pricing/), [RDS PostgreSQL](https://aws.amazon.com/rds/postgresql/pricing/), [S3](https://aws.amazon.com/s3/pricing/), [Vercel](https://vercel.com/pricing/), [Supabase](https://supabase.com/pricing/) y [Resend](https://resend.com/pricing/). [pricing.json](pricing.json) conserva filas y SKU oficiales RDS/S3 de `sa-east-1` con fecha de publicación; no usa precios históricos del doc 06.

[Suposición] Ejemplo: 730 horas/mes para DB, dos volúmenes gp3 de 20 GB, 10 GB de backups RDS facturables por encima de la asignación gratuita, 30 GB-mes de snapshots VM, 10 GB de archivos y 30 GB de dump/backups externos en S3, 100.000 GET y 10.000 PUT/LIST, un asiento Vercel Pro, correo dentro del plan gratuito. Los tamaños **no son el volumen medido** del proyecto.

| Partida | Cantidad del escenario × tarifa consultada | USD/mes calculado |
| --- | --- | ---: |
| API y worker coubicados | VM Lightsail Linux IPv4 4 GB; USD 24/mes | 24,00 |
| Worker, incremento de compute | Proceso en la VM anterior; capacidad reservada por medir | 0,00 |
| Compute staging | VM Lightsail Linux IPv4 2 GB; USD 12/mes | 12,00 |
| PostgreSQL destino Single-AZ | RDS `db.t4g.small`: 730 × 0,069 + gp3 20 × 0,219 | 54,75 |
| PostgreSQL staging Single-AZ | RDS `db.t4g.micro`: 730 × 0,034 + gp3 20 × 0,219 | 29,20 |
| Backups RDS adicionales | 10 GB-mes × 0,095 | 0,95 |
| Snapshots de VM | 30 GB-mes × 0,05 | 1,50 |
| Archivos S3 Standard | 10 GB-mes × 0,0405 | 0,405 |
| Dump/backups externos S3 | 30 GB-mes × 0,0405 | 1,215 |
| Requests archivos/backup | 100.000 × 0,00000056 + 10.000 × 0,000007 | 0,126 |
| Web Vercel Pro | Base un asiento, crédito de uso sujeto a consumo | 20,00 |
| Correo Resend | Plan Free ≤3.000/mes y ≤100/día | 0,00 |
| **Subtotal conocido del escenario** | Suma sin redondear partidas; redondeo final | **144,15** |
| Convivencia Supabase, si se contrata un Pro | Base USD 25; primer Micro cubierto por crédito de compute | +25,00 |
| **Subtotal con un Supabase Pro temporal** | 144,146 + 25 | **169,15** |

[Seguro] Las tarifas Lightsail incluyen transferencia con límites; São Paulo tiene la mitad de la transferencia anunciada en sus bundles. RDS burstable puede facturar créditos CPU adicionales. [Suposición] Los subtotales **no incluyen** egress S3/interservicios, exceso de compute/red, observabilidad/logs, DNS/dominio, soporte, impuestos, comisiones Mercado Pago ni horas de operación: `total = subtotal + C_red + C_excesos + C_observabilidad + C_DNS + C_soporte + C_impuestos + C_MP`. Esas partidas deben cotizarse con tráfico y cuentas reales antes de aprobar un techo.

[Seguro] No se inspeccionó el plan contratado de Vercel/Supabase; USD 20 y 25 son tarifas de un escenario, no un gasto actual confirmado. [Probable] Durante fases iniciales no es necesario provisionar simultáneamente toda la infraestructura final: empezar con staging sintético y compatibilidad sobre Supabase; habilitar DB/VM de destino cuando #150/#165 requieran ensayo. El escenario completo muestra el costo al tener ambos entornos, y no implica contratarlo ahora.

## Alternativas y continuidad

| Alternativa | Costo incremental del mismo escenario | Condición y estado |
| --- | ---: | --- |
| [Probable] Worker en VM separada de 2 GB | [Suposición] +USD 12; subtotal USD 156,15; con Supabase USD 181,15 | [Probable] Separar si compite por recursos o requiere despliegue independiente; configuración/monitorización adicionales. PENDIENTE. |
| [Probable] API con segunda VM de 4 GB y balanceador Lightsail | [Suposición] +USD 24 + 18; subtotal USD 186,15 antes de mejoras DB | [Probable] Solo si disponibilidad/carga lo exigen; no resuelve Single-AZ de DB. Multi-AZ debe recotizarse. PENDIENTE. |
| [Probable] PostgreSQL en DB Lightsail económica | [Seguro] La documentación consultada enumera hasta PostgreSQL 16, y el bundle USD 15 no cifra datos | [Probable] No seleccionarla sin verificar 17/cifrado/extensiones; preferir el candidato RDS 17. [Fuente](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-choosing-a-database.html). |
| [Probable] Plataforma de contenedores totalmente administrada | [Suposición] Sin cotización regional aceptada | [Probable] Pedir oferta de API/worker + RDS/S3 si administrar VPS supera la disponibilidad del único desarrollador; comparar costo mensual **y horas de operación**. PENDIENTE. |

[Seguro] [RDS documenta backups y PITR](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/managing-backup-restore.html) con retención configurable. [Probable] Proponer PITR 7 días, dump semanal cifrado fuera de la instancia, inventario/versionado de objetos y restauración ensayada; validar grants/extensiones en PostgreSQL 17 destino según [catálogo de extensiones RDS](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html). No asumir que un backup de DB incluye S3 ni que una tarifa garantiza RPO/RTO.

[Suposición] Para discutir: RPO ≤15 min y RTO ≤4 h, ventana de 2 h, observación de 7 días; sin aceptación ni medición todavía. [Probable] Si el ensayo no cumple esos tiempos o se requieren mayor disponibilidad/retención, ajustar infraestructura, presupuesto y calendario antes de lanzar con usuarios reales.

## Recalibración con un desarrollador

[Seguro] El rango inicial 12–16 semanas de #144 se basaba en **dos** desarrolladores y apoyo parcial QA/operación; esa capacidad no coincide con la cantidad confirmada. [Suposición] Adoptar **20–28 semanas** como referencia provisional con una persona dedicada, incluyendo sus tareas QA/operación. No equivale a duplicar linealmente el rango anterior, ni fija fechas de inicio/fin; su dedicación y experiencia siguen pendientes.

| Trabajo de recalibración | Dato/evidencia que falta | Responsable propuesto |
| --- | --- | --- |
| [Probable] Capacidad neta semanal | Horas disponibles menos QA/operación/soporte y otras features; identificar revisión de producto | Titular/desarrollador |
| [Probable] Prueba vertical #146–#150 | Tiempo real de ESM/core, entorno, roles/SQL y un flujo grupos/perfil | Desarrollador único |
| [Probable] Ensayo identidad/archivos | Hash/OAuth compatibles, trigger invitación/MANAGED, objetos y FK Auth | Desarrollador único · #150/#161/#164 |
| [Probable] Integraciones | Acceso a cuentas sandbox, Resend, Expo y cambio de webhook MP; no sustituir por mocks para aceptación externa | Desarrollador/operación · #158/#159 |
| [Probable] Lanzamiento antes de migrar | Si ingresan usuarios/pagos reales, volver a medir volumen, continuidad y ventana | Titular/producto |
| [Probable] Corte y recuperación | Tiempo de restauración, reconciliación, drenar jobs y observación #166/#167 | Desarrollador/operación |

[Probable] Registrar esfuerzo observado y actualizar el rango al completar la prueba vertical y ensayo #150. A menor dedicación, la duración aumenta y las esperas de proveedor agregan calendario; no mover automáticamente la meta móvil ni admitir offline/FCM/APNs para completar esta migración.
