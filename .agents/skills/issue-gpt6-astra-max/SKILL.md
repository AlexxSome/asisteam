---
name: issue-gpt6-astra-max
description: Implementa un issue de GitHub de punta a punta en Spendium como experto DevOps y desarrollo de software. Crea la rama Gitflow correcta, lee el issue con gh, ubica el código afectado usando solo el grafo de graphify, implementa el cambio respetando AGENTS.md y entrega con commit, push y PR a develop. Úsalo cuando el usuario invoque "$issue-gpt6-astra-max" o pida implementar un issue de Spendium apoyándose en graphify. Ejecuta el trabajo con GPT-6 Astra y razonamiento xhigh.
metadata:
  short-description: Implementa issues Spendium con GPT-6 Astra xhigh
  model: gpt-6-astra
  reasoning-effort: xhigh
---

# issueGpt6AstraMax

## Perfil de ejecución obligatorio

Ejecuta el flujo completo mediante **un único subagente interno** creado con:

- `model: gpt-6-astra`
- `reasoning_effort: xhigh`

El agente coordinador debe delegarle la invocación completa y pedirle que lea esta skill antes de actuar. No debe implementar el issue localmente ni crear una tarea visible separada. Debe esperar al subagente, resolver únicamente coordinaciones necesarias y entregar su resultado al usuario.

El subagente ejecutor no debe crear otros subagentes. La prohibición de subagentes de exploración indicada más adelante sigue vigente; este único subagente es el ejecutor del flujo, no un explorador auxiliar.

Actúa como **experto en DevOps y desarrollo de software**. Implementa de punta a punta el issue indicado, respetando el Gitflow del proyecto (ver `AGENTS.md`) y usando **graphify como única fuente de navegación de código**.

El issue objetivo llega como argumento de la invocación (ej: `$issue-gpt6-astra-max 985` → issue `#985`). **Si no se entregó un número de issue, pídelo antes de continuar.**

---

## Regla de oro (la restricción más importante)

Para **descubrir y ubicar** el código afectado por el issue, usa **SOLO el grafo de graphify**:

```bash
graphify query "<concepto>"        # ¿dónde se hace X?
graphify explain "<Nodo>"          # qué hace un nodo y sus vecinos
graphify affected "<Nodo>"         # qué se rompe si toco esto (alcance)
graphify path "<A>" "<B>"          # ruta entre dos puntos del código
```

**PROHIBIDO para explorar o escanear el repo:** `Grep`, `Glob`, y subagentes `Explore`/`Agent`.

`Read` solo está permitido sobre los archivos **exactos que graphify ya identificó**, para editarlos (Edit exige Read previo) o consultar el contexto mínimo necesario del code review acotado al issue. Nunca uses `Read` para "buscar" o "explorar".

Si graphify no alcanza para ubicar algo, **pregunta al usuario** antes de caer en Grep/Glob/Explore.

> **Limitación a tener presente:** el grafo de graphify es **estructural (AST)** — localiza archivos, clases y llamadas, pero NO contiene reglas de negocio. El "qué" de negocio sale de `AGENTS.md`; el "dónde" del código sale de graphify.

---

## Fase 1 — Leer y entender el issue

```bash
gh issue view <n>
gh issue view <n> --comments    # si hay discusión relevante
```

Extraer: objetivo, criterios de aceptación, alcance y naturaleza del cambio (funcionalidad / bug / urgente / mantenimiento).

**Ante cualquier ambigüedad** (alcance poco claro, criterios incompletos, módulo no obvio, decisión de diseño abierta) → **pregunta al usuario. No asumas.**

---

## Fase 2 — Crear la rama (Gitflow del proyecto)

Prefijos oficiales (`AGENTS.md`):

| Naturaleza del issue | Prefijo | Parte desde |
|----------------------|---------|-------------|
| Nueva funcionalidad | `feature/` | `develop` |
| Bug no crítico (en desarrollo) | `bugfix/` | `develop` |
| Corrección urgente en producción | `hotfix/` | `main` / `production` |
| Preparación de versión | `release/` | `develop` |

Nombre de rama: `<prefijo>/<issue-id>-<descripcion-corta-kebab>` (descripción derivada del título del issue, en kebab-case).

- **Determina el nombre de la rama automáticamente** (prefijo + descripción) a partir de la naturaleza y el título del issue. **No preguntes al usuario por el nombre.**
- Elige el prefijo oficial que mejor encaje: `feature` para nueva funcionalidad, `bugfix` para bug en desarrollo, `hotfix` para urgencia en producción, `release` para versión. No inventes prefijos fuera de `AGENTS.md`; ante un chore/refactor/docs, usa `feature/` por defecto (o `bugfix/` si claramente corrige un bug).
- Informa el nombre elegido al crear la rama, pero no esperes confirmación.

```bash
git checkout develop
git pull --rebase origin develop
git checkout -b <prefijo>/<issue-id>-<descripcion>
```

> Nota: el **prefijo de rama** (`feature`/`bugfix`/`hotfix`) es independiente del **tipo de commit** (`feat`/`fix`/`refactor`/`chore`/…). El tipo de commit se elige en la entrega (Fase 6).

---

## Fase 3 — Ubicar el código afectado (SOLO graphify)

1. Verificar que el grafo está fresco:

