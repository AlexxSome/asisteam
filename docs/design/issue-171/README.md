# UI-01 · Contrato visual y responsive de Asisteam

[Seguro] Entrega de [#171](https://github.com/AlexxSome/asisteam/issues/171), primera etapa de la [épica #170](https://github.com/AlexxSome/asisteam/issues/170). Base inspeccionada: `develop@a3155b38c9b295e589a3fcb4f8b20f637d31069e`, 10-10-2026. Graphify actualizado sobre esa base antes de localizar componentes. Este documento fija el contrato para UI-02…UI-10; la propuesta estática demuestra composición y estados, sin declarar conectado el nuevo dashboard ni aumentar las 39 páginas de producto.

[Seguro] La [referencia versionada](../asisteam-dashboard-reference.png) es idéntica al PNG de `084f98baf9b550f2a2964dcee46a28a51524f1b7` (blob Git `96d84575cfd5c7791820c806f1b01ff262473bac`). Fue generada con ejemplos sintéticos. La [comparación anotada](comparison.html) ([captura](comparison.png)) muestra referencia, propuesta de escritorio y móvil con sus decisiones. [Propuesta 1440](proposal-1440.png) · [Propuesta 375](proposal-375.png).

## Anatomía y medidas obligatorias

[Seguro] La fuente de color, tipografía, radio, foco y movimiento sigue siendo [globals.css](../../../apps/web/src/app/globals.css) y [el sistema visual](../../12-sistema-visual.md). La propuesta utiliza esos tokens y fuentes del sistema; no define una segunda paleta. Espaciado múltiplo de 4 px, radios 6 px controles/8 px superficies, bordes explícitos y ninguna sombra salvo overlays reales. Todos los controles principales tienen mínimo 44×44 px; su altura puede crecer por ajuste de texto o zoom.

| Región | Contrato de composición | Jerarquía y densidad |
| --- | --- | --- |
| Sidebar | 256 px desde `lg` (1024); padding 16 horizontal/24 vertical; sin colapso a iconos sin texto. Selector ancho disponible, mínimo 44 px. | Marca textual, grupo/rol, tareas del grupo, Gestión desplegable y espacio personal. Elementos ≥44 px, gap 4 px entre destinos y 16–24 entre secciones. `aria-current=page` y señal visible. |
| Cabecera | Altura mínima 64 px; padding 8 vertical, 16 móvil/24 tablet/32 escritorio; breadcrumb flexible + cuenta 44 px. Sin altura fija ni overlay sticky. | Breadcrumb con grupo real; cuenta sin avatar ficticio. Nombres largos se ajustan; la cabecera crece antes de ocultar texto esencial. |
| Main por tarea | Dashboard/listas ancho máximo 1280 px dentro del espacio disponible; formularios de una tarea máximo 672 px; toma de asistencia máximo 1024 px; reportes máximo 1280 px. Padding 16/24/32 px; gap secciones 24 px. | H1 único 24/32 móvil y 28/36 tablet; H2 20/28; H3 16/24; body 16/24; small 14/20; caption 12/16 solo secundario. |
| Acción dominante | Un CTA principal relacionado con una actividad identificada, ≥44 px; etiqueta explícita y ajuste en dos líneas. | «Tomar asistencia» ADMIN/COACH según permiso y contexto. Una acción por contexto, no un guardado tácito ni selección de actividad inferida de la fecha. |
| Indicadores | Gap 16 px, padding 16; 1/2/4 columnas según tabla responsive. Icono 20 px en caja contextual de 44 px. | Etiqueta small, valor display 32/40 con números tabulares, período y alcance visibles. Icono es decorativo; texto y valor transmiten significado. No gráfico circular/progreso P1. |
| Fila de actividad | Fecha 56 px, contenido `minmax(0,1fr)`, acción ajustable; padding/gap 12 px; filas separadas 16 px. | H3 nombre, hora/lugar small en Chile, estado temporal textual. En móvil, acción debajo del contenido; ninguna asistencia realizada en actividad futura. |
| Panel contextual | Desde `xl`, columna derecha mínimo 320 px; proporción 7:4 con columna de trabajo, gap 24 px. Debajo de `xl`, bloque completo. | Actividad realizada seleccionada con fecha explícita, porcentaje, contadores y explicación del denominador; no reemplaza próxima actividad ni oculta «Sin datos». |
| Tabla compacta | Región nombrada/enfocable con scroll horizontal local; ancho mínimo de la muestra 480 px; padding celdas 12 vertical/8 horizontal, cuerpo small 14/20; caption y `scope`. | Filas mínimo 44 px cuando tengan acciones. Nombres ajustan, estado textual visible y sin avatar inventado. La tabla con terceros por actividad es solo ADMIN. |
| Pendientes/anuncio | Misma superficie Card, padding 16/24 y gap 16; texto small, título H2/H3 coherente. | Pending no implica activación: R1 y consentimiento continúan en servidor. Anuncio solo si existe dato autorizado; vacío explícito. |

## Contrato responsive y orden

[Seguro] Se reutilizan los breakpoints nativos `md=768`, `lg=1024`, `xl=1280`, `2xl=1536`; no se introduce un breakpoint 1440. Los siguientes valores son anchuras de validación, no nuevas reglas de CSS.

| Anchura | Navegación y espacio | Indicadores y composición |
| --- | --- | --- |
| 320/375 | Sidebar oculto; acceso «Menú y grupo» ≥44 px; main 16 px. UI-02 reutiliza el drawer modal ya implementado de AppShell (foco/Tab/Escape/retorno). La muestra usa disclosure nativo visible y no afirma probar ese drawer. | 1 columna; orden DOM/visual: actividad/acción → pendientes → indicadores → consulta contextual → registros → anuncio. El H1 y CTA preceden el resumen; tabla con scroll propio, nunca página ancha. |
| 768 | Navegación móvil, main 24 px. | 2 indicadores por fila, contenido en 1 columna; acción de fila puede ocupar tercera columna si cabe. Ajuste de texto sigue permitido. |
| 1024 | Sidebar 256 px, espacio restante 768 px, main 32 px (contenido 704). | 2 indicadores por fila y contenido en 1 columna para preservar lectura; sin panel estrecho forzado. |
| 1440 | Sidebar 256 px, main disponible 1184 px, contenido 1120 px. | 4 indicadores, 7:4 con panel ≥320; grid áreas actividades/contexto, registros/pendientes, registros/anuncio. Orden de foco sigue el DOM móvil, sin `tabindex` positivos. |
| 1536 | Sidebar 256 px, main disponible 1280 px, contenido 1216 px. | Misma composición que 1440. Contenido max 1280; crece margen exterior después de ese límite. |

[Seguro] La lógica responsive es por espacio, no por modelo de dispositivo. A 200% el contenido debe reordenarse con el viewport CSS efectivo; no se recortan controles ni texto. La verificación automatizada de reflow a 720 px representa un viewport efectivo de 1440/2 y no equivale a zoom nativo ni aceptación humana.

## Ajuste, truncado e identidad

[Seguro] Nombres de grupo, actividad, persona y lugar usan `min-width:0` y `overflow-wrap:anywhere`. Etiquetas de controles y títulos esenciales nunca usan ellipsis. Texto largo puede ampliar fila/card, sin alturas fijas. Un resumen de anuncio puede truncarse a dos líneas únicamente si hay enlace al texto completo autorizado; la muestra conserva texto completo. Un selector nativo puede recortar su opción cerrada por el navegador: mantener el nombre completo visible en contexto adyacente y en la opción abierta.

[Seguro] Logo real opcional, `object-contain`; error o ausencia muestra iniciales derivadas del nombre con texto «sin logo/logo no disponible» según GroupLogo existente. La propuesta no descarga logos ni introduce uno inventado. Cuenta sin foto muestra nombre/texto, no un rostro sintético. Nombres/conteos de la referencia y de preview.tsx viven exclusivamente en la muestra documental y jamás son valores por defecto de DTO o componente de producto.

## Biblioteca mínima de iconos

[Seguro] La muestra define en `preview.tsx` siete SVG locales sin dependencias: inicio, calendario, integrantes, asistencia, reportes, anuncio y gestión. Caja 20×20, viewBox 24, trazo 1.75, color `currentColor`; UI-02 podrá extraer únicamente los iconos con consumidores reales. No se instala una biblioteca ni se altera el catálogo compartido. Todos tienen `aria-hidden=true` y `focusable=false`; nunca transportan el único significado de una acción.

[Seguro] Navegación/acciones conservan nombre textual visible («Actividades», «Tomar asistencia», etc.). Una acción icon-only futura exige nombre accesible y target 44×44, además de tooltip no exclusivo; no se necesita en este contrato. El pictograma de reportes no es un dato, gráfico ni porcentaje circular. No recrear la marca generada como logo oficial.

## Estados y componentes reales

[Seguro] Se reutilizan Button, Card/CardTitle, Badge, Alert, PageHeader, LoadingState y EmptyState de #102–#103, así como attendanceMetrics/reportPercentage/reportAttendanceClass y etiquetas de asistencia. El error de producto seguirá ErrorState/reset/router; el reintento de la propuesta es navegación explícita a una muestra exitosa. La demostración SSR es estática y no hidrata mutaciones ni simula la API.

| Variante reproducible | Contrato obligatorio para el producto |
| --- | --- |
| `ready` | Grupo/período y actividad identificados. Asistencia 6 PRESENT + 1 LATE + 2 ABSENT + 1 EXCUSED = 77.8 %, sin promedio de porcentajes. Fecha de próxima actividad separada de actividad realizada. |
| `loading` | Texto `status`, región `aria-busy`, skeleton oculto a lectores, sin reemplazo por personas/conteos inventados. Navegación estable. |
| `empty` | «Todavía no hay actividades»; no métricas ficticias. CTA crear solo ADMIN y si permitido; no vacío genérico que confunda filtro sin coincidencias. |
| `no-data` | Denominador cero → «Sin datos» y contadores cero; nunca 0/100 %. Sin filas, texto explícito. Si el dato no se pudo obtener, usar error, no cero. |
| `error` | Mensaje español, sin valores presentados como actuales, reintento manual y estado de proceso textual; sin envío automático al reconectar. |
| `long-name` | Ajuste de grupo, actividad sin espacios y persona; acciones siguen visibles, scroll limitado a tabla. |
| `no-logo` | Identidad textual/iniciales, sin dependencia de asset para reconocer o cambiar grupo. |

[Seguro] Button conserva disabled/loading, etiqueta estable, `aria-busy` y bloqueo de doble envío; las muestras de mutación están deshabilitadas y etiquetadas «muestra». Los enlaces internos recorren secciones/documentos de la propuesta; la entrega funcional de cada módulo debe dirigir a las rutas existentes documentadas en doc05, con sus parámetros/permisos. No se agrega mensajería, CSV, calendario mensual, geocerca/offline, pagos de deportistas o gráficos.

## Diferencias anotadas frente a la imagen

[Seguro] La [comparación](comparison.html) identifica seis ajustes: (1) superficies/botones planos en tokens existentes, (2) ámbar oscuro accesible y números tabulares, (3) actividad futura separada de registros realizados, (4) identidad textual sin avatars/logos ficticios, (5) móvil con prioridades/tabla contenida, (6) roles/estado/alcance visibles. La referencia propone composición; no fija nombres, cifras, rutas ni permisos.

[Seguro] Texto normal debe alcanzar ≥4.5:1 y texto grande ≥3:1. Ratios calculados de los tokens canónicos opacos, medidos también por axe sobre la muestra: foreground/blanco 17.85:1, neutral/blanco 7.58:1, primary/blanco 6.70:1, warning/blanco 7.09:1, warning/warning-subtle 6.37:1. Estos ratios se recalculan en el runner y quedan en measurements.json; no justifican texto ámbar `#FFAD00` del render. Focus `#2563EB`/blanco ≈5.17:1; bordes de control `#64748B`/blanco ≈4.76:1. El borde estructural sutil no es el único identificador de controles.

## Datos, roles y límites de implementación

[Seguro] ADMIN ve gestión, pendientes y registros de terceros; COACH toma/corrige estados sin notas/desmarcado ni acceso ADMIN a terceros; ATHLETE conserva lo propio y GUARDIAN pupilos vigentes según V1–V3. V4 solo abre agregados con toggles por rol/grupo default false; V5 impide datos privados/desglose ajeno; V6 exige membership ACTIVE. Multirol compone permisos y mantiene «Mi asistencia». La muestra es ADMIN sintética; no valida consultas ni sustituye las variantes funcionales de UI-05.

[Seguro] UI-03 define DTO autorizados para KPIs y períodos Chile (UTC al persistir), autorización y porcentaje mensual ponderado SQL/core. UI-04 conecta composición ADMIN; UI-05 adapta por rol. R1, auth, aislamiento, consentimiento y semántica de guardado existentes no cambian. No ejecutar despliegue/corte real; producción continúa NO-GO según MIG-24.

## Reproducción y evidencia

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @asisteam/web exec playwright install chromium
node apps/web/scripts/design-contract.mjs --verify
```

[Seguro] El runner genera HTML autónomo en `apps/web/.qa/design-contract/{ready,loading,empty,no-data,error,long-name,no-logo}.html` usando SSR React/esbuild existentes y CSS Tailwind/PostCSS del proyecto. `--verify` sirve solo esas páginas en 127.0.0.1 con puerto efímero, ejecuta Chromium/axe, verifica H1, overflow, controles, sidebar, teclado/enlace de salto, disclosure móvil y navegación de reintento, y cierra navegador/servidor. Sin `--verify` solo genera archivos. No consulta backend ni credenciales. HTML/bundle temporal no se versiona; PNGs y [mediciones revisadas](measurements.json) son evidencia mínima.

[Seguro] El gate humano de #100 sigue pendiente: VoiceOver/NVDA escuchado, zoom nativo, contraste/foco exhaustivo y uso con teléfono a una mano. Axe sin violaciones no certifica WCAG ni permisos. La comparación del contrato puede revisarse con estas imágenes; aceptación humana del rediseño conectado corresponde a UI-11.

[Seguro] Casos axe `incomplete` conservados en las mediciones: `color-contrast` y `th-has-data-cells` (tabla vacía). Exigen revisión humana; no se declaran comprobaciones aprobadas por ausencia de violaciones. La revisión visual de las capturas corrigió el orden móvil de indicadores para que actividades/pendientes precedan a la consulta.

## Resultado de validación de la entrega

[Seguro] Validación local sobre la base indicada más el diff de #171, macOS arm64/Node 24.16.0, Chromium Playwright 1.63.0. Capturas desktop/móvil y comparación revisadas visualmente tras corregir el orden móvil. [Resultados de los gates](validation.json) y [mediciones](measurements.json) conservan procedencia local y hashes SHA-256 de las fuentes, anchuras, controles y casos axe incompletos. El PNG original mantiene su blob Git inmutable. Lint final, enlaces locales y `git diff --check`: PASS. Auto-revisión limitada al diff del issue; se corrigió la limpieza del servidor de verificación también cuando falla el contraste.

| Verificación | Resultado local |
| --- | --- |
| Propuesta estática | PASS: 7 estados × 6 anchuras = 42; controles ≥44×44, sidebar 256, H1, overflow, orden DOM/visual móvil, axe sin violaciones, teclado, reintento y reflow proxy. |
| `ci:checks` | PASS: lint, contratos, tipos, build, retiro runtime, 150 core y 950 web. 84 integraciones opt-in omitidas por esa suite se ejecutaron sin omisiones en backend. |
| `ci:backend` | PASS: PostgreSQL/API/Worker/backup/PITR, 40 suites SQL/1646 aserciones, guards nativas y 84 integraciones; fallo de portabilidad inyectado esperado y limpieza comprobada. |
| `ci:staging` | PASS: ensayo Docker local, roles mínimos, artefactos y rollback explícito/automático; fallo inyectado esperado, PostgreSQL local y limpieza. |
| `ci:extended` | PASS: 46 recorridos nativos completos + 1 prueba de fallos de transporte; cero omisiones/flaky. |
| `ci:qualification` | PASS técnico; aceptación NO-GO conserva carga/proveedores/humano/operación pendientes. |
| CI remoto | PENDIENTE al redactar: resultados exactos se consultan en el PR; no deducirlos de local. |
| Aceptación humana/corte | PENDIENTE: lector/zoom nativo/teléfono, integración del rediseño UI-02…UI-11 y aceptación externa MIG-24. No son omisiones declaradas PASS. |

[Seguro] Los runners no modifican DB/RLS/RPC ni requieren nueva migración o regeneración de tipos por #171. Los gates backend completos verifican la base vigente. El entorno local necesitó permisos de Chromium/sockets/Docker y usar `corepack pnpm` (el ejecutable global de pnpm no correspondía al runtime configurado); el código de CI no se alteró para ese ajuste local.
