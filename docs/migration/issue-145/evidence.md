# MIG-01 · Evidencia y validación

[Seguro] Fecha: 2026-10-06 · entorno: checkout local macOS · base inventariada: `ecf2864955cae6b692f98bbcd992d5f1085755e0` · rama: `feature/145-inventariar-contratos-arquitectura-infraestructura`. Esta revisión continúa el commit `676e4df` y el [PR #169](https://github.com/AlexxSome/asisteam/pull/169) ya existentes. Los resultados siguientes son verificaciones documentales; las suites citadas en la matriz son referencias, no ejecuciones nuevas.

## Método y alcance

1. [Seguro] Lectura de la skill `issue-sol61-alto`, AGENTS.md, #145/#144 y sus comentarios con `gh --repo AlexxSome/asisteam`; Git y PR contrastados con el remoto. El PR existente ya usa `develop` y la misma base del inventario; se reutilizan rama y PR. Cambios ajenos preservados: `apps/web/next-env.d.ts`, `.pnpm-store/` y `docs/plan-migracion-supabase-nestjs.md`, sin stage del issue.
2. [Seguro] `graphify update .` reconstruyó el grafo sobre HEAD `676e4df`: 1.923 nodos y 3.979 aristas. `explain createClient()` y consultas billing/webhook identificaron las fuentes exactas de consumidores y los seis entrypoints Edge. El grafo contiene 39 páginas web. No se descubre código mediante búsquedas de texto ni listados alternativos.
3. [Seguro] El grafo es estructural y no representa SQL/config. Las verificaciones leen únicamente rutas ya referenciadas en el snapshot/documentos del entregable, contra los blobs de la base Git y sus hashes/líneas. No se modifican esas fuentes ni se usa esa lectura para descubrir código adicional. El inventario de 33 migraciones sigue siendo estático, sin prueba del catálogo desplegado.
4. [Seguro] [validate.py](validate.py) verifica hashes, referencias de consumidores, últimas declaraciones SQL por nombre, firmas contra tipos generados, destinos/permisos/pruebas/rol responsable, enlaces y tablas, además de aritmética decimal. Los seis entrypoints Edge tienen ruta y hash explícitos en [inventory.json](inventory.json).
5. [Seguro] En la auto-revisión se corrigieron atribuciones sin respaldo en #145/#144 o la conversación disponible: producción, usuarios, datos y cantidad de desarrolladores pasan a PENDIENTES; la publicación autorizada por la skill no constituye aceptación del ADR ni del presupuesto. Los responsables se identifican por rol propuesto y sus nombres/dedicación siguen pendientes. La estimación con uno o dos desarrolladores conserva su carácter de supuesto.
6. [Seguro] Se volvieron a consultar fuentes oficiales Node/Nest y tarifas públicas AWS/Vercel/Supabase/Resend. Las siete tarifas RDS/S3 de los SKU del snapshot coinciden con el catálogo regional público al revisar (publicación RDS `2026-10-06T22:40:50Z`, S3 `2026-09-28T23:04:16Z`). El snapshot original conserva su fecha de observación/publicación; no se provisionó infraestructura ni se accedió con credenciales a proveedores.
7. [Seguro] El acceso a la referencia oficial de actualización de preapproval Mercado Pago no aportó contenido verificable. No se ensayó el cambio de URL de ningún contrato; esa validación sigue PENDIENTE EXTERNA en #158. La ausencia de contratos reales tampoco está confirmada.

## Comando reproducible

```sh
python3 docs/migration/issue-145/validate.py
git diff --check ecf2864955cae6b692f98bbcd992d5f1085755e0 -- docs/06-arquitectura-y-stack.md docs/07-api-y-backend.md docs/migration/issue-145
```

[Seguro] Ejecutar en un checkout que conserve la base Git y las fuentes inventariadas. El validador usa solo la biblioteca estándar de Python, no necesita Supabase, no consulta la red y falla si el checkout ya no coincide con las fuentes del corte. No mide cobertura semántica de pruebas ni actualiza automáticamente el inventario.

## Gate documental

| Comprobación | Entorno / resultado |
| --- | --- |
| Hashes y referencias de consumidores contra base y checkout | Local · PASS: 98 hashes y 228 referencias con línea/nombre |
| Declaraciones SQL y tratamiento por función | Local · PASS: 150 declaraciones, 121 últimas por nombre y 33 referencias pgTAP |
| Matriz de RPC y firmas contra tipos generados | Local · PASS: 49 contratos completos; 16 destinos PostgREST, diez métodos Auth y seis entrypoints Edge coherentes con snapshot |
| Enlaces locales, tablas y bloques de código | Local · PASS: enlaces existentes, columnas consistentes y bloques cerrados; cifras exactas en la salida del comando |
| Tarifas regionales y aritmética | Local/documentación pública · PASS: siete SKU coincidentes; subtotal USD 144,146 y USD 169,146 con un Supabase Pro temporal |
| `git diff --check` y auto-revisión respecto de la base | Local · PASS: sin errores de whitespace; revisión limitada al entregable #145 |
| Vitest/typecheck/build/pgTAP/integraciones/Playwright | OMITIDOS: no cambia runtime, esquema ni UI; referencias de tests no equivalen a suites ejecutadas |
| CI remoto | SIN EVIDENCIA: el PR no tiene checks remotos registrados; no se declara CI aprobado |
| API Nest, roles de runtime y portabilidad PostgreSQL independiente | PENDIENTE: #146/#149/#150/#165; no implementados en este PR |
| Mercado Pago/Resend/Expo reales y configuración de proveedores | PENDIENTE: sin llamadas autenticadas ni ensayos externos |
| Producción/usuarios/datos/equipo y acuerdos de proveedor/presupuesto/RPO/RTO/corte/observación | PENDIENTE de confirmación y aceptación humana; publicación documental no constituye acuerdo |

## Límites y trazabilidad

[Seguro] El entregable contiene documentación y un validador de evidencia; no añade API, SQL/RLS, dependencias ni UI. Demuestra referencias en la base del checkout; no acredita funciones/migraciones aplicadas, extensiones soportadas por el destino, volumen ni contratos activos. Las funciones SQL se clasifican por nombre/última declaración, sin resolver sobrecargas ni el catálogo desplegado; las referencias textuales a pruebas deben complementarse con paridad en cada módulo.

[Seguro] No se leyó `.env`, no se consultaron secretos, PII ni datos de cuentas externas. El plan local sin tracking queda fuera del PR. Las referencias persistentes son la épica/issues y documentos canónicos versionados. La revisión no trata las afirmaciones históricas de autorización del commit anterior como evidencia humana disponible.

[Seguro] #145 permanece abierto: faltan los acuerdos y datos materiales exigidos por sus criterios de aceptación. Commit y URL de entrega se registran en Git/GitHub; este archivo fija la base para reproducir la evidencia sin autorreferenciar el hash de su propio commit.
