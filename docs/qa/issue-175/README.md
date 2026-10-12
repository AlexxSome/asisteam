# UI-05 · Inicio por rol y multirol (#175)

[Seguro] Implementación en `codex/175-inicio-por-rol`, base `develop@e10671405a930d5bdda2db9b2abf229d354fc34d`. #173 está integrado: Router consume un solo DTO de Nest/PostgreSQL. #174 está abierto y no tiene PR al iniciar este trabajo; se conecta la variante por rol sobre las superficies/contrato de #171/#172/#173, conservando gestión/primer uso/capacidad ADMIN. Esta entrega no declara terminada la composición ADMIN ni su tabla de #174. Producción conserva NO-GO.

## Matriz de secciones, acciones y datos

| Perfil con memberships ACTIVE | Secciones y acciones en GRP-02 | Payload servido y límite |
| --- | --- | --- |
| ADMIN | Actividad/CTA, próximas 3, resumen, agregados, pendientes y gestión existentes. | [Seguro] #173 entrega indicadores/contexto/preview 4/pending; #175 presenta resumen, conserva gestión y deja tabla/composición ADMIN completa en #174. |
| COACH | Actividad/CTA tomar asistencia, próximas 3, resumen de estados y agregados; revisar asistencia anterior. | [Seguro] `access=coach`, `context.records=null`, `pending=null`; no contactos/nota ajena, controles de nota/desmarcado, aprobaciones ni gestión. El destino de asistencia conserva la prohibición en servidor. |
| ATHLETE | Actividad/agenda, Mi asistencia mensual, registro propio del encuentro e historial propio. | [Seguro] `personal` siempre por rol activo, independiente de V4; `context`/`pending` ausentes. `indicators` solo con toggle ATHLETE. |
| GUARDIAN | Actividad/agenda, selector de pupilo, mensual/registro/historial del pupilo por grupo, consentimientos/activaciones y enlaces a progreso detallado. | [Seguro] `wards` paginado 4 y `guardian_tasks` completos del servidor; solo menores/vínculos vigentes con ATHLETE ACTIVE. V2 no depende de V4; agregados solo con toggle GUARDIAN y visibilidad vigente. |
| ADMIN+ATHLETE | Unión: gestión/CTA y Mi asistencia. | [Seguro] Acceso ADMIN conserva datos administrativos; `personal` refiere solo a la membership ATHLETE propia. |
| ATHLETE+GUARDIAN | Unión: Mi asistencia y Mis pupilos, sin gestión. | [Seguro] Fuentes propias/pupilos permanecen con ambos toggles apagados. Un toggle autorizado abre solo agregados, nunca el panel operativo/preview/pending. |

[Seguro] Todos reciben actividades/anuncios del grupo que el servidor autoriza, con membership ACTIVE, consentimiento de cuenta y aislamiento V6. No se pide nómina/historial completo para poblar tarjetas. No se descargan registros ADMIN y luego se ocultan por CSS; `null` significa falta de permiso. Métricas y restricciones usan las RPC/helpers vigentes de #173; no hay migración, endpoint, lógica de métrica duplicada ni cambio de contrato/tipos. El componente presenta los porcentajes SQL con las funciones core canónicas.

## Selección y estados

[Seguro] Grupo/período y nombre completo del pupilo acompañan cada tarjeta/enlace. Selector local: solo los hasta 4 DTOs autorizados de la página actual. Grupo/página nueva reinicia selección; si una revalidación elimina un vínculo, la selección desaparece sin conservar nombre/nota/dato anterior. Página de pupilos y selector del día conservan el ID del encuentro/día, sin trasladar IDs a otro grupo. La shell cambia de grupo mediante la ruta existente sin query ajena.

[Seguro] PENDING nunca entra en la tarjeta de asistencia del pupilo. El inicio explica responsables: ADMIN coordina el vínculo y aprueba ingresos por código; apoderado designado ratifica datos para activar un alta gestionada (sin otra aprobación ADMIN) o autoriza acceso propio, que se completa por invitación. Los destinos APO-03/APO-04 y `/members/consent` mantienen detalles y decisiones existentes. No se inventan responsables ni se duplica onboarding en el inicio. Mayoría de edad/vínculo/membership se evalúan en servidor; una consulta posterior pierde los datos aunque el job diario aún no haya corrido. No se incorpora un sistema de actualización en tiempo real.

[Seguro] Actividad seleccionada/en curso y CTA preceden a la consulta propia/pupilo y agenda secundaria. Dos columnas 7:4 desde xl; una columna en móvil, superficies/token del sistema y controles ≥44 px. Solo GRP-02 solicita ancho 1280 px a Page. COACH ve los cuatro estados y Sin marcar separado; futuro muestra Preparación sin porcentaje realizado. Mensual ponderado/null, notas propias/pupilos autorizadas e historial por grupo conservan el contrato canónico. Ningún indicador suma grupos.

[Seguro] Carga/navegación/error pertenecen a Router, con ocultación de DTO anterior y reintento manual; no se convierte un fallo en cero/colección vacía. Anuncio sin filas muestra vacío explícito. Un fallo del DTO completo conserva el error de página; la disponibilidad independiente de regiones secundarias pertenece al contrato/composición de #174, no se añade un segundo transporte en #175.

