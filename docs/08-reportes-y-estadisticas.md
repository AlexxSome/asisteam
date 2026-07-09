# Reportes y estadísticas

**Proyecto:** Asisteam · **Fecha:** 2026-07-03 · **Documentos relacionados:** 02-roles-y-permisos.md, 03-modulos-y-flujos.md, 04-modelo-de-datos.md, 05-pantallas.md, 07-api-y-backend.md, 10-historias-de-usuario.md, 11-legal-seguridad-privacidad.md

Este documento define las métricas de asistencia de Asisteam, sus fórmulas exactas, qué ve cada rol, las visualizaciones recomendadas, los casos especiales y las consideraciones de cálculo. Toda funcionalidad lleva su etiqueta de alcance [P0]/[P1]/[P2].

---

## 1. Definiciones base del cálculo

Todas las métricas se calculan sobre `attendance_records`, `activities` y `memberships` (ver 04-modelo-de-datos.md). Reglas de universo, aplicables a **todas** las métricas de este documento:

| Regla | Definición |
|---|---|
| Actividad convocada | Una actividad se considera "convocada" para un deportista cuando existe una fila en `attendance_records` para su `membership_id` en esa actividad. Las actividades pasadas sin asistencia registrada **no cuentan** en ninguna métrica (no hay dato, no se penaliza ni premia). |
| Actividades futuras | Solo cuentan actividades con `activities.starts_at <= now()`. Las futuras nunca entran en numerador ni denominador, aunque tengan registros precargados. |
| Ingreso a mitad de temporada | Solo cuentan actividades con `activities.starts_at >= memberships.joined_at` del deportista. Un deportista que entra en julio no arrastra las ausencias de marzo-junio. |
| Ámbito | Toda métrica es por grupo (club/equipo): se calcula sobre la `membership` con rol `ATHLETE` del grupo, nunca cruzando grupos. Un usuario en dos grupos tiene dos porcentajes independientes. |
| Períodos de filtro | `week` (semana lunes-domingo), `month` (mes calendario), `custom` (rango personalizado `from`/`to`), `season` (todo el historial del grupo, desde su creación). Los límites de período se calculan en `America/Santiago` y se convierten a UTC para consultar (fechas almacenadas en UTC). |
| Redondeo | Todos los porcentajes se redondean a 1 decimal (half-up). |
| Denominador cero | Si el denominador es 0 (sin actividades convocadas, o todas `EXCUSED`), el porcentaje se muestra como "Sin datos" (`null` en la API), **nunca** como 0 % ni 100 %. |
| Membresías inactivas | Por defecto los reportes de grupo incluyen solo `memberships.status = ACTIVE`. El ADMIN dispone de un filtro "incluir inactivos" que agrega a los deportistas con `status = INACTIVE` marcados como tales (su historial no se borra al desactivarlos). [P0] |

---

## 2. Métricas y fórmulas exactas

### 2.1 Porcentaje de asistencia por deportista [P0] — métrica canónica

```
attendance_pct = (PRESENT + LATE) / (convocadas - EXCUSED) × 100
```

Donde, para una `membership` de rol `ATHLETE` y un período dado:

- `PRESENT` = cantidad de `attendance_records` con `status = PRESENT`.
- `LATE` = cantidad con `status = LATE` (cuenta como asistencia, se reporta aparte, ver 2.6).
- `convocadas` = total de `attendance_records` del deportista en actividades del período (con `starts_at <= now()` y `starts_at >= joined_at`).
- `EXCUSED` = cantidad con `status = EXCUSED`. **No penaliza**: se excluye del denominador.

Equivalencia operativa (útil para SQL): `denominador = PRESENT + LATE + ABSENT`; `numerador = PRESENT + LATE`.

Ejemplo verificable: 10 convocadas, 6 PRESENT, 1 LATE, 2 ABSENT, 1 EXCUSED → (6+1)/(10−1) = 7/9 = **77.8 %**.

### 2.2 Asistencia por actividad [P0]

