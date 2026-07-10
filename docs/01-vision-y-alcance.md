# Visión del producto y alcance del MVP

> **Proyecto:** Asisteam · **Fecha del plan:** 2026-07-03 · **Documento:** 01 de 11
> **Documentos relacionados:** 02-roles-y-permisos.md, 03-modulos-y-flujos.md, 04-modelo-de-datos.md, 05-pantallas.md, 06-arquitectura-y-stack.md, 07-api-y-backend.md, 08-reportes-y-estadisticas.md, 09-roadmap.md, 10-historias-de-usuario.md, 11-legal-seguridad-privacidad.md

---

## 1. Resumen del producto

### 1.1 Objetivo

Asisteam es una aplicación web [P0] y móvil [P1] para el **control de asistencia de deportistas/integrantes a entrenamientos y actividades** de grupos (clubes/equipos) deportivos. Permite a los administradores registrar asistencia en segundos desde cualquier dispositivo, entrega a deportistas y apoderados visibilidad de su propio historial, y convierte los datos acumulados en métricas accionables (porcentaje de asistencia, puntualidad, tendencias por tipo de actividad y período).

Es **multi-tenant**: soporta múltiples grupos independientes, y un mismo usuario puede pertenecer a varios grupos con roles distintos (por ejemplo, ADMIN de un club y ATHLETE en otro). Mercado inicial: Chile y Latinoamérica (interfaz en español, zona horaria America/Santiago; fechas almacenadas en UTC y mostradas en hora local).

### 1.2 Problema que resuelve

| Problema actual | Consecuencia | Respuesta de Asisteam |
|---|---|---|
| La asistencia se toma a mano: planillas de papel, Excel o mensajes de WhatsApp | Datos dispersos, ilegibles o perdidos; nadie consolida | Toma de asistencia digital en lista con 4 estados (PRESENT, ABSENT, LATE, EXCUSED) + nota opcional [P0] |
| Los apoderados no saben si su hijo/a asistió ni cuándo entrena | Desinformación, inasistencias no detectadas a tiempo | Rol GUARDIAN con acceso permanente al calendario e historial de sus pupilos [P0] y aviso push de ausencia [P1] |
| No existen métricas históricas de asistencia | Imposible detectar deserción temprana, premiar constancia o justificar decisiones deportivas | Porcentaje de asistencia canónico por deportista, tipo de actividad y período (semana, mes, rango, temporada) [P0] |
| Gestionar menores de edad exige cuidado legal que las planillas ignoran | Riesgo de incumplir Ley 19.628 / Ley 21.719 | Cuentas gestionadas (account_status = MANAGED), vínculo apoderado-deportista obligatorio para menores y reglas de visibilidad estrictas [P0] (ver 11-legal-seguridad-privacidad.md) |
| Cada club improvisa su propia herramienta | Alto costo de coordinación, cero estandarización | Un producto multi-grupo con roles por membresía y configuración de visibilidad por grupo [P0] |

### 1.3 Usuarios principales

| Usuario | Rol en el sistema | Qué necesita |
|---|---|---|
| **Administrador** (dirigente, coordinador o entrenador a cargo) | ADMIN | Crear y configurar el grupo, gestionar integrantes, programar actividades, tomar y corregir asistencia, ver reportes completos del grupo |
| **Deportista / Integrante** | ATHLETE | Ver sus grupos, el calendario de actividades, su historial y su porcentaje de asistencia; comparar con el grupo si el toggle lo permite |
| **Apoderado** | GUARDIAN | Ver perfil, actividades e historial de asistencia de sus pupilos menores de edad; recibir avisos de ausencia [P1] |
| **El grupo (club/equipo) como organización** | Tenant (entidad groups) | Datos consolidados y persistentes de asistencia como activo institucional: continuidad ante cambios de dirigentes, evidencia para premios, becas y decisiones deportivas |

Los roles se asignan **por membresía en cada grupo**, no son globales: un usuario puede ser ADMIN y ATHLETE en el mismo grupo (una fila de membership por rol). El detalle de permisos está en 02-roles-y-permisos.md.

### 1.4 Casos de uso principales

