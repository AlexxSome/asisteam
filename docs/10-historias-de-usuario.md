# Historias de usuario

**Proyecto:** Asisteam · **Fecha:** 2026-07-03 · **Documentos relacionados:** 01-vision-y-alcance.md, 02-roles-y-permisos.md, 03-modulos-y-flujos.md, 04-modelo-de-datos.md, 05-pantallas.md, 08-reportes-y-estadisticas.md, 09-roadmap.md, 11-legal-seguridad-privacidad.md

## 1. Convenciones

- Formato de ID: `HU-ADM-nn` (administrador), `HU-DEP-nn` (deportista), `HU-APO-nn` (apoderado), `HU-GEN-nn` (transversales).
- Cada historia indica su prioridad canónica [P0]/[P1]/[P2] y de 2 a 4 criterios de aceptación en formato Dado/Cuando/Entonces, verificables en QA.
- Roles referidos por membresía en cada grupo (club/equipo): ADMIN, ATHLETE, GUARDIAN (ver 02-roles-y-permisos.md).
- El porcentaje de asistencia citado en los criterios es siempre la métrica canónica: `(PRESENT + LATE) / (convocadas - EXCUSED) × 100`, redondeado a 1 decimal (ver 08-reportes-y-estadisticas.md).
- Los módulos de la columna final de la tabla resumen corresponden a 03-modulos-y-flujos.md.

## 2. MVP ([P0] y [P1])

### 2.1 Transversales (HU-GEN)

#### HU-GEN-01 — Registro con email y contraseña [P0]
**Como** visitante **quiero** crear una cuenta con email y contraseña **para** acceder a Asisteam.
1. **Dado** un email no registrado, **cuando** completo `full_name`, `email`, `birthdate` y una contraseña de mínimo 10 caracteres (política de 11-legal-seguridad-privacidad.md §5.2: sin exigencia de composición arbitraria, verificada contra listas de contraseñas filtradas), **entonces** se crea la fila en `users` con `account_status = ACTIVE` y quedo autenticado.
2. **Dado** un email ya existente en `users`, **cuando** intento registrarme con él, **entonces** el sistema rechaza el registro con el mensaje "Este email ya está registrado" y no crea filas duplicadas.
3. **Dado** que completé el registro, **cuando** ingreso por primera vez sin membresías, **entonces** veo la pantalla de inicio con las acciones "Crear un grupo" y "Unirme con código" (ver 05-pantallas.md).

#### HU-GEN-02 — Inicio de sesión [P0]
**Como** usuario registrado **quiero** iniciar sesión con email y contraseña **para** usar la aplicación con mi identidad.
1. **Dado** un usuario `ACTIVE` con credenciales correctas, **cuando** envío el formulario de login, **entonces** obtengo una sesión válida y aterrizo en mi último grupo activo o en el selector de grupos.
2. **Dado** credenciales incorrectas, **cuando** intento iniciar sesión, **entonces** recibo el error genérico "Email o contraseña incorrectos" sin revelar cuál campo falló.
3. **Dado** un perfil con `account_status = MANAGED` (sin credenciales), **cuando** se intenta iniciar sesión con su email (si existiera), **entonces** el acceso se rechaza: las cuentas MANAGED solo acceden tras convertirse en ACTIVE (HU-DEP-07).

#### HU-GEN-03 — Recuperación de contraseña [P0]
**Como** usuario registrado **quiero** restablecer mi contraseña por email **para** recuperar el acceso si la olvido.
1. **Dado** un email existente con cuenta ACTIVE o INVITED, **cuando** solicito recuperación, **entonces** recibo un correo con enlace de un solo uso y expiración de 60 minutos.
2. **Dado** un email inexistente, **cuando** solicito recuperación, **entonces** la respuesta visible es idéntica ("Si el email existe, enviamos instrucciones") para no revelar cuentas.
3. **Dado** un enlace vigente, **cuando** defino una nueva contraseña válida, **entonces** puedo iniciar sesión con ella y el enlace queda invalidado.

#### HU-GEN-04 — Perfil básico [P0]
**Como** usuario autenticado **quiero** editar mi perfil **para** mantener mis datos al día en todos mis grupos.
1. **Dado** que estoy autenticado, **cuando** edito `full_name`, `phone`, `birthdate` o subo un avatar (`avatar_url`), **entonces** los cambios persisten y se reflejan en todos mis grupos.
2. **Dado** el formulario de perfil, **cuando** lo abro, **entonces** el campo `email` se muestra pero no es editable en el MVP.
3. **Dado** que soy ATHLETE menor de edad en algún grupo, **cuando** intento cambiar `birthdate` a una fecha que me haría adulto, **entonces** el sistema exige confirmación del ADMIN del grupo antes de aplicar el cambio (afecta guardianships, ver 11-legal-seguridad-privacidad.md).

#### HU-GEN-05 — Soporte multi-grupo [P0]
**Como** usuario con varias membresías **quiero** cambiar de grupo activo **para** operar en cada grupo con el rol que tengo en él.
1. **Dado** que tengo memberships `ACTIVE` en 2+ grupos, **cuando** abro el selector de grupos, **entonces** veo todos mis grupos con mi(s) rol(es) en cada uno.
2. **Dado** que soy ADMIN en el grupo A y ATHLETE en el grupo B, **cuando** cambio del grupo A al B, **entonces** la interfaz pasa de las funciones de ADMIN a las de ATHLETE sin cerrar sesión.
3. **Dado** un grupo donde no soy miembro, **cuando** intento acceder a cualquiera de sus recursos por URL directa, **entonces** recibo 404 (los recursos no visibles no confirman su existencia — política anti-enumeración de 07-api-y-backend.md §7.3) y no se filtra ningún dato (regla de visibilidad 6).