Para una actividad individual (`activity_id`):

```
activity_rate = (PRESENT + LATE) / (registros de la actividad - EXCUSED) × 100
```

- El ADMIN ve además la **lista nominal de asistentes**: cada deportista con su `status`, `note` y `recorded_at` / `recorded_by` [P0].
- Los no-ADMIN nunca ven la lista nominal de estados de terceros; solo la tasa agregada de la actividad si el toggle correspondiente está activo (ver sección 3).

### 2.3 Asistencia por tipo de actividad [P0]

Misma fórmula canónica de 2.1, filtrando por `activities.activity_type_id`. Se reporta una fila por tipo (sistema y personalizados: `TRAINING`, `PHYSICAL_PREP`, `COMPETITION`, `MEETING` + tipos del grupo), tanto a nivel de grupo como a nivel de deportista individual. Permite responder "asiste a entrenamientos pero falta a competencias".

### 2.4 Asistencia por período [P0]

Misma fórmula canónica de 2.1, con filtro `week` / `month` / `custom` / `season` (ver sección 1; mismo contrato `period=` de 07-api-y-backend.md). Todos los reportes de este documento aceptan el filtro de período; el valor por defecto de las pantallas de reportes es `month` (mes en curso).

### 2.5 Tendencia temporal [P0 datos / P1 gráfico]

Serie de `attendance_pct` (fórmula 2.1) agrupada en cubetas (buckets) por semana o por mes dentro del período seleccionado:

```
trend[i] = attendance_pct calculado solo sobre las convocadas cuya
           activities.starts_at cae en la cubeta i (semana o mes, hora de Chile)
```

- Nivel deportista (su propia curva) y nivel grupo (promedio simple de los `attendance_pct` individuales de la cubeta; los deportistas "Sin datos" en la cubeta se excluyen del promedio).
- Los datos por cubeta se exponen desde [P0] (tabla); el gráfico de línea es [P1] (ver sección 4).

### 2.6 Indicador de puntualidad (tasa de LATE) [P0]

```
late_rate = LATE / (PRESENT + LATE) × 100
```

Proporción de las asistencias efectivas que fueron con atraso. Se muestra junto al porcentaje de asistencia ("Asistencia 92.3 % · Atrasos 15.0 %"). Si `PRESENT + LATE = 0`, se muestra "Sin datos". Disponible por deportista, por tipo de actividad y a nivel grupo (agregando los conteos LATE y PRESENT+LATE de todo el grupo, no promediando porcentajes).

### 2.7 Resumen general del grupo (tabla ordenada) [P0] y ranking gamificado [P2]

- **[P0] Tabla resumen del grupo:** una fila por deportista con: `full_name`, convocadas, PRESENT, LATE, ABSENT, EXCUSED, `attendance_pct`, `late_rate`. Ordenada por `attendance_pct` descendente (empates: alfabético por `full_name`; "Sin datos" al final). Incluye fila de totales del grupo (conteos sumados y porcentaje global calculado sobre los conteos agregados, no promedio de porcentajes).
- **[P2] Ranking gamificado:** posiciones, medallas, rachas de asistencia y logros. Fuera del MVP; la tabla [P0] no muestra posiciones numéricas ni elementos de competencia, solo el orden.

### 2.8 Exportación CSV de reportes [P1]

Exportación de la tabla resumen del grupo y del historial individual a CSV (separador `;` por convención regional, codificación UTF-8 con BOM para Excel). Columnas del resumen: `full_name`, `convened`, `present`, `late`, `absent`, `excused`, `attendance_pct`, `late_rate`, `period_from`, `period_to` (mismos identificadores que el payload JSON de reportes de 07-api-y-backend.md §3.4). Solo disponible para ADMIN. Rutas y contrato en 07-api-y-backend.md.

---

## 3. Visibilidad por rol

