# Asisteam

Asisteam es una aplicación web y móvil para gestionar la asistencia de deportistas e integrantes en clubes, grupos o equipos deportivos.

La plataforma permite administrar equipos, integrantes, apoderados, actividades y registros de asistencia, entregando una solución simple para controlar la participación en entrenamientos, preparación física, competencias u otras actividades definidas por cada organización.

## Descripción

Asisteam nace para facilitar el control de asistencia en contextos deportivos donde participan administradores, deportistas e integrantes menores de edad asociados a apoderados.

Cada club, grupo o equipo puede crear sus propias actividades y registrar la asistencia de sus integrantes. Además, según la configuración definida por los administradores, los deportistas y apoderados pueden consultar estadísticas generales de asistencia del grupo.

## Objetivo del proyecto

El objetivo principal de Asisteam es centralizar y simplificar la gestión de asistencia deportiva, permitiendo a clubes y equipos llevar un historial claro, ordenado y accesible de la participación de sus integrantes.

## Funcionalidades principales

- Gestión de clubes, grupos o equipos.
- Registro de administradores.
- Registro de deportistas o integrantes.
- Registro de apoderados.
- Asociación de apoderados con deportistas menores de edad.
- Creación de actividades personalizadas.
- Registro de asistencia por actividad.
- Consulta de historial de asistencia individual.
- Visualización de asistencia general del grupo, si el administrador lo permite.
- Reportes mediante tablas, gráficos o resúmenes visuales.
- Configuración de permisos y visibilidad por grupo.

## Tipos de usuario

### Administrador

El administrador es el usuario encargado de gestionar el club, grupo o equipo.

Puede:

- Crear y configurar un grupo, club o equipo.
- Administrar integrantes.
- Registrar deportistas.
- Registrar apoderados.
- Asociar apoderados a deportistas menores de edad.
- Crear actividades.
- Tomar asistencia.
- Consultar reportes de asistencia.
- Definir si la asistencia general será visible para deportistas y apoderados.

### Deportista o integrante

El deportista o integrante es la persona que participa en las actividades del grupo, club o equipo.

Puede:

- Consultar sus actividades.
- Revisar su historial de asistencia.
- Ver estadísticas personales.
- Ver la asistencia general del grupo si el administrador lo permite.

Si el deportista es menor de edad, debe estar asociado a un apoderado.

### Apoderado

El apoderado es el usuario responsable de uno o más deportistas menores de edad.

Puede:

- Consultar la información de los deportistas asociados a su cuenta.
- Revisar la asistencia de sus deportistas.
- Ver actividades programadas.
- Ver la asistencia general del grupo si el administrador lo permite.

## Actividades soportadas

Asisteam permite registrar asistencia en distintos tipos de actividades, tales como:

- Entrenamientos.
- Preparación física.
- Competencias.
- Reuniones.
- Evaluaciones.
- Actividades personalizadas creadas por cada club, grupo o equipo.

## Módulos principales

### Autenticación

Permite el registro e inicio de sesión de usuarios, considerando distintos roles dentro de la plataforma.

### Gestión de grupos, clubes o equipos

Permite crear y administrar organizaciones deportivas dentro de la aplicación.

### Gestión de integrantes

Permite registrar, editar y administrar deportistas, apoderados y administradores asociados a un grupo.

### Gestión de actividades

Permite crear actividades para registrar asistencia, definiendo nombre, fecha, tipo de actividad y grupo asociado.

### Registro de asistencia

Permite marcar la asistencia de los deportistas o integrantes en cada actividad.

### Reportes y estadísticas

Permite visualizar información de asistencia mediante tablas, porcentajes, gráficos o resúmenes visuales.

### Configuración de visibilidad

Permite que los administradores definan si los deportistas y apoderados pueden ver la asistencia general del grupo.

## Modelo de datos inicial

Entidades principales sugeridas:

- Usuario
- Grupo / Club / Equipo
- Miembro
- Rol
- Deportista / Integrante
- Apoderado
- Actividad
- Asistencia
- Configuración del grupo

Relaciones principales:

- Un usuario puede pertenecer a uno o más grupos.
- Un grupo puede tener múltiples integrantes.
- Un integrante puede tener un rol dentro de cada grupo.
- Un deportista menor de edad puede estar asociado a uno o más apoderados.
- Un grupo puede tener múltiples actividades.
- Una actividad puede tener múltiples registros de asistencia.
- Cada registro de asistencia pertenece a un deportista o integrante.