1. **Crear un grupo**: un usuario registrado crea el grupo (nombre, deporte, logo) y obtiene un invite_code para sumar deportistas. [P0]
2. **Incorporar deportistas adultos por código/enlace**: el ADMIN comparte el invite_code; el adulto con cuenta se une como ATHLETE y queda ACTIVE de inmediato. [P0]
3. **Registrar a un menor de edad como cuenta gestionada**: el ADMIN crea el perfil MANAGED del menor sin credenciales y, en el mismo flujo, vincula al menos un apoderado (guardianship); la membership queda ACTIVE. [P0]
4. **Invitar a un apoderado por email**: el ADMIN envía una invitación dirigida con rol GUARDIAN; si el email no tiene cuenta, se crea el usuario con account_status = INVITED. Los GUARDIAN nunca ingresan por código de grupo. [P0]
5. **Programar la semana de entrenamientos**: el ADMIN crea una actividad tipo TRAINING con recurrencia semanal simple (días de semana + fecha fin), por ejemplo martes y jueves 19:00–20:30 hasta fin de temporada. [P0]
6. **Tomar asistencia al inicio del entrenamiento**: el ADMIN abre la actividad y marca a cada deportista con uno de los 4 estados, con nota opcional; menos de 2 minutos para 25 deportistas. [P0]
7. **Corregir asistencia después**: un deportista avisa que su atraso fue justificado; el ADMIN edita el registro de ABSENT a EXCUSED. [P0]
8. **Deportista consulta su propio rendimiento**: un ATHLETE revisa su historial y su porcentaje de asistencia del mes (métrica canónica: (PRESENT + LATE) / (convocadas − EXCUSED) × 100, redondeo a 1 decimal). [P0]
9. **Apoderado supervisa a su pupilo**: un GUARDIAN entra y ve las próximas actividades y el historial de asistencia de su hijo/a en los grupos donde es miembro. [P0]
10. **ADMIN analiza la temporada**: reporte del grupo con porcentaje por deportista, por tipo de actividad y por período, para detectar deserción temprana o premiar constancia. [P0]
11. **Habilitar estadísticas compartidas**: el ADMIN activa groups.settings.athletes_can_view_group_stats para que los deportistas vean la tabla agregada del grupo (solo nombre + métricas, nunca datos de contacto ni notas de terceros). [P0]
12. **Recordatorio y aviso de ausencia en el celular**: el sistema envía push de recordatorio de actividad y notifica al apoderado cuando su pupilo es marcado ABSENT. [P1]

---

## 2. Alcance del MVP

### 2.1 Funcionalidades [P0] — MVP Web (primera versión utilizable)

**Cuentas y acceso**
- Registro y login con email + contraseña; recuperación de contraseña por email; perfil básico (full_name, email, phone, birthdate, avatar_url). [P0]
- Estados de cuenta: ACTIVE, INVITED, MANAGED (users.account_status). Conversión de MANAGED a ACTIVE por invitación por email y creación de contraseña, con consentimiento del apoderado si el titular es menor. [P0]

**Grupos y membresías**
- Creación y configuración de grupo: name, sport, description, logo_url, invite_code único, settings de visibilidad. [P0]
- Soporte multi-grupo: un usuario pertenece a N grupos con roles distintos; selector de grupo activo en la interfaz. [P0]
- Incorporación por código/enlace (solo ATHLETE: adulto → ACTIVE; menor → PENDING hasta apoderado vinculado + confirmación del ADMIN) e invitación dirigida por email con rol específico (ATHLETE o GUARDIAN). [P0]
- Gestión de integrantes (CRUD): alta, edición, desactivación (membership status INACTIVE); creación de cuentas gestionadas para menores. [P0]
- Registro de apoderados y vínculo apoderado-deportista (guardianships); el sistema exige al menos un apoderado antes de crear o activar a un ATHLETE menor de 18 años. [P0]

**Actividades**
- CRUD de actividades: title, description, location, starts_at, ends_at, tipo. [P0]
- Tipos de sistema sembrados (TRAINING, PHYSICAL_PREP, COMPETITION, MEETING) + tipos personalizados por grupo (activity_types con group_id). [P0]
- Recurrencia semanal simple: días de semana + fecha de término (activities.recurrence_rule). [P0]

**Asistencia**
- Toma de asistencia por el ADMIN: lista de deportistas del grupo con los 4 estados (PRESENT, ABSENT, LATE, EXCUSED) + nota opcional por registro; un registro único por (activity_id, membership_id). [P0]
- Edición posterior de asistencia por ADMIN (recorded_by y recorded_at reflejan la última edición). [P0]
- Historial individual de asistencia por deportista. [P0]

**Reportes y visibilidad**
- Reportes del grupo para ADMIN: porcentaje de asistencia por deportista, por tipo de actividad y por período (semana, mes, rango personalizado, temporada). [P0]
- Pantalla de reportes para ATHLETE/GUARDIAN condicionada por los toggles groups.settings.athletes_can_view_group_stats y guardians_can_view_group_stats (independientes, por grupo, por defecto false). [P0]
- Configuración de visibilidad por grupo desde la pantalla de ajustes del ADMIN. [P0]