Los toggles `groups.settings.athletes_can_view_group_stats` y `groups.settings.guardians_can_view_group_stats` son independientes, por grupo y **por defecto `false`** (ver 02-roles-y-permisos.md). Configuración de visibilidad: [P0].

### 3.1 Qué ve cada rol

| Contenido | ADMIN | ATHLETE (toggle off) | ATHLETE (toggle on) | GUARDIAN (toggle off) | GUARDIAN (toggle on) |
|---|---|---|---|---|---|
| Su propio historial y `attendance_pct` (2.1, 2.4, 2.5, 2.6) | Sí (el suyo si también es ATHLETE) | **Sí, siempre** | Sí | Del pupilo: **sí, siempre** | Del pupilo: sí |
| Historial y `attendance_pct` del pupilo (vía `guardianship`) | Sí | — | — | **Sí, siempre** | Sí |
| Detalle por actividad propio/del pupilo (estado + `note` propia) | Sí | Sí | Sí | Sí (del pupilo) | Sí (del pupilo) |
| Tabla resumen del grupo (2.7): nombre + métricas agregadas de cada integrante | Sí | No | Sí (solo `full_name` + porcentajes y totales) | No | Sí (solo `full_name` + porcentajes y totales) |
| Tasa agregada por actividad y por tipo del grupo (2.2, 2.3 nivel grupo) | Sí | No | Sí | No | Sí |
| Lista nominal de asistentes de una actividad con estados individuales (2.2) | Sí | No | **No** | No | **No** |
| Notas de asistencia (`note`) de terceros | Sí | No | **No** | No | **No** |
| Reportes de deportistas de otros grupos | No (solo sus grupos) | No | No | No | No |

Notas:
- "Toggle on/off" se refiere al toggle del rol correspondiente en el grupo consultado.
- El GUARDIAN solo ve datos de pupilos menores de edad vinculados por `guardianship` activo, y solo en los grupos donde el pupilo es miembro (regla canónica 2 y 3; transición a los 18 años en 02-roles-y-permisos.md y 11-legal-seguridad-privacidad.md).
- La pantalla de reportes para ATHLETE/GUARDIAN condicionada por toggles es [P0] (web) y [P1] (app móvil, solo consulta).

### 3.2 Información oculta SIEMPRE a no-ADMIN (aunque el toggle esté activo)

Regla canónica 5. Con toggle activo, los no-ADMIN ven **exclusivamente `full_name` + métricas agregadas** de los demás integrantes. Nunca se expone a ATHLETE ni GUARDIAN sobre terceros:

1. Datos de contacto: `users.email`, `users.phone`.
2. Fecha de nacimiento (`users.birthdate`) y cualquier derivado que revele minoría de edad de terceros.
3. Notas de asistencia individuales (`attendance_records.note`) de terceros.
4. Datos de apoderados de terceros (existencia del vínculo `guardianship`, identidad o contacto del apoderado).
5. Desglose actividad por actividad de terceros (estado PRESENT/ABSENT/LATE/EXCUSED en cada actividad individual): solo se muestran agregados por período/tipo.
6. `users.avatar_url` no está en la lista prohibida canónica; en la tabla agregada se muestra avatar + `full_name` como identificación mínima (misma exposición que la lista de plantel).
7. Metadatos administrativos: `account_status`, `recorded_by`, `recorded_at`, estado de invitaciones.

La API aplica estos recortes en el servidor (serializadores por rol, ver 07-api-y-backend.md); el frontend nunca recibe los campos ocultos, no basta con ocultarlos en la interfaz.

---

## 4. Visualizaciones recomendadas por métrica