## MVP

La primera versión del proyecto debería incluir:

- Registro e inicio de sesión.
- Creación de grupos, clubes o equipos.
- Gestión básica de integrantes.
- Roles de administrador, deportista y apoderado.
- Asociación de apoderados con deportistas menores de edad.
- Creación de actividades.
- Registro de asistencia.
- Historial de asistencia individual.
- Reporte básico de asistencia por grupo.
- Configuración para permitir u ocultar la asistencia general.

## Funcionalidades futuras

- Invitaciones por correo electrónico.
- Notificaciones push o email.
- Calendario de actividades.
- Exportación de reportes en PDF o Excel.
- Dashboard avanzado de estadísticas.
- Ranking de asistencia.
- Justificación de inasistencias.
- Confirmación previa de asistencia.
- Control de pagos o mensualidades.
- Gestión de múltiples sedes.
- Integración con calendarios externos.
- App móvil offline con sincronización posterior.

## Pantallas principales

### Administrador

- Inicio / Dashboard.
- Mis grupos, clubes o equipos.
- Detalle del grupo.
- Gestión de integrantes.
- Gestión de apoderados.
- Crear actividad.
- Listado de actividades.
- Registro de asistencia.
- Reportes de asistencia.
- Configuración de visibilidad.

### Deportista

- Inicio.
- Mis actividades.
- Mi asistencia.
- Historial personal.
- Reportes generales, si están habilitados.

### Apoderado

- Inicio.
- Deportistas asociados.
- Actividades del deportista.
- Asistencia del deportista.
- Reportes generales, si están habilitados.

## Reglas de negocio principales

- Solo los administradores pueden crear y configurar grupos.
- Solo los administradores pueden registrar asistencia.
- Los apoderados solo pueden estar asociados a deportistas menores de edad.
- Un deportista menor de edad debe tener al menos un apoderado asociado.
- La asistencia general del grupo solo será visible para deportistas y apoderados si el administrador lo permite.
- Cada actividad debe pertenecer a un grupo, club o equipo.
- Cada registro de asistencia debe estar asociado a una actividad y a un integrante.
- Un usuario puede tener distintos roles en distintos grupos.

## Seguridad y privacidad

El proyecto debe considerar medidas de seguridad para proteger los datos personales de los usuarios, especialmente cuando existan menores de edad.

Consideraciones importantes:

- Control de acceso basado en roles.
- Validación de permisos en backend.
- Protección de datos personales.
- Restricción de visibilidad según configuración del grupo.
- Manejo seguro de autenticación.
- Asociación controlada entre apoderados y menores de edad.
- Registro de acciones relevantes realizadas por administradores.

## Documentación

La documentación canónica del producto vive en [`docs/`](docs/) (11 documentos: visión, roles y permisos, módulos y flujos, modelo de datos, pantallas, arquitectura y stack, API y backend, reportes, roadmap, historias de usuario y marco legal). Los issues de este repositorio referencian esos documentos.

La guía para agentes de IA (Claude Code, Cursor, Copilot, etc.) está en [`AGENTS.md`](AGENTS.md): sintetiza stack, convenciones, conceptos canónicos y reglas de oro del proyecto.

| Decisión | Resumen |
|---|---|
| Web [P0] | Next.js 16 (React 19, TypeScript 5) + Tailwind CSS 4 + shadcn/ui |
| Móvil [P1] | Expo / React Native (mismo monorepo) |
| Backend | Supabase: PostgREST + RLS (lecturas); Edge Functions y RPC PL/pgSQL (escrituras con reglas de negocio) |
| Base de datos | PostgreSQL 17 multi-tenant por `group_id` |
| Monorepo | pnpm + Turborepo: `apps/web`, `packages/core`, `supabase/` |

## Estado del proyecto

Documentación completa (ver `docs/09-roadmap.md`); implementación de la Fase 1 — MVP Web [P0] en curso.

## Nombre del proyecto

Asisteam

## Descripción corta

Aplicación web y móvil para gestionar la asistencia de deportistas en clubes, grupos y equipos deportivos.

## Autor

Proyecto desarrollado por el equipo de Arc Velion.
