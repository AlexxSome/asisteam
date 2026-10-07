# MIG-01 · Inventario y propuestas de migración

[Seguro] Entregable documental del [issue #145](https://github.com/AlexxSome/asisteam/issues/145), dentro de la [épica #144](https://github.com/AlexxSome/asisteam/issues/144). Fecha: **2026-10-06**. Base inventariada: `ecf2864955cae6b692f98bbcd992d5f1085755e0`, coincidente con `origin/develop` al iniciar. El backend entregado sigue siendo Supabase; Nest es el destino planificado.

[Seguro] El issue y la épica no confirman producción, usuarios reales, volumen ni capacidad efectiva del equipo. La invocación de la skill autoriza revisar y publicar el PR documental; no acepta las decisiones de negocio e infraestructura. Esos datos y acuerdos permanecen **PENDIENTES**. No se consultaron registros, credenciales, objetos ni pagos reales.

## Entregables

| Documento | Contenido y estado |
| --- | --- |
| [Contratos](contracts.md) | [Seguro] 49 RPC web, 16 destinos PostgREST, diez métodos Auth, archivos y consumidor exacto. [Probable] Destinos Nest, DTO, pruebas de paridad y responsable por operación. |
| [Snapshot de inventario](inventory.json) | [Seguro] Firmas actuales, referencias con línea, hashes, 33 migraciones, 150 declaraciones/121 nombres de función SQL, 33 archivos pgTAP y tratamiento por función. |
| [Runtime e integraciones](runtime.md) | [Seguro] Seis Edge Functions, dos jobs, Storage, extensiones y nombres de configuración. [Probable] Sustitución y comprobaciones externas pendientes. |
| [ADR-001](adr-001.md) | [Probable] Arquitectura objetivo, worker, RLS, identidad, contratos y corte; **propuesta pendiente de aceptación**. |
| [Infraestructura y presupuesto](infrastructure.md) | [Seguro] Tarifas oficiales consultadas. [Suposición] Dimensionamiento/costos de un escenario, RPO/RTO y calendario sin compromiso. |
| [Tarifas regionales](pricing.json) | [Seguro] Filas pertinentes de los catálogos públicos AWS RDS/S3, publicación, SKU y tarifa, sin credenciales. |
| [Validador documental](validate.py) | [Seguro] Comando reproducible de hashes, referencias, contratos, enlaces y aritmética; no ejecuta suites de runtime ni consulta proveedores. |
| [Evidencia y gate documental](evidence.md) | [Seguro] Método autorizado, alcance, resultado de checks y límites. |

## Decisiones y responsables pendientes

[Probable] Cada contrato asigna la ejecución al rol **desarrollador asignado** y al issue de migración correspondiente. La cantidad de personas, sus nombres, disponibilidad efectiva y responsables de aceptación de producto/operación permanecen PENDIENTES. El escenario con un desarrollador es un supuesto de estimación, no una confirmación de equipo.

| Decisión | Propuesta o dato necesario | Responsable propuesto | Estado |
| --- | --- | --- | --- |
| Operación actual | [Seguro] Sin evidencia de producción/usuarios/datos en los issues; confirmar entornos activos y naturaleza de los datos | Titular del proyecto | PENDIENTE |
| Capacidad del equipo | [Suposición] Escenarios de uno/dos desarrolladores; confirmar cantidad y dedicación semanal | Titular/desarrollador | PENDIENTE |
| Proveedor/región | [Probable] Evaluar AWS `sa-east-1`, RDS 17 y S3 privado; validar operación y cuentas | Producto/operación | PENDIENTE |
| Presupuesto mensual | [Suposición] Escenario de referencia USD 144,15 + consumos; USD 169,15 con un Supabase Pro temporal | Titular del proyecto | PENDIENTE; no autorización de gasto |
| Volumen de prueba y lanzamiento | [Seguro] Usuarios reales, tamaño DB/archivos, crecimiento y concurrencia no confirmados ni medidos | Desarrollador/operación | PENDIENTE |
| Identidad y sesiones | [Probable] Mantener `public.users.id`; importar identidad ensayada y renovar sesiones; cero credenciales para MANAGED | Desarrollador/producto | PENDIENTE de ADR y ensayo #150/#164 |
| RPO/RTO | [Suposición] Evaluar RPO ≤15 min y RTO ≤4 h, con restauración medida | Producto/operación | PENDIENTE |
| Ventana y observación | [Suposición] Ventana de 2 h y observación de 7 días después de ensayo; si aún no hay usuarios, corte previo al lanzamiento | Producto/operación | PENDIENTE |
| Webhook Mercado Pago | [Seguro] El código fija URL al crear el contrato; no implementa actualizarla. [Probable] Ensayo sandbox/confirmación del proveedor antes del retiro | Desarrollador/operación · #158 | PENDIENTE EXTERNO |
| Fecha de migración | [Suposición] Referencia con un desarrollador: 20–28 semanas; volver a estimar con dedicación/ensayos | Titular/desarrollador | PENDIENTE; no fecha comprometida |

## Criterios de #145

- [Seguro] Inventario local y matriz entregados con destino propuesto, consumidor, permisos, efectos, referencias de prueba y responsable. Las brechas de [doc 05](../../05-pantallas.md) siguen siendo pendientes de producto.
- [Seguro] Proveedor/región, presupuesto, identidad, corte y riesgos tienen una propuesta explícita y un registro de decisión; **todavía no están acordados**.
- [Seguro] La referencia 12–16 semanas suponía dos desarrolladores. [Suposición] El escenario de uno, 20–28 semanas, sigue siendo una referencia provisional; faltan cantidad/dedicación confirmadas y medir el ensayo de portabilidad.
- [Seguro] Se conserva COACH/billing/anuncios/QR/social autorizados en #55–#59. Móvil Java/Swift, offline/geocerca y FCM/APNs permanecen separados.
- [Seguro] El cierre de MIG-01 queda pendiente de aceptar el ADR, presupuesto, responsables y continuidad, además de completar los ensayos externos indicados. El PR no cierra el issue.