| Métrica | Visualización | Prioridad | Detalle |
|---|---|---|---|
| Resumen del grupo (2.7) | Tabla ordenable con fila de totales | **[P0]** | Componente base de la pantalla de reportes del ADMIN (ver 05-pantallas.md). |
| Porcentaje individual (2.1) | Anillo de porcentaje (donut) con la cifra al centro | **[P0]** | Cabecera del historial individual; color según tramo: ≥85 % verde, 70–84,9 % ámbar, <70 % rojo (mismo semáforo que 05-pantallas.md §5.4). |
| Historial individual (2.1) | Lista/tabla cronológica de actividades con chip de estado | **[P0]** | Chips: PRESENT verde, LATE ámbar, ABSENT rojo, EXCUSED gris. |
| Por tipo de actividad (2.3) | Barras horizontales (una por tipo, con el color del `activity_types.color`) | **[P0]** | Barras estáticas simples; sin librería de gráficos compleja en MVP. |
| Asistencia por actividad (2.2) | Tasa numérica + barra de progreso en la ficha de la actividad; lista nominal solo ADMIN | **[P0]** | |
| Puntualidad (2.6) | Cifra secundaria junto al anillo; barra apilada PRESENT/LATE | **[P0]** cifra, **[P1]** barra apilada | |
| Tendencia temporal (2.5) | Tabla por cubeta [P0]; gráfico de línea por semana/mes | **[P1]** gráfico | Línea individual y línea del grupo superpuestas. |
| Comparativo entre períodos (mes actual vs anterior, delta ▲▼) | Tarjetas con variación | **[P1]** | |
| Heatmap de asistencia por día de la semana | Matriz día × semana con intensidad de color | **[P2]** | Útil para detectar el día que más falla el grupo; requiere más historial y librería de gráficos. |
| Ranking gamificado (2.7) | Podio, medallas, rachas | **[P2]** | |

Criterio general: en [P0] todo reporte debe funcionar como tabla accesible y responsive (usable en navegador móvil); los gráficos enriquecidos llegan con [P1] junto con la app móvil y la exportación CSV [P1].

---

## 5. Casos especiales

| Caso | Regla | Comportamiento verificable |
|---|---|---|
| Deportista ingresa a mitad de temporada | Solo cuentan actividades con `starts_at >= memberships.joined_at` | Deportista que entra el 01-08 con el grupo activo desde marzo: su filtro "temporada" solo considera actividades desde el 01-08; su porcentaje no baja por actividades previas. |
| Actividades futuras | `starts_at > now()` se excluyen siempre | Crear una actividad para mañana no altera ningún porcentaje hoy, aunque el ADMIN haya precargado registros. |
| Actividad pasada sin asistencia tomada | Sin filas en `attendance_records` → no es "convocada" para nadie | No entra en denominadores; en la lista de actividades del ADMIN se marca "Sin registro" con acceso directo a tomar asistencia (ver 03-modulos-y-flujos.md). |
| Grupo sin actividades | Estado vacío | Pantalla de reportes muestra estado vacío: para ADMIN, mensaje + CTA "Crear primera actividad"; para ATHLETE/GUARDIAN, mensaje informativo sin CTA. Sin errores ni porcentajes 0 %. |
| Todas las convocadas son EXCUSED | Denominador = 0 | Se muestra "Sin datos", no 0 % ni 100 %. |
| Deportista pasa a INACTIVE | El historial se conserva | Desaparece del resumen por defecto; visible con el filtro "incluir inactivos" del ADMIN [P0]. |
| Pupilo cumple 18 años | El vínculo `guardianship` pasa a inactivo | El GUARDIAN deja de ver los reportes del ex-pupilo de inmediato (detalle en 02-roles-y-permisos.md y 11-legal-seguridad-privacidad.md). |
| Usuario con doble rol en el grupo (ADMIN + ATHLETE) | Cada `membership` es una fila | Sus métricas como deportista se calculan sobre su `membership` ATHLETE; como ADMIN ve el reporte completo del grupo. |
| Edición posterior de asistencia por ADMIN [P0] | Los reportes reflejan el último estado | Cambiar un ABSENT a EXCUSED recalcula el porcentaje en la siguiente consulta (sin cache en [P0], ver sección 6). |
| Actividad recurrente semanal | Cada ocurrencia generada es una actividad independiente | Cada ocurrencia cuenta por separado en las métricas; la `recurrence_rule` no agrupa resultados. |