#### HU-GEN-06 — Aceptar invitación por email [P0]
**Como** persona invitada por email **quiero** activar mi cuenta desde el enlace recibido **para** entrar al grupo con el rol asignado.
1. **Dado** un `token` de `invitations` en estado PENDING y vigente, **cuando** abro el enlace sin tener cuenta, **entonces** completo contraseña y datos, mi `users.account_status` pasa de INVITED a ACTIVE, mi membership queda ACTIVE y la invitación pasa a ACCEPTED.
2. **Dado** que el email invitado ya tiene cuenta ACTIVE, **cuando** abro el enlace, **entonces** inicio sesión y acepto la invitación en un paso, creándose solo la membership con el rol indicado.
3. **Dado** un token vencido (`expires_at` pasado), **cuando** abro el enlace, **entonces** veo "Invitación expirada", la invitación queda EXPIRED y puedo pedir al ADMIN un reenvío con token nuevo.

#### HU-GEN-07 — App móvil con funciones núcleo [P1]
**Como** usuario de cualquier rol **quiero** una app móvil iOS/Android **para** consultar y operar desde el teléfono en terreno.
1. **Dado** que instalo la app e inicio sesión, **cuando** navego, **entonces** accedo a mis grupos, actividades, historial y reportes según mi rol, con paridad de reglas de visibilidad con la web.
2. **Dado** que soy ADMIN de un grupo, **cuando** abro una actividad en curso en la app, **entonces** puedo tomar y editar asistencia con los 4 estados y nota opcional, igual que en web.
3. **Dado** que acepté recibir notificaciones, **cuando** el sistema envía un push (HU-DEP-08, HU-APO-06), **entonces** al tocarlo la app abre la pantalla correspondiente.

### 2.2 Administrador (HU-ADM)

#### HU-ADM-01 — Crear grupo [P0]
**Como** administrador **quiero** crear un grupo (club/equipo) **para** gestionar la asistencia de mis deportistas.
1. **Dado** que estoy autenticado, **cuando** creo un grupo con `name`, `sport` y opcionalmente `description` y `logo_url`, **entonces** se crea la fila en `groups` con un `invite_code` único generado automáticamente y `settings` con ambos toggles en `false`.
2. **Dado** que el grupo se creó, **cuando** consulto sus miembros, **entonces** existe mi membership con `role = ADMIN` y `status = ACTIVE`.
3. **Dado** que además entreno en el grupo, **cuando** me agrego también como deportista, **entonces** existe una segunda fila de membership con `role = ATHLETE` para mi mismo `user_id` y `group_id`.

#### HU-ADM-02 — Configurar el grupo [P0]
**Como** administrador **quiero** editar los datos del grupo **para** mantenerlo identificable y seguro.
1. **Dado** que soy ADMIN del grupo, **cuando** edito `name`, `sport`, `description` o `logo_url`, **entonces** los cambios persisten y son visibles para todos los miembros.
2. **Dado** que el `invite_code` se filtró a terceros, **cuando** lo regenero desde la configuración, **entonces** el código anterior queda inválido de inmediato y el nuevo funciona.
3. **Dado** que un usuario sin rol ADMIN en el grupo intenta acceder a la configuración, **cuando** llama a la pantalla o al endpoint, **entonces** recibe 403.

#### HU-ADM-03 — Invitar por código/enlace de grupo [P0]
**Como** administrador **quiero** compartir el código o enlace del grupo **para** que los deportistas se incorporen solos.
1. **Dado** que soy ADMIN, **cuando** abro "Invitar", **entonces** veo el `invite_code` y un enlace copiable/compartible equivalente.
2. **Dado** que un adulto con cuenta usa el código, **cuando** confirma unirse, **entonces** se crea su membership `ATHLETE` con `status = ACTIVE` (el código solo incorpora ATHLETE, nunca GUARDIAN).
3. **Dado** que un menor de edad usa el código, **cuando** confirma unirse, **entonces** su membership queda `PENDING` y aparece en mi lista de aprobaciones (HU-ADM-07).

#### HU-ADM-04 — Invitar por email con rol específico [P0]
**Como** administrador **quiero** invitar por email indicando el rol **para** incorporar deportistas y apoderados de forma dirigida.
1. **Dado** que soy ADMIN, **cuando** envío una invitación a un email con rol ATHLETE o GUARDIAN, **entonces** se crea la fila en `invitations` con `token` único, `status = PENDING` y `expires_at` a 7 días (valor canónico de 03-modulos-y-flujos.md F3, 04-modelo-de-datos.md §2.8 y 07-api-y-backend.md R12).
2. **Dado** que el email no tiene cuenta, **cuando** se envía la invitación, **entonces** se crea la fila en `users` con `account_status = INVITED` y `invitations.invited_user_id` la referencia.
3. **Dado** una invitación PENDING no aceptada, **cuando** la reenvío, **entonces** se genera un token nuevo con nueva expiración y el anterior queda inválido.