**Plataforma**
- Web responsive, usable desde el navegador del teléfono (la toma de asistencia funciona en pantalla móvil desde el día uno). [P0]

### 2.2 Funcionalidades [P1] — MVP Móvil + mejoras inmediatas (completan la v1.0)

- App móvil iOS/Android con las funciones núcleo: consulta para los 3 roles + toma de asistencia para ADMIN. [P1]
- Notificaciones push: recordatorio de actividad próxima; aviso de ausencia al apoderado cuando su pupilo es marcado ABSENT. [P1]
- Exportación CSV de reportes (por deportista, tipo de actividad y período). [P1]

### 2.3 Funcionalidades [P2] — Post-MVP (v1.x / v2) y por qué quedan fuera

| Funcionalidad | Por qué queda fuera del MVP |
|---|---|
| Justificación de inasistencias con flujo solicitud/aprobación [P2] | El estado EXCUSED editado por el ADMIN cubre el caso; el workflow agrega pantallas y estados sin validar aún la demanda |
| Login social Google/Apple [P2] | Email + contraseña basta para validar el producto; OAuth suma complejidad de configuración y revisión de tiendas |
| Modo offline con sincronización [P2] | Requiere resolución de conflictos y almacenamiento local robusto; la web responsive con datos móviles cubre la cancha típica |
| Rol COACH con permisos limitados [P2] | En el MVP solo ADMIN toma y edita asistencia; un rol intermedio exige matriz de permisos más fina sin evidencia de necesidad inicial |
| Anuncios / mensajería interna [P2] | WhatsApp ya resuelve la comunicación; competir ahí diluye el foco en asistencia |
| Gestión de pagos/cuotas [P2] | Dominio distinto (dinero, conciliación, boletas) con carga regulatoria propia |
| Multi-idioma [P2] | Mercado inicial hispanohablante; internacionalizar antes de tener tracción es costo muerto |
| Autoregistro con QR o geocerca [P2] | Necesita app móvil madura y controles antifraude; la toma manual por ADMIN es más confiable al inicio |
| Ranking gamificado [P2] | Depende de meses de datos históricos y de definir incentivos sin efectos perversos |
| Auditoría completa de cambios [P2] | recorded_by/recorded_at dan trazabilidad mínima; un audit log completo es infraestructura post-tracción |
| API pública / integraciones [P2] | Sin clientes externos aún; una API pública congela contratos prematuramente |
| Panel multi-club para federaciones [P2] | Segmento distinto (B2B federativo); requiere jerarquía organizacional sobre el modelo multi-tenant actual |

### 2.4 Tabla de priorización

**Criterio explícito:** prioridad = valor para el usuario (¿desbloquea el flujo central tomar asistencia → consultar → reportar?) contra esfuerzo de desarrollo (estimación relativa para un equipo de 2-3 desarrolladores full-stack). Regla de decisión: valor Alto + esfuerzo Bajo/Medio → [P0]; valor Alto + esfuerzo Alto o valor Medio que completa la v1.0 → [P1]; el resto → [P2]. Las excepciones se anotan en la columna de justificación.

| Funcionalidad | Valor usuario | Esfuerzo | Prioridad | Justificación |
|---|---|---|---|---|
| Toma de asistencia (4 estados + nota) | Alto | Bajo | [P0] | Núcleo del producto; sin esto no hay producto |
| Registro/login + recuperación de contraseña | Alto | Bajo | [P0] | Prerrequisito de todo |
| Grupos, invite_code, invitaciones por email | Alto | Medio | [P0] | Sin incorporación no hay usuarios |
| Cuentas gestionadas + vínculo apoderado | Alto | Medio | [P0] | La mayoría de los clubes formativos tiene menores; obligatorio legalmente |
| Actividades CRUD + recurrencia semanal simple | Alto | Medio | [P0] | La asistencia se toma sobre actividades; recurrencia evita crear 40 entrenamientos a mano |
| Reportes ADMIN + métrica canónica | Alto | Medio | [P0] | Es la promesa de valor diferencial frente a la planilla |
| Toggles de visibilidad + reportes ATHLETE/GUARDIAN | Medio | Bajo | [P0] | Excepción por valor de confianza/privacidad: barato y habilita adopción de familias |
| Web responsive | Alto | Bajo | [P0] | La asistencia se toma en la cancha, desde el teléfono |
| App móvil (consulta + toma de asistencia ADMIN) | Alto | Alto | [P1] | Alto valor pero doble plataforma y ciclo de tiendas; la web responsive la suple al inicio |
| Notificaciones push | Alto | Medio | [P1] | Requiere la app móvil [P1] como canal |
| Exportación CSV | Medio | Bajo | [P1] | Útil para dirigentes-Excel; no bloquea el flujo central |
| Flujo de justificaciones | Medio | Medio | [P2] | EXCUSED manual del ADMIN cubre el caso en el MVP |
| Login social | Medio | Medio | [P2] | Conveniencia, no capacidad nueva |
| Modo offline | Medio | Alto | [P2] | Complejidad de sincronización desproporcionada para v1.0 |
| Rol COACH | Medio | Medio | [P2] | Espera evidencia de grupos con cuerpo técnico amplio |
| QR/geocerca, ranking, pagos, mensajería, multi-idioma, auditoría completa, API pública, panel federaciones | Bajo-Medio | Alto | [P2] | Fuera de la propuesta de valor mínima; ver 09-roadmap.md |