```bash
git rev-parse HEAD          # comparar con "Built from commit" de graphify-out/GRAPH_REPORT.md
graphify update .           # si el grafo está viejo — barato, sin LLM, sin red
```

2. Consultar el grafo (query / explain / affected / path) hasta tener la **lista exacta de archivos y clases a tocar**.

3. Cruzar con `AGENTS.md` para las reglas de negocio y de arquitectura que apliquen.

4. **Muestra al usuario el alcance detectado** (qué archivos, por qué) antes de editar. Si hay duda de alcance → pregunta.

---

## Fase 4 — Implementar

- Edita **solo** los archivos que graphify identificó (Read puntual + Edit/Write).
- Respeta el stack y las reglas de `AGENTS.md`: backend Spring Boot monolito modular (Java 21), frontend React/TS, mobile Flutter/Riverpod; la lógica de negocio vive en el backend; DTOs, validaciones, Flyway, etc.
- Si surge la necesidad de tocar algo que graphify no detectó → vuelve a la Fase 3 (re-consulta el grafo) o pregunta al usuario. **No escanees con Grep/Glob.**
- Para verificar lo implementado usa los skills del proyecto según lo que se tocó: `/backend-check`, `/frontend-check`, `/mobile-check` (en vez de explorar manualmente).

---

## Code review del issue (antes de CI)

El code review se aplica única y exclusivamente al código añadido, modificado o eliminado para solucionar el issue indicado. Delimita el alcance con el diff respecto de la base del issue, incluyendo commits, staging, cambios sin stage y archivos nuevos atribuibles al issue; excluye cambios ajenos, incluso dentro de un mismo archivo. No hagas code review de todo el proyecto ni de archivos o módulos completos por estar relacionados con el cambio.

Lee código preexistente y dependencias identificadas con graphify solo como contexto mínimo necesario para comprobar el comportamiento y las regresiones del cambio. Reporta únicamente hallazgos introducidos o agravados por el cambio, vinculados a su diff y a un impacto concreto. Los problemas preexistentes no agravados quedan fuera de la revisión y no bloquean su aprobación.

Realiza esta auto-revisión con el mismo ejecutor. Corrige los hallazgos del alcance antes de CI y, tras correcciones posteriores, revisa únicamente esas correcciones y sus efectos en el issue. Este límite también aplica al code review realizado mediante skills auxiliares.

## Fase 5 — Gate de CI local (antes de la entrega)

**Antes de commit → push → PR, corre los skills de CI local que apliquen** según los componentes tocados en el cambio. Es el mismo gate que GitHub Actions, pero confiable (el CI remoto suele caer en <30 s por facturación):

| Si el cambio tocó… | Corre |
|--------------------|-------|
| `backend/` | `/backend-ci` |
| `frontend-web/` | `/frontend-ci` |
| `mobile/` | `/mobile-ci` |

Determina qué aplica con el diff de la rama:

```bash
git diff --name-only develop...HEAD
```

- Corre **solo** los skills de los componentes efectivamente modificados (si el cambio es solo backend, no corras `/frontend-ci` ni `/mobile-ci`).
- Cada skill de CI repara los errores dentro del alcance del cambio. **No avances a la entrega hasta que los skills aplicables reporten PASS.**
- Si un fallo es **pre-existente y ajeno a la rama** (ya falla en `develop`), no lo arregles aquí: anótalo en el body del PR y sigue.

## Fase 6 — Entrega (commit → push → PR a develop)

Sigue el flujo de **`/ship`** (no dupliques sus reglas; este skill se apoya en él). Puntos esenciales:

- **Commit:** `<tipo>(<scope>): <descripción en español> (#<issue>)`
  - tipos: `feat` `fix` `refactor` `test` `docs` `chore` `style`
  - scope: `backend` `frontend` `mobile` (o combinación)
- **Stagea, commitea y pushea automáticamente, sin pedir confirmación.** Stagea solo los archivos relevantes al cambio y commitea con el mensaje en el formato de arriba.
- Push automático: `git push origin HEAD`
- PR a develop (crea automáticamente, sin pedir confirmación):

```bash
gh pr create --base develop \
  --title "<tipo>(<scope>): <descripción> (#<issue>)" \
  --body-file /tmp/pr-body.md
```

- **PROHIBIDO** usar `Closes #`, `Fixes #`, `Resolves #` en el body (Gitflow → cierre manual).
- **NUNCA** mergees el PR desde la CLI — **el usuario revisa y mergea el PR manualmente desde GitHub.**
- **NUNCA** uses `--no-verify`. **NUNCA** pushees directo a `develop` o `main`.
- Muestra la URL del PR y **detente** ahí (el cierre del issue y la limpieza de ramas los hace `/ship` tras el merge del usuario).

---

## Gates de confirmación (resumen)

**Automático, sin preguntar:** nombre de la rama, stage, commit, push y creación del PR a develop. El usuario **revisa y mergea el PR manualmente** desde GitHub (nunca se mergea desde la CLI).

**Pregunta al usuario solo** ante **ambigüedad del issue** (alcance poco claro, criterios incompletos, módulo no obvio, decisión de diseño abierta) y antes de editar si el alcance detectado no es claro. No asumas reglas de negocio.

**Navegación de código: graphify y solo graphify.**