## Verificación y evidencia

[Seguro] Casos específicos:14 tests de tarjetas/roles/toggles/selección/null/paginación/preparación más 10 loaders existentes; pgTAP 67 con roles, R1/V1–V6, PENDING, revocación, mayoría de edad y multirol; 1 integración HTTP Nest/SQL ampliada a GUARDIAN/multirol; 1 recorrido real con seis perfiles y responsive 320/375/768/1024/1440/1536 más axe. El reloj avanzado vive solo en la transacción del fixture SQL y se restaura al rollback; no se edita birthdate saltando aprobación ADMIN. Retirar vínculo usa otro apoderado consentido para preservar R1. Todos los datos son sintéticos dentro de PostgreSQL17/Docker propio, sin proveedores externos.

```sh
pnpm --filter @asisteam/web exec vitest run src/components/group-home-panels.test.tsx src/groups-profile.test.tsx
DOMAIN_SQL_REPORT_NAME=dashboard-sql node packages/db/scripts/test.mjs packages/db/tests/dashboard.test.sql
node apps/api/test/native-suite.mjs apps/api/test/dashboard.integration.mjs
pnpm --filter @asisteam/web test:e2e:full group-home.spec.ts
```

[Seguro] [Evidencia CI local](ci-local.json) identifica base, hashes de runtime/tests, Node 24.16.0/pnpm 10.33.2 y resultados completos. Las capturas [GUARDIAN375](guardian-home-375.png), [GUARDIAN1440](guardian-home-1440.png) y [ATHLETE+GUARDIAN1440](athlete-guardian-home-1440.png) se obtienen del servidor/artefacto real con datos sintéticos. Los resultados de axe `incomplete` se preservan en esa evidencia: ausencia de violaciones no acredita WCAG completa.

| Job de `.github/workflows/ci.yml` | Reproducción local | Resultado |
| --- | --- | --- |
| checks | `pnpm install --frozen-lockfile`; `pnpm ci:checks` | [Seguro] PASS: 14 checks, core 153/web 485, cero omisiones. |
| backend | `pnpm ci:backend`; `node scripts/ci/probe.mjs` | [Seguro] PASS. |
| staging | `pnpm ci:staging` sobre Docker local propio | [Seguro] PASS. |
| extended | `pnpm ci:extended` (matriz completa, paridad y fallos) | [Seguro] PASS. |
| qualification / required | `pnpm ci:qualification` + comprobación de todos los jobs success | [Seguro] PASS. |

[Seguro] `extended.yml` programado/manual no aplica al evento PR y usa el mismo `ci:extended`; no se sustituye ninguna matriz. La protección remota de develop respondió Branch not protected (404) al comprobarla; se aplica igualmente el gate obligatorio de skill/proyecto con los jobs completos de ci.yml. [Seguro] La convención real de integración hacia develop se comprobó en [PR234/#173](https://github.com/AlexxSome/asisteam/pull/234), [PR232/#222](https://github.com/AlexxSome/asisteam/pull/232) y [PR233/#212](https://github.com/AlexxSome/asisteam/pull/233): los tres MERGED sobre develop. main contiene el README inicial y no se usa para introducir un diff ajeno al issue. Auto-revisión se limita al diff de #175. El PR solo se publica después de aprobar todo el CI local aplicable.

[Seguro] Las 39 rutas y códigos GRP-02/APO-03/APO-04 se conservan, con docs05/sistema visual reconciliados. #174, aceptación visual humana #181/#209, lector de pantalla, zoom nativo y prueba de cancha siguen pendientes. Esta evidencia local no acredita GitHub Actions ni corte/deploy real.

[Seguro] La primera paridad estática detectó un locator global ambiguo de #173: el mismo título aparece en actividad/agenda/resumen. Se limitó a la región «Resumen de la actividad» y se añadieron comprobaciones de preparación sin porcentaje y enlace al ID elegido; se conservan todas las verificaciones HTTP previas. No se elimina ni omite ningún caso; checks y extended completos se repiten después del ajuste del test. El runtime, SQL y artefacto no cambiaron por esa corrección.

[Seguro] Resultado final: checks 14, backend 16, probe 6 y staging 53 verificaciones sin fallos imprevistos; SQL dashboard 67 y dominio 40/1646, integraciones producto 84, extended 48+42+1=91 E2E sin omisiones/flaky; qualification técnico/required PASS. Fallos deliberados de portabilidad, tipos, retiro y rollback se detectaron y limpiaron según los runners originales. Carga general 500 atletas/5000 registros/192 peticiones: p95 máximo 87.23 ms; bundle 199745 bytes gzip, delta 627 y presupuesto PASS. Son gates generales, no un benchmark específico del dashboard.

[Seguro] Los reports señalan el HEAD de base previo al commit; los 8 hashes de runtime/tests identifican el contenido final validado. Después del texto canónico se repitieron checks/build, staging y extended; backend dominio/HTTP/auth no consume esa explicación. Tras corregir el locator, checks y todas las matrices extended se repitieron completos, conservando backend/staging del mismo runtime. La incorporación final de documentación/PNG/JSON no cambia las fuentes. Auto-revisión sin hallazgos pendientes y git diff --check PASS. Aceptación operacional/humana conserva NO-GO.
