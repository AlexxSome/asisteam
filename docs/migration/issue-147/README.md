# MIG-03 · CI y staging reproducible (#147)

[Seguro] Base real `71b17045dc51e94b4ffd5b3916e6e55104b429b5` de `origin/develop`, que integra #146/PR #182. Rama `codex/147-ci-staging`. Fecha 2026-10-07. El usuario eligió **CI y staging sintético Docker, provisión externa pendiente**. Se preservó el trabajo ajeno del checkout original con worktree aislado.

## Entrega

[Seguro] ESLint fijado para TS/JS web/core/API y herramientas CI; recomendado con sintaxis TypeScript. No-unused-vars se delega al typecheck/convenciones existentes; no-undef lo verifica TypeScript en TS. Se excluyen tipos DB generados, builds y Edge Deno (su runtime/integraciones se comprueban por separado). Dos fixtures de QA descartan causas SQL sensibles y el runner privado descarta diagnósticos: la excepción preserve-caught-error está acotada a esos archivos. El catch vacío permitido se limita al smoke preexistente de #146.

[Seguro] [CI](../../../.github/workflows/ci.yml) ejecuta lint/typecheck/build/core+web+API, pgTAP completo y 81 integraciones HTTP/Postgres/Edge con flags explícitos, staging/roles/readiness/migraciones y rollback de artefacto. Los tres jobs obligatorios tienen timeout 12 min; `required` exige éxito de todos, incluyendo cuando uno falla/se cancela. Las acciones están fijadas a commits oficiales. Falta configurar branch protection en GitHub para exigir **CI / required**; publicar el workflow no aplica esa configuración administrativa.

[Seguro] [Extended QA](../../../.github/workflows/extended.yml) separa Playwright/axe, breakpoints completos y fallos de transporte, manual y semanal, timeout 20 min. No forma parte del presupuesto PR. Cada comando conserva duración y omisiones en JSON de `.ci-results`; los reportes Vitest/Playwright crudos permanecen ignorados. Los comandos obligatorios no aceptan integraciones omitidas como PASS. Las unitarias web identifican sus 81 omitidas, que se ejecutan en el job backend. Probes temporales verifican fallo real de pgTAP y typecheck y registran FAIL esperado + detección PASS.

[Seguro] Los runners capturan stdout/stderr en memoria, sin publicar SQL, PII, JWT, credenciales, argumentos ni logs crudos. Artefactos de CI contienen únicamente commit/entorno/check/resultado/duración/conteos. Tests del runner comprueban redacción y rechazo de skip con exit0. El [runbook staging](../../../deploy/staging/README.md) detalla secretos externos, roles separados, redes, migraciones, deploy y restauración por digest sin rebobinar datos.

## Reproducir

```sh
pnpm install --frozen-lockfile
pnpm ci:checks
pnpm ci:backend
node scripts/ci/probe.mjs
pnpm ci:staging
pnpm ci:extended
```

[Seguro] Node24/Docker requeridos. Backend/extended solo admiten Supabase local; en CI la VM/DB son efímeras. Localmente reutilizan el stack sintético existente: no hacen reset/limpieza global. No ejecutar E2E simultáneamente con build/typecheck. Staging usa un proyecto distinto del stack Supabase y elimina solo su propio fixture. No publicar archivos `.ci-*.json` crudos ni logs de proveedor.

## Evidencia local y límites

[Seguro] macOS arm64, Node24.16.0, pnpm10.33.2 y Docker29.3.1. Resultados iniciales, sujetos a la corrida final/CI:

| Check | Resultado |
| --- | --- |
| Lint/typecheck/build | PASS; web 39 páginas, aviso preexistente middleware/proxy |
| Unitarias core/web/API | PASS: 150 core, 821 web; 81 integraciones web omitidas aquí y ejecutadas aparte |
| Integraciones reales de módulos | PASS: 81/81, 0 omitidas, 50.87 s |
| Staging Docker | PASS: roles mínimos, ledger, deploy de dos imágenes, restauración del digest inicial, logs seguros y PostgreSQL real API |
| Probes de regresión | PASS: pgTAP y tipos fallan con errores controlados; fuentes temporales retiradas |
| pgTAP sobre stack local existente | FAIL preexistente: 3/1487 en 33 archivos, mismo resultado en develop original; Academia 44–45 y cuota invitaciones 15 |
| CI remoto sobre DB efímera limpia | PENDIENTE de ejecución del PR; no equivale a los resultados locales |
| Suite extendida / lector humano | PENDIENTE / fuera de este entregable |
| Provisión externa | PENDIENTE, según elección explícita del usuario |

[Seguro] No se modifica SQL/RLS de producto, contratos de datos ni UI; no hay tipos de dominio nuevos que regenerar. La migración operativa staging se verifica con rol migrator y restricción runtime; no sustituye las pruebas canónicas SQL↔core. El fallo local pgTAP no se oculta ni se corrige ampliando alcance sin evidencia: la corrida efímera del PR deberá aclararlo antes de declarar el gate remoto aprobado.