#### HU-ADM-05 — Crear cuenta gestionada (MANAGED) [P0]
**Como** administrador **quiero** crear perfiles sin credenciales **para** registrar deportistas (típicamente menores) que no operan su propia cuenta.
1. **Dado** que soy ADMIN, **cuando** creo un perfil con `full_name` y `birthdate` (email opcional), **entonces** se crea `users` con `account_status = MANAGED` y su membership `ATHLETE` queda `ACTIVE` de inmediato.
2. **Dado** que el perfil creado es menor de 18 años según `birthdate`, **cuando** intento guardar sin vincular al menos un apoderado, **entonces** el sistema bloquea el cierre del flujo hasta completar el vínculo (HU-ADM-06).
3. **Dado** un perfil MANAGED creado, **cuando** tomo asistencia, **entonces** el deportista aparece en la lista igual que cualquier miembro ACTIVE.

#### HU-ADM-06 — Registrar apoderado y vincularlo a un deportista [P0]
**Como** administrador **quiero** registrar apoderados y vincularlos con sus pupilos **para** cumplir la regla de que todo menor tenga apoderado.
1. **Dado** un deportista menor de edad, **cuando** registro un apoderado (cuenta nueva, invitación por email o usuario existente) e indico `relationship` (madre/padre/tutor…), **entonces** se crea la fila en `guardianships` única por (`guardian_user_id`, `athlete_user_id`) y la membership GUARDIAN del apoderado en el grupo.
2. **Dado** que intento vincular a un apoderado con un deportista adulto (18+), **cuando** guardo, **entonces** el sistema rechaza el vínculo: GUARDIAN solo aplica a menores (regla de visibilidad 3).
3. **Dado** un vínculo ya existente, **cuando** intento crearlo de nuevo, **entonces** el sistema informa el duplicado y no crea otra fila.

#### HU-ADM-07 — Aprobar membresías PENDING [P0]
**Como** administrador **quiero** revisar y aprobar las incorporaciones pendientes **para** controlar quién entra al grupo.
1. **Dado** que existen memberships `PENDING`, **cuando** abro "Aprobaciones", **entonces** veo la lista con nombre, edad (mayor/menor) y si el menor tiene apoderado vinculado.
2. **Dado** un menor sin apoderado vinculado, **cuando** intento aprobarlo, **entonces** el botón de aprobación permanece bloqueado con el aviso "Requiere apoderado vinculado".
3. **Dado** un pendiente que cumple requisitos, **cuando** lo apruebo, **entonces** su membership pasa a `ACTIVE` y aparece en las listas de asistencia; **cuando** lo rechazo, **entonces** pasa a `INACTIVE` conservando la trazabilidad.

#### HU-ADM-08 — Crear actividad simple [P0]
**Como** administrador **quiero** crear actividades puntuales **para** convocar a mis deportistas.
1. **Dado** que soy ADMIN, **cuando** creo una actividad con `title`, `activity_type_id`, `location`, `starts_at` y `ends_at` en hora de Chile, **entonces** se guarda en `activities` en UTC y todos los miembros la ven en hora America/Santiago.
2. **Dado** el selector de tipo, **cuando** lo despliego, **entonces** veo los 4 tipos de sistema (TRAINING, PHYSICAL_PREP, COMPETITION, MEETING) y los tipos personalizados activos del grupo.
3. **Dado** `ends_at` anterior o igual a `starts_at`, **cuando** intento guardar, **entonces** el sistema rechaza con un error de validación explícito.

#### HU-ADM-09 — Crear actividad recurrente semanal [P0]
**Como** administrador **quiero** programar entrenamientos que se repiten cada semana **para** no crearlos uno a uno.
1. **Dado** el formulario de actividad, **cuando** activo recurrencia y elijo días de semana (ej. martes y jueves), horario y fecha de término, **entonces** se generan las ocurrencias como filas independientes en `activities` con la `recurrence_rule` registrada.
2. **Dado** una serie generada, **cuando** edito o elimino una ocurrencia puntual, **entonces** solo esa ocurrencia cambia y el resto de la serie queda intacto.
3. **Dado** una serie generada, **cuando** edito la serie, **entonces** los cambios aplican solo a ocurrencias futuras sin asistencia registrada.

#### HU-ADM-10 — Crear tipo de actividad personalizado [P0]
**Como** administrador **quiero** definir tipos de actividad propios del grupo **para** reflejar nuestra operación real.
1. **Dado** que soy ADMIN, **cuando** creo un tipo con `name` y `color`, **entonces** se crea en `activity_types` con `group_id` del grupo y aparece en el selector de actividades.
2. **Dado** un tipo personalizado en uso, **cuando** lo desactivo (`is_active = false`), **entonces** deja de ofrecerse para actividades nuevas pero las actividades e informes históricos lo conservan.
3. **Dado** los tipos de sistema (`group_id` NULL), **cuando** intento editarlos o desactivarlos, **entonces** el sistema no lo permite.

#### HU-ADM-11 — Tomar asistencia [P0]
**Como** administrador **quiero** registrar la asistencia de una actividad **para** tener el dato oficial del grupo.
1. **Dado** una actividad del grupo, **cuando** abro "Tomar asistencia", **entonces** veo la lista de todas las memberships ATHLETE `ACTIVE` del grupo con los 4 estados (PRESENT, ABSENT, LATE, EXCUSED) y campo de nota opcional por deportista.
2. **Dado** que marco estados y guardo, **entonces** se crean filas en `attendance_records` únicas por (`activity_id`, `membership_id`) con `recorded_by` = mi `user_id` y `recorded_at` con timestamp.
3. **Dado** que vuelvo a abrir la misma actividad, **cuando** cambio el estado de un deportista ya marcado, **entonces** se actualiza la fila existente en vez de crear una duplicada.
4. **Dado** que no soy ADMIN del grupo, **cuando** intento acceder a la toma de asistencia, **entonces** recibo 403 (solo ADMIN toma asistencia en el MVP; COACH es [P2]).

