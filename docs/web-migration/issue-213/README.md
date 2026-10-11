# WEB-01 — Inventario y decisión de migración web (#213)

[Seguro] **Entrega documental; la aplicación sigue en Next16/React19.** La migración React/Vite/React Router Data Mode está autorizada por [#212](https://github.com/AlexxSome/asisteam/issues/212), pero su ejecución/paridad corresponde a WEB-02…10. Producción continúa NO-GO. Baseline inspeccionado: `db1396d490c481209a81a67fde0104c4fbfe248c` de origin/develop, sin cambios locales antes de esta rama. Fecha de inventario: 2026-10-10; toolchain Node24.16.0/pnpm10.33.2.

| Entregable | Contenido y trazabilidad |
|---|---|
| [rutas.md](rutas.md) | 39 páginas reales cotejadas39/39 con doc05; código/rol/composición/operación/reemplazo/prueba por fila |
| [operaciones.md](operaciones.md) | 21 archivos de Server Actions/47 funciones,88 operaciones SDK/HTTP,3 Route Handlers, imports Next/server-only, secretos/IP/URLs y brechas |
| [ADR.md](ADR.md) | Versiones, límites browser/servidor, sesión/CSRF/OAuth en Nest, mismo origen/prefijos, único dueño de consultas, SEO/legal/HTTP/caché/logs |
| [baseline.json](baseline.json) | SHA base y210 fuentes exactas con SHA-256; lista de páginas/acciones/handlers/imports/contratos reproducible |
| [versions.json](versions.json) | Versión/engines/peers del registro oficial npm para herramientas objetivo; no instalación de la SPA |
| [evidencia.md](evidencia.md) / [verification.json](verification.json) | Verificación documental y gates reales de esta entrega; separar local, remoto y aceptación pendiente |

[Seguro] Navegación usada: `graphify update . --no-cluster`; query/explain de Layout, HomePage, route.ts, actions.ts, server_only, next/link/navigation/headers/cache, controllers y contratos HTTP. Se leyó únicamente el conjunto exacto de fuentes identificado; se excluyen pruebas de la cuenta de implementación. Doc05 es el canon de códigos/permisos y permite reconciliar cada página, no demostrar por sí solo un flujo completo. El grafo local es herramienta de trabajo, no parte del artefacto publicado.

## Reproducción del baseline

[Seguro] Desde la raíz, el siguiente comando valida los hashes del commit inspeccionado sin imprimir contenido/secretos ni necesitar volver al checkout base. Cambios posteriores no deben presentarse como evidencia de este baseline; generar un inventario nuevo antes de la paridad final.

```sh
python3 - <<'PY'
import hashlib, json, subprocess
from pathlib import Path
b = json.loads(Path('docs/web-migration/issue-213/baseline.json').read_text())
for f in b['files']:
    data = subprocess.check_output(['git', 'show', b['sourceCommit'] + ':' + f['path']])
    assert hashlib.sha256(data).hexdigest() == f['sha256'], f['path']
assert len(b['pages']) == 39 and len(set(b['pages'])) == 39
assert len(b['handlers']) == 3
assert sum(len(a['functions']) for a in b['actions']) == 47
print('PASS: baseline por SHA, 39 páginas, 47 funciones y 3 handlers')
PY
```

## Estimación recalibrada y secuencia

[Suposición] Una persona dedicada: **6–9 semanas /30–45 jornadas**, frente a las5–8 semanas iniciales de #212. Estimación de trabajo técnico, sin fecha comprometida ni proveedores/aceptación externa. Las brechas de sesión/callbacks, imagen binaria/URLs antiguas, guardado/invalidación y adaptación del runner/proxy justifican el margen; no se multiplica el trabajo por 88 endpoints porque sus servicios/SQL se reutilizan.

| Hito | Jornadas estimadas | Resultado/gate antes de avanzar |
|---|---|---|
| WEB-01 #213 | 2–3 | Inventario/ADR/aceptación verificable; esta entrega |
| WEB-02 #214 | 5–7 | Cookie/CSRF/refresh/OAuth/IP/privadas/DTO web sin tokens en Nest; prueba concurrencia/replay/Apple |
| WEB-03 #215 | 3–4 | Vite Data Mode paralelo, límites bundle, SDK cookie, entorno/proxy y loaders/action base |
| WEB-04 #216 | 3–4 | Acceso/invitación/consentimiento/legal y contexto de enlaces anteriores |
| WEB-05 #217 | 3–4 | Grupos/shell/inicio/perfil, roles compuestos y borradores |
| WEB-06 #218 | 3–5 | Integrantes/apoderados/pendientes/consentimientos, R1/V1–V6 |
| WEB-07 #219 | 4–6 | Agenda/series/asistencia/historial/reportes, métrica y cancha375/500 |
| WEB-08 #220 | 2–4 | Billing/anuncios/QR existentes, sin pagos reales ni nuevo push móvil |
| WEB-09 #221 | 4–6 | Proxy/CI/artefacto/QA paridad completa, rollback sin perder datos |
| WEB-10 #222 | 1–2 | Retiro Next/lockfile/scripts/docs solo tras gates; actualización de stack entregado |

[Seguro] Suma30–45 jornadas; algunos trabajos de QA/infra pueden prepararse en paralelo tras ADR, pero paridad y retiro no se adelantan. #170 aporta el lenguaje visual ya autorizado: cotejar archivos y estados por módulo antes de editar para evitar repetir rediseño. #209 acepta desarrollo/proveedores/capacidad/operación; esta planificación no cierra sus pendientes, la QA humana de #100 ni el despliegue productivo. Si cambia la base durante la migración, reconciliar primero39 rutas/47 funciones/88 operaciones y estados del diseño; registrar discrepancias, no borrar pruebas vigentes.

## Criterios de aceptación WEB-01 y límites

[Seguro] El checklist de #213 queda trazado así: inventario de páginas/layouts/roles/links → rutas+operaciones; Next/acciones/handlers/cookies/metadatos/privadas → operaciones+baseline; endpoints reutilizables/brechas/IP/secrets → operaciones; ADR sin SSR, mismo origen/prefijos/versiones/consultas → ADR; público/legal/SEO/status/caché/logs → ADR; matriz y SHA+estimación/docs06/07/09 → este paquete y enlaces canónicos. Las pruebas de paridad son **PENDIENTES** hasta sus hitos de implementación; la inspección estática no las declara PASS.

[Seguro] No se modifican código de producto, dependencias, migraciones, RLS, contratos HTTP generados, tokens, pantallas ni infraestructura. No se entregan nuevas features P1/P2, rediseño adicional, CSV/móvil/offline ni servidores React SSR. Los gates CI sintéticos conservan su papel requerido para merge y no acreditan integración externa.