### 2.5 Criterios de éxito del MVP

Medición: primeras 12 semanas desde el lanzamiento de [P0], con analítica de producto y consultas sobre la base de datos (ver 08-reportes-y-estadisticas.md). Todos los criterios son verificables con datos del sistema.

| # | Métrica | Definición operativa | Meta MVP |
|---|---|---|---|
| E1 | Grupos activos | groups con ≥ 1 activity con asistencia tomada en los últimos 14 días | ≥ 15 grupos |
| E2 | Adopción del flujo central | % de grupos creados que toman asistencia en ≥ 3 actividades dentro de sus primeros 14 días | ≥ 60 % |
| E3 | Retención de ADMIN | % de ADMIN que siguen tomando asistencia en la semana 8 (de los activos en la semana 1) | ≥ 50 % |
| E4 | Cobertura de registro | attendance_records creados / (actividades pasadas × deportistas ACTIVE convocados) en grupos activos | ≥ 80 % |
| E5 | Velocidad de toma | Mediana de tiempo entre el primer y el último registro de asistencia de una actividad (grupos de ≥ 15 deportistas) | ≤ 3 minutos |
| E6 | Activación de consulta | % de ATHLETE/GUARDIAN con cuenta ACTIVE que inician sesión ≥ 1 vez en sus primeros 30 días | ≥ 40 % |
| E7 | Integridad de menores | % de ATHLETE menores de 18 años con ≥ 1 guardianship vigente | 100 % (invariante del sistema) |
| E8 | Uso de reportes | % de grupos activos donde el ADMIN abre la pantalla de reportes ≥ 2 veces al mes | ≥ 50 % |

El MVP se considera exitoso —y se gatilla la inversión completa en [P1]— si se cumplen E1, E2 y E7, y al menos 3 de los 5 restantes.

---

## 3. Resumen del plan completo

| Documento | Contenido | Léelo para |
|---|---|---|
| **01-vision-y-alcance.md** (este) | Visión, problema, usuarios, casos de uso, alcance [P0]/[P1]/[P2], criterios de éxito | Entender el qué y el porqué del producto |
| **02-roles-y-permisos.md** | Matriz de permisos ADMIN/ATHLETE/GUARDIAN por módulo, reglas de visibilidad, transición del pupilo al cumplir 18 años | Saber quién puede hacer y ver qué |
| **03-modulos-y-flujos.md** | Módulos funcionales y flujos end-to-end (incorporación, toma de asistencia, cuentas gestionadas) con diagramas | Entender cómo se conectan las funcionalidades |
| **04-modelo-de-datos.md** | Esquema completo: users, groups, memberships, guardianships, activity_types, activities, attendance_records, invitations; ERD, índices y restricciones | Implementar la base de datos |
| **05-pantallas.md** | Inventario de pantallas por rol, navegación y estados de cada vista (web [P0] y móvil [P1]) | Diseñar y construir la interfaz |
| **06-arquitectura-y-stack.md** | Stack tecnológico, arquitectura multi-tenant, entornos y decisiones técnicas para 2-3 desarrolladores | Montar la plataforma |
| **07-api-y-backend.md** | Endpoints, autenticación/autorización, validaciones y manejo de zona horaria (UTC / America/Santiago) | Implementar el backend |
| **08-reportes-y-estadisticas.md** | Métrica canónica de asistencia, agregaciones, filtros por período y consultas de reportes | Construir reportes correctos y consistentes |
| **09-roadmap.md** | Plan por fases [P0] → [P1] → [P2] con hitos, estimaciones y dependencias | Planificar el desarrollo |
| **10-historias-de-usuario.md** | Historias HU-ADM-nn / HU-DEP-nn / HU-APO-nn / HU-GEN-nn con criterios de aceptación | Escribir tickets y probar funcionalidades |
| **11-legal-seguridad-privacidad.md** | Ley 19.628 y Ley 21.719 (vigencia diciembre 2026), datos de menores, consentimiento, seguridad y retención | Cumplir el marco legal chileno |