#### HU-ADM-12 — Editar asistencia posterior [P0]
**Como** administrador **quiero** corregir registros de asistencia pasados **para** subsanar errores u omisiones.
1. **Dado** una actividad con asistencia registrada días atrás, **cuando** cambio el estado de un deportista (ej. ABSENT → EXCUSED) o su nota, **entonces** el cambio persiste y `recorded_by`/`recorded_at` se actualizan al editor y momento actuales.
2. **Dado** el cambio guardado, **cuando** cualquier usuario consulta reportes, **entonces** los porcentajes reflejan el nuevo estado según la métrica canónica.
3. **Dado** un deportista sin registro en esa actividad, **cuando** le asigno un estado retroactivamente, **entonces** se crea el registro normal.

#### HU-ADM-13 — Ver reportes del grupo [P0]
**Como** administrador **quiero** ver estadísticas de asistencia del grupo **para** tomar decisiones deportivas y administrativas.
1. **Dado** el módulo de reportes, **cuando** selecciono un período (semana, mes, rango personalizado o temporada), **entonces** veo por deportista: convocadas, PRESENT, LATE, ABSENT, EXCUSED y el porcentaje canónico con 1 decimal.
2. **Dado** un deportista con 8 convocadas, 5 PRESENT, 1 LATE, 1 ABSENT y 1 EXCUSED en el período, **cuando** se calcula su porcentaje, **entonces** muestra 85.7% ((5+1)/(8-1)×100) y su indicador de puntualidad reporta 1 atraso.
3. **Dado** el filtro por tipo de actividad, **cuando** filtro por COMPETITION, **entonces** los cálculos consideran solo actividades de ese `activity_type_id`.

#### HU-ADM-14 — Configurar visibilidad de estadísticas [P0]
**Como** administrador **quiero** decidir si deportistas y apoderados ven las estadísticas agregadas del grupo **para** ajustar la transparencia a la cultura del club.
1. **Dado** la configuración del grupo, **cuando** la abro por primera vez, **entonces** `athletes_can_view_group_stats` y `guardians_can_view_group_stats` están en `false` (por defecto).
2. **Dado** que activo `athletes_can_view_group_stats`, **cuando** un ATHLETE del grupo abre reportes, **entonces** ve la tabla agregada (nombre + porcentaje y totales) de inmediato, sin necesidad de redeploy ni relogin.
3. **Dado** cualquier combinación de toggles, **cuando** un no-ADMIN consulta reportes, **entonces** nunca ve datos de contacto, fechas de nacimiento, notas individuales de terceros ni datos de apoderados de terceros (regla de visibilidad 5).

#### HU-ADM-15 — Gestionar integrantes [P0]
**Como** administrador **quiero** editar y desactivar integrantes **para** mantener la nómina del grupo al día.
1. **Dado** un perfil MANAGED de mi grupo, **cuando** edito sus datos básicos, **entonces** los cambios persisten (los perfiles ACTIVE solo los edita su dueño).
2. **Dado** un integrante que dejó el club, **cuando** desactivo su membership (`status = INACTIVE`), **entonces** deja de aparecer en listas de asistencia futuras pero su historial y sus registros previos se conservan en los reportes históricos.
3. **Dado** un integrante INACTIVE, **cuando** lo reactivo, **entonces** vuelve a las listas de asistencia sin perder su historial.

#### HU-ADM-16 — Convertir cuenta MANAGED en ACTIVE [P0]
**Como** administrador **quiero** invitar a un deportista gestionado a operar su propia cuenta **para** que gestione su acceso cuando corresponda.
1. **Dado** un perfil MANAGED con email registrado, **cuando** envío la invitación de activación, **entonces** el usuario recibe un enlace para crear contraseña y su `account_status` pasará a ACTIVE al completarlo, conservando todo su historial de asistencia.
2. **Dado** que el deportista es menor de edad, **cuando** se inicia la activación, **entonces** el sistema exige el consentimiento registrado de un apoderado vinculado antes de habilitar las credenciales (ver 11-legal-seguridad-privacidad.md).
3. **Dado** un perfil MANAGED sin email, **cuando** intento enviar la invitación, **entonces** el sistema me pide registrar primero un email único para ese usuario.

#### HU-ADM-17 — Exportar reportes a CSV [P1]
**Como** administrador **quiero** exportar los reportes a CSV **para** procesarlos fuera de Asisteam.
1. **Dado** un reporte con filtros aplicados (período y tipo), **cuando** presiono "Exportar CSV", **entonces** descargo un archivo UTF-8 con los mismos deportistas, columnas de totales por estado y porcentaje que muestra la pantalla.
2. **Dado** el archivo exportado, **cuando** lo abro, **entonces** las fechas aparecen en hora local America/Santiago con el formato `YYYY-MM-DD HH:mm`.

### 2.3 Deportista (HU-DEP)

#### HU-DEP-01 — Unirme a un grupo por código [P0]
**Como** deportista **quiero** unirme a un grupo con su código o enlace **para** incorporarme sin trámites del administrador.
1. **Dado** un `invite_code` válido, **cuando** lo ingreso siendo adulto con cuenta, **entonces** se crea mi membership `ATHLETE` con `status = ACTIVE` y veo el grupo de inmediato.
2. **Dado** que soy menor de 18 años según mi `birthdate`, **cuando** uso el código, **entonces** mi membership queda `PENDING` y veo el mensaje de que falta vínculo de apoderado y confirmación del ADMIN.
3. **Dado** un código inválido o regenerado, **cuando** lo ingreso, **entonces** recibo "Código no válido" sin conocer qué grupo era.

