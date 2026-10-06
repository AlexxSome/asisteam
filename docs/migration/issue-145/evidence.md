# MIG-01 · Evidencia y validación

[Seguro] Fecha: 2026-10-06 · entorno: checkout local macOS, documentación y datos sintéticos · base: `ecf2864955cae6b692f98bbcd992d5f1085755e0` · rama: `feature/145-inventariar-contratos-arquitectura-infraestructura`. Los resultados corresponden al contenido de este PR; las suites citadas en la matriz son referencias, no ejecuciones nuevas.

## Método y alcance autorizado

1. [Seguro] Lectura de #145/#144 con `gh`, skill issue-sol-max y AGENTS.md; estado inicial de Git registrado. Cambios ajenos preservados: `apps/web/next-env.d.ts`, `.pnpm-store/` y `docs/plan-migracion-supabase-nestjs.md` sin stage del issue.
2. [Seguro] `git fetch origin develop` y comparación `HEAD...origin/develop` → `0 0`. El pull con rebase no pudo ejecutarse por el cambio ajeno sin stage; no se hizo stash/reset. Rama creada desde la misma base remota verificada.
3. [Seguro] `graphify update .` reconstruyó el grafo del HEAD, y `graphify query`/`explain createClient()` identificaron consumidores. Se usaron únicamente las rutas `source_file` del grafo para leer TS/docs exactos. El grafo es estructural y no reemplaza el canon de permisos.
4. [Seguro] El usuario autorizó explícitamente la excepción para SQL/config citados por docs/tipos y creación de documentos MIG-01 nuevos. Se enumeraron solo archivos versionados con `git ls-files -- supabase/migrations supabase/tests supabase/config.toml`, y se leyeron esos archivos. No hubo búsqueda global, Grep/Glob, lectura `.env`, acceso a secretos/despliegues ni exportación de datos.
5. [Seguro] Sobre esos archivos exactos se extrajeron llamadas directas, condicionales y wrappers; firmas de tipos, proyecciones, funciones SQL, jobs/config y referencias estáticas a tests. Se documentaron 49 RPC reales web frente a las 45 llamadas literales del plan, y se excluyó Storage del conteo PostgREST.
6. [Seguro] Las tarifas regionales se consultaron sin credenciales en el catálogo público AWS y las páginas oficiales enlazadas. SKU, fecha de publicación y filas pertinentes permanecen en [pricing.json](pricing.json); no se provisionó infraestructura.
7. [Seguro] La auto-revisión se acotó al diff documental y snapshots del issue, con código preexistente como contexto mínimo para verificar matriz/permisos. Se corrigió la baja administrativa a ADMIN y la incorporación ATHLETE de multirol a ADMIN ACTIVE con cuenta ACTIVE. Se añadió el wrapper de siete RPC billing, que una extracción `.rpc()` directa omitiría, y se corrigió un enlace de prueba detectado por la primera QA.

## Gate documental

[Seguro] El diff solo modifica documentos y snapshots de evidencia; no añade SQL/RLS, API, dependencias ni UI. Backend/frontend/mobile CI de la skill no aplican a este diff y sus skills auxiliares no existen en los directorios de skills consultados. Se aplican las comprobaciones documentales reales siguientes; no se simula un PASS de runtime.

| Comprobación | Entorno / resultado |
| --- | --- |
| Cobertura de inventario: 49 RPC, 16 PostgREST, diez métodos Auth, seis Edge, 39 páginas, 33 migraciones/121 nombres/150 declaraciones y 33 pgTAP | Local · PASS: conteos contrastados con snapshot, fuentes exactas y grafo |
| Identificadores SQL, firmas, consumidores/líneas, hashes y rutas de pruebas del snapshot contra archivos identificados | Local · PASS: 96 hashes, 228 referencias de origen, 121 declaraciones vigentes por nombre y 49 firmas/DTO completos |
| Links locales nuevos y tabla/matriz de destinos/responsables | Local · PASS: 191 enlaces locales, 192 filas con columnas consistentes, bloques cerrados y responsables/destinos en el snapshot |
| Aritmética de cotización oficial y escenario | Local · PASS: siete tarifas regionales del snapshot; cálculo decimal del subtotal USD 144,146 y alternativas |
| `git diff --check` y revisión acotada al issue | Local · PASS: sin errores de whitespace; correcciones de permisos/enlace aplicadas antes de repetir QA |
| Vitest/typecheck/build/pgTAP/integraciones/Playwright | OMITIDOS: no cambia runtime, esquema ni UI; enlaces no equivalen a suites ejecutadas |
| API Nest, roles de runtime y portabilidad PostgreSQL independiente | PENDIENTE: #146/#149/#150/#165; no implementados en este PR |
| Mercado Pago/Resend/Expo reales y configuración de proveedores | PENDIENTE: sin llamadas autenticadas; referencias MP devolvieron 403 |
| Acuerdos de proveedor/presupuesto/RPO/RTO/corte/observación y dedicación | PENDIENTE: usuario autorizó propuestas, no su adopción |

[Seguro] La comprobación Python puntual leyó los snapshots y las fuentes exactas ya identificadas: comparó SHA-256, nombres/firmas y líneas de llamadas (incluidos wrappers multilínea), existencia de pruebas enlazadas, destinos/responsables, sintaxis de tablas y aritmética decimal. Se repitió tras corregir el enlace y los permisos y terminó con código 0. No ejecutó las pruebas de aplicación ni accedió a proveedores autenticados.

## Límites y trazabilidad

[Seguro] Este inventario demuestra referencias en la base del checkout; no demuestra funciones/migraciones aplicadas en un proyecto cloud, extensiones soportadas por el destino, tamaño de datos/archivos ni contratos activos en una cuenta de pago. La operación sin producción es una declaración humana confirmada, no una auditoría externa.

[Seguro] No se modificó el plan local previo ni se incluyó en el PR. Las referencias persistentes son la épica/issues y documentos canónicos versionados. Las funciones SQL se clasifican por nombre/última declaración, no por catálogo desplegado ni sobrecarga; los enlaces a pruebas se obtienen por referencia textual y deben complementarse con pruebas de paridad en cada entregable.

[Seguro] #145 permanece abierto para los acuerdos y ensayos pendientes. El commit de entrega y URL del PR se registran en Git/GitHub; este archivo usa la base completa y fecha para permitir reproducir el inventario sin intentar autorreferenciar el hash de su propio commit.
