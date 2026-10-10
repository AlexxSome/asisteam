# MIG-24 (#168): retiro completo del repositorio, en reparación

[Seguro] El alcance vigente exige retirar código, SDK, configuración, fixtures, tooling y CI Supabase del repositorio, conservando las reglas y cobertura del producto en PostgreSQL/Nest/Next independientes. La instrucción anterior de conservar receptores Mercado Pago y pruebas de origen quedó sustituida por «ci con error y no es necesario dejar cosas de supabase». No se autoriza destruir recursos remotos, borrar datos ni ejecutar el corte real.

[Seguro] El retiro todavía está incompleto. El CI inicial del PR [#206](https://github.com/AlexxSome/asisteam/pull/206), commit `6ffbf2d5e3b40b550b33d9c69047e9945d71869d`, falló. Las reparaciones incrementales siguientes se verifican y publican en el mismo PR; los resultados locales no acreditan CI remoto verde.

## Reparaciones verificables

- Se reemplazaron las 39 suites web archivadas (466 casos) por 472 casos del producto nativo, sin omisiones. El [mapa de equivalencia](native-web-coverage.md) registra origen, reemplazo y alcance. Los snapshots, alias y manifest del archivo web se retiraron después de probar la equivalencia.
- Las integraciones API y worker usan PostgreSQL independiente con fixture desechable, JWT y familias nativas. Las pruebas mantienen permisos, concurrencia, menores/consentimientos, historial, métricas, invitaciones, Google/Apple, archivos privados, facturas y persistencia tras reinicio.
- El relay Mercado Pago de core y su receptor Edge del repositorio se retiraron. Billing prueba directamente HTTP Nest, firma/replay, fallo de escritura antes del ACK y reintento duradero. No se conserva código del receptor anterior por hipótesis de reintentos externos.
- El reconciliador de archivos utiliza S3 privado en ambos extremos, verifica referencias, contenido, checksum, privacidad y delta final. No necesita CLI/SDK/Storage Supabase.
- La batería SQL canónica de métrica pasó a `packages/db/tests/report_metrics.test.sql` sin eliminar sus assertions. El esquema canónico y las reglas RLS no se modificaron en esta reparación.
- El smoke Chromium verifica logout de la familia actual, revocación de su refresh, conservación de otra sesión/dispositivo y logout anónimo idempotente.

## Trabajo que bloquea la entrega

[Seguro] Graphify no identifica íntegramente los archivos SQL, fixtures y consumidores de tooling restantes. La skill requiere autorización antes de usar una navegación alternativa. Está pendiente la excepción acotada solicitada por el coordinador; no se ejecutó ese inventario por otros medios.

[Seguro] Hay 80 casos web de integración condicionados por flags cuyos contratos todavía deben reconciliarse íntegramente con pruebas nativas. Tampoco se acreditó equivalencia de toda la batería SQL/RLS de origen. Las pruebas actuales aprobadas no justifican eliminar esos gates. La propuesta de reemplazo completo de backend CI está preparada pero no aplicada: sustituir esos gates sin esta evidencia reduciría cobertura. La reparación incremental sí ejecuta las suites portadas en PostgreSQL desechable y mantiene obligatorios los gates existentes de SQL, tipos, portabilidad y las 80 integraciones, con guards de cobertura.

[Seguro] Por tanto, siguen pendientes el retiro restante de SDK/dependencias/configuración/tooling/SQL y fixtures identificados, actualización coherente de lockfile/CI/documentación canónica y auto-revisión del retiro final. La publicación incremental corrige CI sin representar ese retiro completo; verificar checks remotos del head publicado. No se declara repositorio libre de Supabase ni #168 completo.

## Evidencia y límite operativo

[Seguro] La [evidencia inicial](evidence.md) registra el alcance anterior y sus verificaciones; sus PASS no corresponden a las reparaciones pendientes actuales. El mapa web enlazado acredita solo sus casos identificados. Los [resultados locales actuales](rework-evidence.md) y su [JSON saneado](rework-results.json) indican omisiones y fallos.

[Seguro] Producción continúa **NO-GO**: #166/#167 requieren aceptación operativa, responsables, ventana, carga/proveedores/observabilidad reales y RPO/RTO aprobados. Estas condiciones externas no son motivo para retener código Supabase en el repositorio. El PR no ejecuta corte, merge ni cierre del issue.