#### HU-DEP-02 — Ver actividades de mis grupos [P0]
**Como** deportista **quiero** ver el calendario de actividades **para** saber cuándo y dónde me toca asistir.
1. **Dado** que soy ATHLETE ACTIVE de un grupo, **cuando** abro actividades, **entonces** veo las próximas y pasadas del grupo con tipo (color), lugar y horario en hora local America/Santiago.
2. **Dado** que pertenezco a varios grupos, **cuando** miro mi agenda consolidada, **entonces** veo las actividades de todos mis grupos identificadas por grupo.
3. **Dado** un grupo donde no soy miembro, **cuando** intento ver sus actividades, **entonces** recibo 404 (anti-enumeración, 07-api-y-backend.md §7.3).

#### HU-DEP-03 — Ver mi historial de asistencia [P0]
**Como** deportista **quiero** revisar mi historial **para** saber cómo ha sido mi asistencia real.
1. **Dado** que tengo registros de asistencia, **cuando** abro mi historial en un grupo, **entonces** veo cada actividad con fecha, tipo, mi estado (Presente/Ausente/Atrasado/Justificado) y la nota de mi propio registro si existe.
2. **Dado** los filtros de período (semana, mes, rango, temporada), **cuando** aplico uno, **entonces** la lista y los totales se recalculan según el filtro.
3. **Dado** mi historial, **cuando** lo reviso, **entonces** nunca veo registros ni notas de otros deportistas.

#### HU-DEP-04 — Ver mi porcentaje de asistencia [P0]
**Como** deportista **quiero** ver mi porcentaje de asistencia **para** conocer mi compromiso con el grupo.
1. **Dado** mi historial en un período, **cuando** abro mis estadísticas, **entonces** veo el porcentaje canónico con 1 decimal y el desglose de PRESENT, LATE, ABSENT y EXCUSED.
2. **Dado** que tengo 10 convocadas con 2 EXCUSED, 7 PRESENT y 1 LATE, **cuando** se calcula, **entonces** el porcentaje muestra 100.0% ((7+1)/(10-2)×100) y mis atrasos se muestran aparte como indicador de puntualidad.
3. **Dado** que no tengo actividades convocadas en el período (denominador 0), **cuando** consulto, **entonces** veo "Sin actividades en el período" en lugar de un porcentaje.

#### HU-DEP-05 — Ver estadísticas del grupo (si el toggle está activo) [P0]
**Como** deportista **quiero** ver las estadísticas agregadas del grupo **para** compararme con mis compañeros cuando el club lo permite.
1. **Dado** `athletes_can_view_group_stats = true` en mi grupo, **cuando** abro reportes, **entonces** veo tabla/gráfico con nombre de cada integrante, su porcentaje de asistencia y totales del grupo.
2. **Dado** el toggle en `false`, **cuando** abro reportes, **entonces** solo veo mis propias estadísticas y la sección grupal no existe (tampoco vía API).
3. **Dado** el toggle en `true`, **cuando** veo la tabla grupal, **entonces** no aparecen emails, teléfonos, fechas de nacimiento ni notas de nadie: solo nombre + métricas.

#### HU-DEP-06 — Pertenecer a varios grupos [P0]
**Como** deportista **quiero** pertenecer a varios grupos a la vez **para** entrenar en más de un club o disciplina.
1. **Dado** que soy ATHLETE en los grupos A y B, **cuando** cambio de grupo activo, **entonces** el historial y el porcentaje mostrados corresponden solo al grupo seleccionado (cada membership calcula por separado).
2. **Dado** que soy ADMIN en un grupo y ATHLETE en otro, **cuando** navego entre ellos, **entonces** cada grupo me muestra únicamente las capacidades de mi rol en ese grupo.

#### HU-DEP-07 — Reclamar mi cuenta gestionada (MANAGED) [P0]
**Como** deportista con perfil gestionado **quiero** activar mi propia cuenta **para** administrar mi acceso y mis datos.
1. **Dado** que recibí la invitación de activación (HU-ADM-16), **cuando** abro el enlace y creo mi contraseña, **entonces** mi `account_status` pasa de MANAGED a ACTIVE y conservo memberships e historial completo de asistencia.
2. **Dado** que soy menor de edad, **cuando** intento activar la cuenta, **entonces** el flujo queda bloqueado hasta que un apoderado vinculado registre su consentimiento.
3. **Dado** que activé mi cuenta, **cuando** inicio sesión, **entonces** veo mi historial previo tomado por el ADMIN sin pérdida de datos.

#### HU-DEP-08 — Recibir recordatorio de actividad [P1]
**Como** deportista **quiero** recibir una notificación push antes de cada actividad **para** no olvidar asistir.
1. **Dado** que tengo la app instalada y notificaciones permitidas, **cuando** se acerca una actividad de un grupo donde soy ATHLETE ACTIVE, **entonces** recibo un push con título de la actividad, hora local y lugar.
2. **Dado** que toco la notificación, **cuando** la app abre, **entonces** aterrizo en el detalle de esa actividad.
3. **Dado** que desactivo las notificaciones en mis preferencias, **cuando** llegue el horario de envío, **entonces** no recibo el push.

### 2.4 Apoderado (HU-APO)