---

## 6. Consideraciones de cálculo

Estrategia [P0]: **agregación SQL directa en cada consulta, sin cache**. Con la escala objetivo del MVP (grupos de hasta ~200 deportistas y ~500 actividades por temporada), un `GROUP BY` sobre `attendance_records` con los índices correctos responde muy por debajo del objetivo de latencia p95 < 500 ms definido en 07-api-y-backend.md.

Consulta de referencia para la tabla resumen del grupo (2.7):

```sql
SELECT
  m.id AS membership_id,
  u.full_name,
  COUNT(*) FILTER (WHERE ar.status IN ('PRESENT','LATE'))          AS attended,
  COUNT(*) FILTER (WHERE ar.status = 'LATE')                        AS late_count,
  COUNT(*) FILTER (WHERE ar.status <> 'EXCUSED')                    AS denominator,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ar.status IN ('PRESENT','LATE'))
        / NULLIF(COUNT(*) FILTER (WHERE ar.status <> 'EXCUSED'), 0), 1) AS attendance_pct
FROM attendance_records ar
JOIN activities  a ON a.id = ar.activity_id
JOIN memberships m ON m.id = ar.membership_id
JOIN users       u ON u.id = m.user_id
WHERE a.group_id = :group_id
  AND a.starts_at >= :from_utc      -- límite del período, calculado en America/Santiago
  AND a.starts_at <  :to_utc
  AND a.starts_at <= now()          -- excluye futuras
  AND a.starts_at >= m.joined_at    -- ingreso a mitad de temporada
  AND m.role = 'ATHLETE'
  AND m.status = 'ACTIVE'           -- se omite si el ADMIN pide "incluir inactivos"
GROUP BY m.id, u.full_name
ORDER BY attendance_pct DESC NULLS LAST, u.full_name ASC;
```

Índices requeridos (definidos en 04-modelo-de-datos.md; verificar con `EXPLAIN ANALYZE`):

- `activities (group_id, starts_at)` — filtro principal de todos los reportes.
- `attendance_records (activity_id)` y `attendance_records (membership_id)` — cubiertos en parte por la restricción única `(activity_id, membership_id)`.
- `memberships (group_id, role, status)` — resolución del plantel del grupo.

Reglas adicionales:

- Las variantes por tipo (2.3) agregan `AND a.activity_type_id = :type_id`; la tendencia (2.5) agrega `date_trunc('week'|'month', a.starts_at AT TIME ZONE 'America/Santiago')` como clave de agrupación.
- El recorte de campos por rol (sección 3.2) se aplica en el serializador del endpoint, nunca delegado al cliente; los endpoints de reportes y sus contratos exactos están en 07-api-y-backend.md.
- **Cache / precálculo [P2]:** si un grupo supera ~1.000 actividades o los reportes agregados superan el objetivo de latencia, introducir vista materializada por `(membership_id, mes)` refrescada al escribir asistencia, o cache de respuestas con invalidación por `group_id` al crear/editar `attendance_records`. No implementar antes: la edición posterior de asistencia [P0] exige coherencia inmediata y el costo de invalidación no se justifica a escala MVP.
- La exportación CSV [P1] reutiliza la misma consulta agregada (mismos filtros y redondeo) para garantizar que el archivo y la pantalla nunca difieran.

---

## 7. Trazabilidad

- Historias de usuario relacionadas: reportes del ADMIN (HU-ADM), historial propio del deportista (HU-DEP), vista del apoderado (HU-APO) — ver 10-historias-de-usuario.md.
- Pantallas: reportes del grupo, historial individual, ficha de actividad — ver 05-pantallas.md.
- Permisos y toggles de visibilidad: ver 02-roles-y-permisos.md.
- Endpoints, latencias y serialización por rol: ver 07-api-y-backend.md.
- Retención y minimización de datos en reportes (menores de edad, Ley 19.628 y Ley 21.719): ver 11-legal-seguridad-privacidad.md.