#### HU-APO-01 — Aceptar invitación como apoderado [P0]
**Como** apoderado invitado **quiero** aceptar la invitación del administrador **para** seguir la asistencia de mi pupilo.
1. **Dado** una invitación dirigida con rol GUARDIAN vigente, **cuando** abro el enlace y completo mi cuenta, **entonces** quedo con membership GUARDIAN ACTIVE en el grupo y con el vínculo de `guardianships` hacia mi pupilo.
2. **Dado** que intento entrar a un grupo con el `invite_code`, **cuando** lo uso, **entonces** el sistema no me incorpora como GUARDIAN: el código solo incorpora ATHLETE (incorporación canónica).
3. **Dado** que ya tenía cuenta por otro grupo, **cuando** acepto la invitación, **entonces** se reutiliza mi `users` existente y solo se agregan membership y vínculo.

#### HU-APO-02 — Ver mis pupilos [P0]
**Como** apoderado **quiero** ver la lista de mis pupilos **para** acceder rápido a la información de cada uno.
1. **Dado** que tengo vínculos en `guardianships`, **cuando** abro "Mis pupilos", **entonces** veo cada pupilo con su nombre, grupos donde es miembro y acceso a su perfil deportivo.
2. **Dado** un deportista no vinculado a mí, **cuando** intento acceder a su información, **entonces** recibo 404 aunque esté en el mismo grupo (el recurso no es visible para mí; anti-enumeración, 07-api-y-backend.md §7.3).
3. **Dado** que mi pupilo cumple 18 años, **cuando** ocurre el cumpleaños, **entonces** el vínculo pasa a inactivo y dejo de ver sus datos (regla de visibilidad 3; detalle en 02-roles-y-permisos.md).

#### HU-APO-03 — Ver historial de asistencia del pupilo [P0]
**Como** apoderado **quiero** revisar el historial de mi pupilo **para** acompañar su compromiso deportivo.
1. **Dado** un pupilo vinculado, **cuando** abro su historial en un grupo, **entonces** veo cada actividad con fecha, tipo y estado, más su porcentaje canónico por período (semana, mes, rango, temporada).
2. **Dado** el historial del pupilo, **cuando** lo consulto, **entonces** no veo registros ni notas de otros deportistas del grupo.

#### HU-APO-04 — Ver actividades del pupilo [P0]
**Como** apoderado **quiero** ver el calendario de actividades de mi pupilo **para** organizar traslados y horarios familiares.
1. **Dado** un pupilo vinculado y miembro de un grupo, **cuando** abro sus actividades, **entonces** veo las próximas y pasadas con tipo, lugar y hora local America/Santiago.
2. **Dado** que tengo dos pupilos en grupos distintos, **cuando** consulto la agenda, **entonces** puedo alternar entre pupilos y cada calendario muestra solo los grupos de ese pupilo.

#### HU-APO-05 — Ver estadísticas del grupo (si el toggle está activo) [P0]
**Como** apoderado **quiero** ver las estadísticas agregadas del grupo de mi pupilo **para** entender su asistencia en contexto.
1. **Dado** `guardians_can_view_group_stats = true` en el grupo del pupilo, **cuando** abro reportes, **entonces** veo la tabla agregada con nombre y porcentaje de cada integrante.
2. **Dado** ese toggle en `false` (aunque el de atletas esté en `true`), **cuando** abro reportes, **entonces** solo veo las estadísticas de mi pupilo: los toggles son independientes.
3. **Dado** la tabla agregada visible, **cuando** la reviso, **entonces** no expone contactos, fechas de nacimiento, notas ni apoderados de terceros.

#### HU-APO-06 — Recibir aviso de ausencia del pupilo [P1]
**Como** apoderado **quiero** recibir una notificación cuando mi pupilo falte **para** enterarme oportunamente.
1. **Dado** que tengo la app con notificaciones activas, **cuando** el ADMIN registra a mi pupilo como ABSENT en una actividad, **entonces** recibo un push con el nombre del pupilo, el grupo y la actividad.
2. **Dado** que el ADMIN corrige luego el estado a PRESENT o EXCUSED, **cuando** consulto el historial, **entonces** el dato queda corregido (el aviso no se "des-envía", pero el historial es la fuente de verdad).
3. **Dado** un estado LATE o EXCUSED, **cuando** se registra, **entonces** no se envía aviso de ausencia (solo ABSENT gatilla el push).

#### HU-APO-07 — Consentir la activación de la cuenta de mi pupilo [P0]
**Como** apoderado **quiero** autorizar que mi pupilo menor opere su propia cuenta **para** cumplir con la protección de datos de menores.
1. **Dado** que se inició la activación de la cuenta MANAGED de mi pupilo menor (HU-ADM-16/HU-DEP-07), **cuando** reviso la solicitud, **entonces** puedo aprobarla o rechazarla y la decisión queda registrada con timestamp (ver 11-legal-seguridad-privacidad.md).
2. **Dado** que rechazo la solicitud, **cuando** el pupilo abre el enlace de activación, **entonces** el flujo permanece bloqueado y el perfil sigue MANAGED.
3. **Dado** que apruebo, **cuando** el pupilo crea su contraseña, **entonces** la cuenta pasa a ACTIVE conservando historial y mi vínculo de apoderado se mantiene mientras sea menor.

## 3. Post-MVP ([P2])

#### HU-DEP-09 — Solicitar justificación de inasistencia [P2]
**Como** deportista **quiero** enviar una solicitud de justificación de una ausencia **para** que no penalice mi porcentaje si el motivo es válido.
1. **Dado** un registro ABSENT propio, **cuando** envío una solicitud con motivo y adjunto opcional, **entonces** queda en estado pendiente visible para el ADMIN.
2. **Dado** que el ADMIN la aprueba (HU-ADM-18), **cuando** consulto mi historial, **entonces** el estado pasa a EXCUSED y mi porcentaje se recalcula excluyéndola del denominador.

#### HU-ADM-18 — Aprobar o rechazar justificaciones [P2]
**Como** administrador **quiero** resolver las solicitudes de justificación **para** mantener registros de asistencia justos.
1. **Dado** solicitudes pendientes, **cuando** abro la bandeja de justificaciones, **entonces** veo deportista, actividad, motivo y adjuntos, con acciones aprobar/rechazar.
2. **Dado** que apruebo una solicitud, **cuando** se aplica, **entonces** el `attendance_record` pasa a EXCUSED conservando quién y cuándo resolvió; **dado** que la rechazo, el registro sigue ABSENT y el deportista ve el motivo del rechazo.

#### HU-ADM-19 — Tomar asistencia sin conexión (modo offline) [P2]
**Como** administrador **quiero** tomar asistencia sin internet **para** operar en recintos sin cobertura.
1. **Dado** que abro la app sin conexión con datos previamente sincronizados, **cuando** tomo asistencia de una actividad, **entonces** los registros se guardan localmente en cola de sincronización.
2. **Dado** que recupero conexión, **cuando** la app sincroniza, **entonces** los registros se suben preservando `recorded_at` original y los conflictos se resuelven a favor del registro más reciente, con aviso al ADMIN.

#### HU-ADM-20 — Delegar en un entrenador (rol COACH) [P2]
**Como** administrador **quiero** asignar el rol COACH con permisos limitados **para** delegar la toma de asistencia sin entregar la administración.
1. **Dado** un miembro del grupo, **cuando** le asigno rol COACH, **entonces** puede tomar y editar asistencia y ver reportes del grupo, pero no puede editar la configuración, invitar ni gestionar integrantes.
2. **Dado** un COACH, **cuando** intenta acceder a configuración del grupo o gestión de miembros, **entonces** recibe 403.

#### HU-ADM-21 — Gestionar pagos y cuotas [P2]
**Como** administrador **quiero** registrar cuotas y pagos de los integrantes **para** controlar la tesorería del grupo en la misma herramienta.
1. **Dado** un plan de cuotas definido (monto y periodicidad), **cuando** registro un pago de un integrante, **entonces** su estado de pago del período queda al día y se refleja en el panel de morosidad.
2. **Dado** integrantes con cuotas vencidas, **cuando** abro el reporte de pagos, **entonces** veo la lista de morosos con períodos adeudados y montos.

#### HU-ADM-22 — Publicar anuncios al grupo [P2]
**Como** administrador **quiero** publicar anuncios internos **para** comunicar información al grupo sin salir de Asisteam.
1. **Dado** que redacto un anuncio con título y cuerpo, **cuando** lo publico, **entonces** todos los miembros ACTIVE del grupo lo ven en su muro y reciben notificación push si la tienen habilitada.
2. **Dado** un anuncio publicado, **cuando** lo edito o elimino, **entonces** los cambios se reflejan para todos los miembros.

#### HU-DEP-10 — Registrar mi asistencia con QR [P2]
**Como** deportista **quiero** registrar mi llegada escaneando un QR de la actividad **para** agilizar la toma de asistencia.
1. **Dado** un QR vigente mostrado por el ADMIN para la actividad, **cuando** lo escaneo dentro de la ventana horaria configurada, **entonces** mi registro queda PRESENT (o LATE si llegué después del umbral definido por el grupo).
2. **Dado** un QR de una actividad de un grupo donde no soy ATHLETE ACTIVE, **cuando** lo escaneo, **entonces** el registro se rechaza.

#### HU-GEN-08 — Iniciar sesión con Google/Apple [P2]
**Como** usuario **quiero** autenticarme con mi cuenta Google o Apple **para** entrar sin recordar otra contraseña.
1. **Dado** que elijo "Continuar con Google" con un email ya registrado en `users`, **cuando** autorizo, **entonces** inicio sesión en la cuenta existente sin crear duplicados.
2. **Dado** un email nuevo, **cuando** completo el login social, **entonces** se crea la cuenta ACTIVE y sigo el onboarding estándar (HU-GEN-01, criterio 3).

## 4. Tabla resumen

| ID | Historia corta | Rol | Prioridad | Módulo (03-modulos-y-flujos.md) |
|---|---|---|---|---|
| HU-GEN-01 | Registro con email y contraseña | Transversal | [P0] | M1 Autenticación y registro |
| HU-GEN-02 | Inicio de sesión | Transversal | [P0] | M1 Autenticación y registro |
| HU-GEN-03 | Recuperación de contraseña | Transversal | [P0] | M1 Autenticación y registro |
| HU-GEN-04 | Perfil básico | Transversal | [P0] | M1 Autenticación y registro |
| HU-GEN-05 | Soporte multi-grupo | Transversal | [P0] | M2 Gestión de grupos |
| HU-GEN-06 | Aceptar invitación por email | Transversal | [P0] | M3 Gestión de integrantes |
| HU-GEN-07 | App móvil con funciones núcleo | Transversal | [P1] | Transversal (app móvil [P1], cruza M1–M9) |
| HU-ADM-01 | Crear grupo | ADMIN | [P0] | M2 Gestión de grupos |
| HU-ADM-02 | Configurar el grupo | ADMIN | [P0] | M2 Gestión de grupos |
| HU-ADM-03 | Invitar por código/enlace | ADMIN | [P0] | M3 Gestión de integrantes |
| HU-ADM-04 | Invitar por email con rol | ADMIN | [P0] | M3 Gestión de integrantes |
| HU-ADM-05 | Crear cuenta gestionada | ADMIN | [P0] | M3 Gestión de integrantes |
| HU-ADM-06 | Registrar y vincular apoderado | ADMIN | [P0] | M4 Gestión de apoderados |
| HU-ADM-07 | Aprobar membresías PENDING | ADMIN | [P0] | M3 Gestión de integrantes |
| HU-ADM-08 | Crear actividad simple | ADMIN | [P0] | M5 Gestión de actividades |
| HU-ADM-09 | Crear actividad recurrente semanal | ADMIN | [P0] | M5 Gestión de actividades |
| HU-ADM-10 | Crear tipo de actividad personalizado | ADMIN | [P0] | M5 Gestión de actividades |
| HU-ADM-11 | Tomar asistencia | ADMIN | [P0] | M6 Registro de asistencia |
| HU-ADM-12 | Editar asistencia posterior | ADMIN | [P0] | M6 Registro de asistencia |
| HU-ADM-13 | Ver reportes del grupo | ADMIN | [P0] | M8 Reportes y estadísticas |
| HU-ADM-14 | Configurar visibilidad de estadísticas | ADMIN | [P0] | M9 Configuración de privacidad/visibilidad |
| HU-ADM-15 | Gestionar integrantes | ADMIN | [P0] | M3 Gestión de integrantes |
| HU-ADM-16 | Convertir cuenta MANAGED en ACTIVE | ADMIN | [P0] | M1 Autenticación y registro |
| HU-ADM-17 | Exportar reportes a CSV | ADMIN | [P1] | M8 Reportes y estadísticas |
| HU-DEP-01 | Unirme a un grupo por código | ATHLETE | [P0] | M3 Gestión de integrantes |
| HU-DEP-02 | Ver actividades de mis grupos | ATHLETE | [P0] | M5 Gestión de actividades |
| HU-DEP-03 | Ver mi historial de asistencia | ATHLETE | [P0] | M7 Historial de asistencia |
| HU-DEP-04 | Ver mi porcentaje de asistencia | ATHLETE | [P0] | M8 Reportes y estadísticas |
| HU-DEP-05 | Ver estadísticas del grupo (toggle) | ATHLETE | [P0] | M8 Reportes y estadísticas |
| HU-DEP-06 | Pertenecer a varios grupos | ATHLETE | [P0] | M2 Gestión de grupos |
| HU-DEP-07 | Reclamar mi cuenta gestionada | ATHLETE | [P0] | M1 Autenticación y registro |
| HU-DEP-08 | Recibir recordatorio de actividad | ATHLETE | [P1] | M5 Gestión de actividades (función push [P1]) |
| HU-APO-01 | Aceptar invitación como apoderado | GUARDIAN | [P0] | M4 Gestión de apoderados |
| HU-APO-02 | Ver mis pupilos | GUARDIAN | [P0] | M4 Gestión de apoderados |
| HU-APO-03 | Ver historial del pupilo | GUARDIAN | [P0] | M7 Historial de asistencia |
| HU-APO-04 | Ver actividades del pupilo | GUARDIAN | [P0] | M5 Gestión de actividades |
| HU-APO-05 | Ver estadísticas del grupo (toggle) | GUARDIAN | [P0] | M8 Reportes y estadísticas |
| HU-APO-06 | Recibir aviso de ausencia del pupilo | GUARDIAN | [P1] | M6 Registro de asistencia (función push [P1]) |
| HU-APO-07 | Consentir activación de cuenta del pupilo | GUARDIAN | [P0] | M4 Gestión de apoderados |
| HU-DEP-09 | Solicitar justificación de inasistencia | ATHLETE | [P2] | M6 Registro de asistencia (extensión [P2]) |
| HU-ADM-18 | Aprobar o rechazar justificaciones | ADMIN | [P2] | M6 Registro de asistencia (extensión [P2]) |
| HU-ADM-19 | Tomar asistencia offline | ADMIN | [P2] | M6 Registro de asistencia (extensión [P2]) |
| HU-ADM-20 | Delegar en rol COACH | ADMIN | [P2] | M3 Gestión de integrantes (extensión [P2]) |
| HU-ADM-21 | Gestionar pagos y cuotas | ADMIN | [P2] | Extensión [P2]: pagos y cuotas (sin módulo en 03) |
| HU-ADM-22 | Publicar anuncios al grupo | ADMIN | [P2] | Extensión [P2]: anuncios y mensajería (sin módulo en 03) |
| HU-DEP-10 | Registrar asistencia con QR | ATHLETE | [P2] | M6 Registro de asistencia (extensión [P2]) |
| HU-GEN-08 | Login social Google/Apple | Transversal | [P2] | M1 Autenticación y registro (extensión [P2]) |

**Cobertura:** 7 transversales, 17 de ADMIN, 8 de ATHLETE y 7 de GUARDIAN en el MVP ([P0]+[P1]); 8 historias Post-MVP ([P2]). Las prioridades siguen el alcance canónico de 01-vision-y-alcance.md y el orden de entrega se detalla en 09-roadmap.md.
