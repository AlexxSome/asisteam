export interface paths {
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login independiente con límite y respuesta genérica */
        post: operations["loginPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registro de perfil, credencial y aceptación transaccional */
        post: operations["registerPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/recovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Recovery de un uso y respuesta anti-enumeración */
        post: operations["requestRecovery"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Consumo y sustitución de contraseña atómicos */
        post: operations["resetPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Refresh rotatorio; replay revoca familia */
        post: operations["refreshSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoca familia actual y sus access tokens */
        post: operations["logoutSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Contraseña actual y revocación de todas las sesiones */
        post: operations["changePassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/check-in-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** ADMIN ACTIVE consulta horario QR del grupo */
        get: operations["getQrSettings"];
        /** ADMIN configura ventana/atraso mediante RPC canónica */
        put: operations["setQrSettings"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/activities/{activityId}/check-in-qr": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** ADMIN emite HMAC temporal; clave y reloj permanecen en SQL */
        post: operations["issueCheckinQr"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/check-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** ATHLETE ACTIVE registra solo llegada propia; conserva marca previa */
        post: operations["selfCheckin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/announcements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Muro por membresía ACTIVE; preferencias/dispositivos propios sin tokens */
        get: operations["getAnnouncements"];
        put?: never;
        /** ADMIN publica/encola atómicamente con UUID idempotente */
        post: operations["publishAnnouncement"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/announcements/{announcementId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** ADMIN elimina lógicamente con versión exacta */
        delete: operations["deleteAnnouncement"];
        options?: never;
        head?: never;
        /** ADMIN edita con versión exacta; no emite nuevo push */
        patch: operations["updateAnnouncement"];
        trace?: never;
    };
    "/api/v1/me/announcement-push": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Opt-in y existencia de dispositivos propios; default false */
        get: operations["getAnnouncementPush"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Preferencia explícita global del usuario; opt-out cancela pendientes */
        patch: operations["setAnnouncementPush"];
        trace?: never;
    };
    "/api/v1/me/announcement-push/tokens": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra Expo propio sin reasignar tokens activos ajenos */
        post: operations["registerAnnouncementToken"];
        /** Desregistra solo token propio antes del logout */
        delete: operations["unregisterAnnouncementToken"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/billing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ledger y capacidad ADMIN; DTO sin datos privados del proveedor */
        get: operations["getGroupBilling"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/billing/subscriptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Checkout, conciliación o cancelación; importe y cupos del servidor */
        post: operations["manageSubscription"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/activities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Agenda del grupo ACTIVE; página50, próximas/pasadas */
        get: operations["listGroupActivities"];
        put?: never;
        /** ADMIN: materializar actividad/serie mediante RPC canónica */
        post: operations["createActivity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/activities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Agenda de grupos ACTIVE seleccionados; 50 filas, próxima o pasada */
        get: operations["listActivities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/activities/home": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Próxima/en curso y anterior para inicio por grupos autorizados */
        get: operations["getHomeActivities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/activities/{activityId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detalle con columnas explícitas y 404 anti-enumeración */
        get: operations["getActivity"];
        put?: never;
        post?: never;
        /** ADMIN: preservar historial de serie; confirmación puntual adicional */
        delete: operations["deleteActivity"];
        options?: never;
        head?: never;
        /** ADMIN: puntual o futuras sin asistencia, sin reexpandir */
        patch: operations["updateActivity"];
        trace?: never;
    };
    "/api/v1/groups/{groupId}/activity-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tipos de sistema/grupo, página100 */
        get: operations["listActivityTypes"];
        put?: never;
        /** ADMIN: crear tipo personalizado */
        post: operations["createActivityType"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/activity-types/{typeId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** ADMIN: editar/desactivar propio, sistema inmutable */
        patch: operations["updateActivityType"];
        trace?: never;
    };
    "/api/v1/groups/{groupId}/activities/{activityId}/attendance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** ADMIN/COACH: nómina ATHLETE ACTIVE, página100; COACH recibe notas nulas */
        get: operations["getAttendanceRoster"];
        /** Lote atómico de1–500; upsert único y only_unmarked preserva marcas previas */
        put: operations["saveAttendance"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/activities/{activityId}/attendance/{membershipId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** ADMIN: desmarcado explícito por RPC canónica */
        delete: operations["clearAttendance"];
        options?: never;
        head?: never;
        /** Corrección parcial bajo bloqueo; COACH cambia solo estado */
        patch: operations["updateAttendance"];
        trace?: never;
    };
    "/api/v1/groups/{groupId}/memberships": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Nómina ADMIN; búsqueda literal y página de 50 con total */
        get: operations["listGroupMembers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/managed-members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Alta MANAGED por RPC; menor PENDING hasta ratificación */
        post: operations["createManagedMember"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/memberships/{membershipId}/managed-profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Perfil MANAGED ADMIN; corrección de mayoría requiere revisión */
        patch: operations["updateManagedMember"];
        trace?: never;
    };
    "/api/v1/groups/{groupId}/memberships/{membershipId}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aprobar PENDING mediante RPC; locks R1 y cupos */
        post: operations["approveMembership"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/memberships/{membershipId}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Rechazo lógico ADMIN; historia conservada */
        post: operations["rejectMembership"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/memberships/{membershipId}/deactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Baja ADMIN; último ADMIN y GUARDIAN con pupilos protegidos */
        post: operations["deactivateMembership"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/memberships/{membershipId}/reactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reactivar mediante RPC con R1/cupos/30 grupos */
        post: operations["reactivateMembership"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/memberships/{membershipId}/coach": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** COACH independiente; no altera ATHLETE */
        post: operations["assignMemberCoach"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/memberships/onboarding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Progreso propio, ADMIN o GUARDIAN autorizado; sin contacto/fecha/notas */
        get: operations["listMembershipOnboarding"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/memberships/{membershipId}/data-consents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ratificar consentimiento del pupilo; solo MANAGED se activa atómicamente */
        post: operations["consentMembershipData"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/guardianships": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Vínculo de menor ADMIN; membership GUARDIAN sin deducir consentimiento */
        post: operations["createGuardianship"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/guardianships/eligible-athletes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Menores elegibles ADMIN; búsqueda/página de 50 */
        get: operations["listGuardianshipAthletes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/memberships/pending-summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Total PENDING autorizado para inicio ADMIN */
        get: operations["getPendingSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/account-consents/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Aceptación actual propia; accesible antes del gate de consentimiento */
        get: operations["getCurrentAccountConsent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/account-consents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aceptación versionada append-only, accesible antes del gate */
        post: operations["acceptAccountTerms"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/wards": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Pupilos vigentes con grupos autorizados, sin contacto ni fecha; página 50 */
        get: operations["listMyWards"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/wards/{athleteUserId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Pupilo vigente; ajeno/adulto/revocado 404 */
        get: operations["getWard"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/invitations/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Emisión/reenvío/activación dirigida, 50/día/grupo y un ejecutor de correo */
        post: operations["sendInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/invitations/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Vista mínima por proxy autorizado; token solo en body */
        post: operations["previewInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/invitations/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aceptación dirigida de cuenta vigente, sin replay */
        post: operations["acceptInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/invitations/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registro por nonce y trigger Auth atómico */
        post: operations["registerInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/invitations/claim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Credenciales MANAGED preservando perfil/historia y consentimiento */
        post: operations["claimInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Historial ADMIN de diez filas sin digest ni datos del perfil */
        get: operations["listInvitations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/memberships/{membershipId}/activation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Solicitud ADMIN; no sustituye consentimiento del apoderado */
        post: operations["requestManagedActivation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/activation-requests/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Decisión del apoderado vigente; rechazo conserva historia */
        post: operations["reviewManagedActivation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/activation-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Solicitudes propias del apoderado por RPC, sin PII */
        get: operations["listManagedActivations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identidad del perfil verificada; sesión vigente y cuenta ACTIVE */
        get: operations["getSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Vida del proceso */
        get: operations["health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Disponibilidad de PostgreSQL */
        get: operations["ready"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Grupos con membresía ACTIVE; roles locales unidos, orden name/id */
        get: operations["listMyGroups"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detalle visible; código/settings solo ADMIN, grupo ajeno 404 */
        get: operations["getGroup"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Actualizar datos del grupo; ADMIN ACTIVE y RLS */
        patch: operations["updateGroup"];
        trace?: never;
    };
    "/api/v1/groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Crear grupo + ADMIN mediante create_group; actor de sesión */
        post: operations["createGroup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Toggles independientes mediante RPC */
        patch: operations["updateGroupSettings"];
        trace?: never;
    };
    "/api/v1/groups/{groupId}/invite-code/rotate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Regenerar código; ADMIN ACTIVE */
        post: operations["rotateInviteCode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/memberships/self": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** ADMIN se agrega como ATHLETE; RPC conserva R1 y cupos */
        post: operations["joinAsAthlete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/join": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingreso ATHLETE; menor PENDING y contador persistido */
        post: operations["joinByCode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/avatar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Imagen propia validada (2MiB); consentimiento SQL y bucket privado */
        post: operations["uploadAvatar"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/avatars/{ownerId}/{fileName}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Imagen autorizada por SQL sin URLs S3 ni claves nuevas; no-store */
        get: operations["getAvatar"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/profile-context": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Solicitud propia y permisos vigentes de imagen */
        get: operations["getProfileContext"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/birthdate-reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Correcciones de otros integrantes autorizadas por RPC */
        get: operations["listBirthdateReviews"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/birthdate-reviews/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revisión ADMIN por grupo; no autoaprobación */
        post: operations["reviewBirthdate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me/avatar-permissions/{guardianshipId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Apoderado vigente autoriza o retira imagen; historia conservada */
        patch: operations["setAvatarPermission"];
        trace?: never;
    };
    "/api/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Datos propios; no sirve para perfiles de terceros */
        get: operations["getOwnProfile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Editar perfil conservando revisión de birthdate y consentimiento */
        patch: operations["updateOwnProfile"];
        trace?: never;
    };
    "/api/v1/groups/{groupId}/me/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** V1: historial ATHLETE propio; identidad resuelta por SQL, período Chile y paginación */
        get: operations["getMyAttendanceHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/wards/{athleteUserId}/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** V2/V3: pupilo vigente; vínculo, edad y membresías reevaluados en SQL */
        get: operations["getWardAttendanceHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** ADMIN/COACH: agregados canónicos, inactivos opcionales y orden estable; sin PII ni notas */
        get: operations["getGroupAttendanceReport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/groups/{groupId}/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** V4/V5: toggles por rol evaluados en SQL; solo nombre/avatar y métricas agregadas */
        get: operations["getGroupStats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AuthLogin: {
            /** Format: email */
            email: string;
            password: string;
        };
        AuthRegister: {
            /** @enum {boolean} */
            terms_accepted: true;
            /** @enum {string} */
            terms_version: "2026-09-21";
            full_name: string;
            /** Format: email */
            email: string;
            birthdate: string;
            phone?: (unknown | string) | "";
            password: string;
        };
        AuthRecovery: {
            /** Format: email */
            email: string;
        };
        AuthReset: {
            token: string;
            password: string;
        };
        AuthPassword: {
            current_password: string;
            password: string;
        };
        AuthRefresh: {
            refresh_token: string;
        };
        AuthTokens: {
            access_token: string;
            refresh_token: string;
            /** @enum {number} */
            expires_in: 900;
        };
        AuthRecoveryResult: {
            /** @enum {string} */
            message: "Si el email existe, enviamos instrucciones";
        };
        CheckinActivityParams: {
            /** Format: uuid */
            activityId: string;
        };
        QrSettings: {
            opens_before_minutes: number;
            closes_after_minutes: number;
            late_after_minutes: number;
        };
        CheckinInput: {
            /** Format: uuid */
            activity_id: string;
            token: string;
        };
        CheckinQr: {
            /** Format: uuid */
            activity_id: string;
            token: string;
            /** Format: date-time */
            server_time: string;
            /** Format: date-time */
            expires_at: string;
        };
        CheckinReceipt: {
            /** Format: uuid */
            activity_id: string;
            /** Format: uuid */
            group_id: string;
            activity_title: string;
            /** @enum {string} */
            status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
            /** Format: date-time */
            recorded_at: string;
            created: boolean;
        };
        AnnouncementParams: {
            /** Format: uuid */
            groupId: string;
            /** Format: uuid */
            announcementId: string;
        };
        AnnouncementQuery: {
            /** @default 1 */
            page: number;
        };
        AnnouncementWall: {
            announcements: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                group_id: string;
                title: string;
                body: string;
                /** Format: date-time */
                created_at: string;
                /** Format: date-time */
                updated_at: string;
                total_count: number;
            }[];
            page: number;
            pushEnabled: boolean;
            hasDevices: boolean;
        };
        PublishAnnouncement: {
            title: string;
            body: string;
            /** Format: uuid */
            request_id: string;
        };
        UpdateAnnouncement: {
            title: string;
            body: string;
            /** Format: date-time */
            updated_at: string;
        };
        DeleteAnnouncement: {
            /** Format: date-time */
            updated_at: string;
        };
        AnnouncementPublished: {
            /** Format: uuid */
            id: string;
        };
        PushPreference: {
            enabled: boolean;
        };
        PushState: {
            enabled: boolean;
            hasDevices: boolean;
        };
        RegisterPushToken: {
            token: string;
            /** @enum {string} */
            platform: "IOS" | "ANDROID";
        };
        UnregisterPushToken: {
            token: string;
        };
        PushTokenRegistered: {
            /** Format: uuid */
            id: string;
        };
        BillingSummary: {
            plans: {
                /** @enum {string} */
                code: "TEAM" | "CLUB" | "ACADEMY";
                name: string;
                amount_clp: number;
                athlete_limit: number;
                /** @enum {string} */
                currency: "CLP";
            }[];
            active_athletes: number;
            athlete_limit: number | null;
            subscription: {
                /** Format: uuid */
                id: string;
                /** @enum {string} */
                plan_code: "TEAM" | "CLUB" | "ACADEMY";
                amount_clp: number;
                /** @enum {string} */
                status: "CREATING" | "PENDING" | "AUTHORIZED" | "PAUSED" | "CANCELLED" | "FAILED";
                next_payment_at: string | null;
                activated_at: string | null;
            } | null;
            invoices: {
                id: string;
                plan_name: string;
                due_at: string;
                amount_clp: number;
                /** @enum {string} */
                status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" | "REFUNDED";
                paid_at: string | null;
            }[];
            overdue_amount_clp: number;
            total_invoices: number;
            page: number;
        };
        BillingRequest: {
            /** @enum {string} */
            action: "checkout";
            /** Format: uuid */
            group_id: string;
            /** @enum {string} */
            plan_code: "TEAM" | "CLUB" | "ACADEMY";
            /** Format: email */
            payer_email: string;
        } | {
            /** @enum {string} */
            action: "sync";
            /** Format: uuid */
            group_id: string;
        } | {
            /** @enum {string} */
            action: "cancel";
            /** Format: uuid */
            group_id: string;
        };
        BillingQuery: {
            /** @default 1 */
            page: number;
        };
        BillingResult: {
            /** @enum {boolean} */
            success: true;
            checkout_url?: string;
        };
        ActivityParams: {
            /** Format: uuid */
            groupId: string;
            /** Format: uuid */
            activityId: string;
        };
        ActivityTypeParams: {
            /** Format: uuid */
            groupId: string;
            /** Format: uuid */
            typeId: string;
        };
        GroupActivityQuery: {
            /** @default 1 */
            page: number;
            /**
             * @default upcoming
             * @enum {string}
             */
            period: "upcoming" | "past";
        };
        ActivityQuery: {
            group_ids: string;
            /** @default 1 */
            page: number;
            /**
             * @default upcoming
             * @enum {string}
             */
            period: "upcoming" | "past";
        };
        ActivitySelection: {
            group_ids: string;
        };
        ActivityTypeQuery: {
            /** @default 1 */
            page: number;
            /** @default false */
            include_inactive: boolean;
        };
        Activity: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            group_id: string;
            /** Format: uuid */
            activity_type_id: string;
            title: string;
            description: string | null;
            location: string | null;
            /** Format: date-time */
            starts_at: string;
            /** Format: date-time */
            ends_at: string;
            activity_type_name: string;
            activity_type_color: string | null;
            is_system_type: boolean;
            recurrence_rule: {
                /** @enum {string} */
                freq: "WEEKLY";
                by_weekday: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[];
                until: string;
            } | null;
            /** Format: uuid */
            recurrence_source_id: string | null;
        };
        Activities: {
            activities: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                group_id: string;
                /** Format: uuid */
                activity_type_id: string;
                title: string;
                description: string | null;
                location: string | null;
                /** Format: date-time */
                starts_at: string;
                /** Format: date-time */
                ends_at: string;
                activity_type_name: string;
                activity_type_color: string | null;
                is_system_type: boolean;
                recurrence_rule: {
                    /** @enum {string} */
                    freq: "WEEKLY";
                    by_weekday: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[];
                    until: string;
                } | null;
                /** Format: uuid */
                recurrence_source_id: string | null;
            }[];
            hasNext: boolean;
        };
        HomeActivities: {
            next: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                group_id: string;
                /** Format: uuid */
                activity_type_id: string;
                title: string;
                description: string | null;
                location: string | null;
                /** Format: date-time */
                starts_at: string;
                /** Format: date-time */
                ends_at: string;
                activity_type_name: string;
                activity_type_color: string | null;
                is_system_type: boolean;
                recurrence_rule: {
                    /** @enum {string} */
                    freq: "WEEKLY";
                    by_weekday: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[];
                    until: string;
                } | null;
                /** Format: uuid */
                recurrence_source_id: string | null;
            } | null;
            previous: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                group_id: string;
                /** Format: uuid */
                activity_type_id: string;
                title: string;
                description: string | null;
                location: string | null;
                /** Format: date-time */
                starts_at: string;
                /** Format: date-time */
                ends_at: string;
                activity_type_name: string;
                activity_type_color: string | null;
                is_system_type: boolean;
                recurrence_rule: {
                    /** @enum {string} */
                    freq: "WEEKLY";
                    by_weekday: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[];
                    until: string;
                } | null;
                /** Format: uuid */
                recurrence_source_id: string | null;
            } | null;
            /** Format: date-time */
            now: string;
        };
        ActivityTypes: {
            data: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                group_id: string | null;
                name: string;
                color: string | null;
                is_active: boolean;
            }[];
            hasNext: boolean;
        };
        CreateActivity: {
            title: string;
            /** Format: uuid */
            activity_type_id: string;
            description: string;
            location: string;
            /** Format: date-time */
            starts_at: string;
            /** Format: date-time */
            ends_at: string;
            recurrence_rule?: {
                /** @enum {string} */
                freq: "WEEKLY";
                by_weekday: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[];
                until: string;
            } | null;
        };
        UpdateActivity: {
            title: string;
            /** Format: uuid */
            activity_type_id: string;
            description: string;
            location: string;
            /** Format: date-time */
            starts_at: string;
            /** Format: date-time */
            ends_at: string;
            /** @enum {string} */
            scope: "single" | "series";
        };
        DeleteActivity: {
            /** @enum {string} */
            scope: "single" | "series";
            confirm_attendance: boolean;
        };
        ActivityCreated: {
            /** Format: uuid */
            activityId: string;
        };
        ActivitiesAffected: {
            affected: number;
        };
        CreateActivityType: {
            name: string;
            color: string;
        };
        UpdateActivityType: {
            name: string;
            color: string;
            is_active: boolean;
        };
        ActivityTypeSaved: {
            /** Format: uuid */
            id: string;
        };
        AttendanceMemberParams: {
            /** Format: uuid */
            groupId: string;
            /** Format: uuid */
            activityId: string;
            /** Format: uuid */
            membershipId: string;
        };
        AttendanceQuery: {
            /** @default 1 */
            page: number;
        };
        AttendanceRoster: {
            roster: {
                /** Format: uuid */
                membership_id: string;
                full_name: string;
                avatar_url: string | null;
                /** @enum {string|null} */
                status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | null;
                note: string | null;
            }[];
            canEditNotes: boolean;
            hasNext: boolean;
        };
        SaveAttendance: {
            records: {
                /** Format: uuid */
                membership_id: string;
                /** @enum {string} */
                status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
                note?: string | null;
            }[];
            /** @default false */
            only_unmarked: boolean;
        };
        AttendanceSaved: {
            records: {
                /** Format: uuid */
                membership_id: string;
                /** @enum {string} */
                status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
                note?: string | null;
            }[];
        };
        UpdateAttendance: {
            /** @enum {string} */
            status?: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
            note?: string | null;
        };
        AttendanceCleared: {
            /** @enum {boolean} */
            cleared: true;
        };
        MemberParams: {
            /** Format: uuid */
            groupId: string;
            /** Format: uuid */
            membershipId: string;
        };
        MembershipParams: {
            /** Format: uuid */
            membershipId: string;
        };
        MemberQuery: {
            /** @enum {string} */
            role?: "ADMIN" | "ATHLETE" | "GUARDIAN" | "COACH";
            /** @enum {string} */
            status?: "INVITED" | "PENDING" | "ACTIVE" | "INACTIVE";
            search?: string;
            /** @default 1 */
            page: number;
        };
        Members: {
            data: {
                /** Format: uuid */
                membership_id: string;
                full_name: string;
                email: string | null;
                phone: string | null;
                birthdate: string | null;
                /** @enum {string} */
                account_status: "ACTIVE" | "INVITED" | "MANAGED";
                /** @enum {string} */
                role: "ADMIN" | "ATHLETE" | "GUARDIAN" | "COACH";
                /** @enum {string} */
                status: "INVITED" | "PENDING" | "ACTIVE" | "INACTIVE";
                total_count: number;
                /** Format: uuid */
                user_id: string;
                person_roles: {
                    /** @enum {string} */
                    role: "ADMIN" | "ATHLETE" | "GUARDIAN" | "COACH";
                    /** @enum {string} */
                    status: "INVITED" | "PENDING" | "ACTIVE" | "INACTIVE";
                }[];
                is_last_admin: boolean;
            }[];
            total: number;
        };
        ManagedMember: {
            full_name: string;
            birthdate: string;
            email: string;
            guardian?: {
                full_name: string;
                /** Format: email */
                email: string;
                relationship: string;
                /** @enum {boolean} */
                authorized: true;
            };
        };
        ManagedMemberCreated: {
            /** Format: uuid */
            membership_id: string;
            /** @enum {string} */
            membership_status: "ACTIVE" | "PENDING";
        };
        ManagedMemberEdit: {
            full_name: string;
            birthdate: string;
            email: string;
            phone: string | null;
        };
        ManagedMemberUpdated: {
            /** @enum {string} */
            status: "UPDATED" | "BIRTHDATE_PENDING";
        };
        OnboardingQuery: {
            /** Format: uuid */
            group_id?: string;
            /** Format: uuid */
            athlete_user_id?: string;
            /** Format: uuid */
            membership_id?: string;
            /** @default false */
            as_guardian: boolean;
            /** @default 1 */
            page: number;
        };
        Onboarding: {
            data: {
                /** Format: uuid */
                membership_id: string;
                /** Format: uuid */
                athlete_user_id: string;
                /** Format: uuid */
                group_id: string;
                group_name: string;
                full_name: string;
                /** @enum {string} */
                membership_status: "ACTIVE" | "PENDING";
                /** @enum {string} */
                account_status: "ACTIVE" | "INVITED" | "MANAGED";
                is_minor: boolean;
                guardian_linked: boolean;
                guardian_ready: boolean;
                requires_managed_consent: boolean;
                can_consent: boolean;
                relationship: string | null;
                /** @enum {string|null} */
                capacity_block: "subscription_athlete_limit" | "group_member_limit" | null;
                total_count: number;
            }[];
        };
        DataConsent: {
            /** @enum {boolean} */
            accepted: true;
        };
        DataConsented: {
            /** @enum {string} */
            status: "ACTIVE" | "PENDING";
        };
        Guardianship: {
            /** Format: uuid */
            athlete_user_id: string;
            full_name: string;
            /** Format: email */
            email: string;
            relationship: string;
        };
        GuardianshipCreated: {
            /** Format: uuid */
            guardianship_id: string;
        };
        EligibleAthletesQuery: {
            /** @default  */
            search: string;
            /** @default 1 */
            page: number;
        };
        EligibleAthletes: {
            data: {
                /** Format: uuid */
                user_id: string;
                full_name: string;
                total_count: number;
            }[];
        };
        PendingSummary: {
            total: number;
        };
        AccountConsent: {
            /** @enum {boolean} */
            terms_accepted: true;
            /** @enum {string} */
            terms_version: "2026-09-21";
        };
        CurrentAccountConsent: {
            accepted: boolean;
        };
        WardQuery: {
            /** @default 1 */
            page: number;
            /** Format: uuid */
            group_id?: string;
        };
        WardParams: {
            /** Format: uuid */
            athleteUserId: string;
        };
        Wards: {
            data: {
                /** Format: uuid */
                athlete_user_id: string;
                full_name: string;
                avatar_url: string | null;
                age: number;
                days_until_majority: number;
                groups: {
                    /** Format: uuid */
                    athlete_user_id: string;
                    /** Format: uuid */
                    group_id: string;
                    name: string;
                    sport: string | null;
                    /** @enum {string} */
                    membership_status: "ACTIVE" | "PENDING";
                }[];
            }[];
            has_next: boolean;
        };
        Ward: {
            /** Format: uuid */
            athlete_user_id: string;
            full_name: string;
            avatar_url: string | null;
            age: number;
            days_until_majority: number;
            groups: {
                /** Format: uuid */
                athlete_user_id: string;
                /** Format: uuid */
                group_id: string;
                name: string;
                sport: string | null;
                /** @enum {string} */
                membership_status: "ACTIVE" | "PENDING";
            }[];
        };
        InvitationSend: {
            /** Format: email */
            email: string;
            /** @enum {string} */
            role: "ATHLETE" | "GUARDIAN";
            /** @enum {string} */
            action: "send";
            /** Format: uuid */
            group_id: string;
        } | {
            /** @enum {string} */
            action: "resend";
            /** Format: uuid */
            group_id: string;
            /** Format: uuid */
            invitation_id: string;
        } | {
            /** @enum {string} */
            action: "activate";
            /** Format: uuid */
            group_id: string;
            /** Format: uuid */
            membership_id: string;
        };
        InvitationSent: {
            invitation: {
                /** Format: uuid */
                id: string;
                /** @enum {string} */
                status: "PENDING";
                /** Format: date-time */
                expires_at: string;
            };
        };
        InvitationToken: {
            token: string;
        };
        InvitationRegistration: {
            token: string;
            registration: {
                /** @enum {boolean} */
                terms_accepted: true;
                /** @enum {string} */
                terms_version: "2026-09-21";
                full_name: string;
                /** Format: email */
                email: string;
                birthdate: string;
                phone?: (unknown | string) | "";
                password: string;
            };
        };
        InvitationClaim: {
            token: string;
            registration: {
                /** Format: email */
                email: string;
                password: string;
                /** @enum {boolean} */
                terms_accepted: true;
                /** @enum {string} */
                terms_version: "2026-09-21";
            };
        };
        InvitationPreview: {
            group_name: string;
            /** @enum {string} */
            role: "ATHLETE" | "GUARDIAN";
            /** @enum {boolean} */
            managed_activation?: true;
        };
        InvitationAccepted: {
            /** Format: uuid */
            group_id: string;
            /** @enum {string} */
            membership_status: "ACTIVE" | "PENDING" | "INACTIVE" | "INVITED";
        };
        InvitationQuery: {
            /** @default 1 */
            page: number;
        };
        Invitations: {
            data: {
                /** Format: uuid */
                id: string;
                email: string | null;
                /** @enum {string} */
                role: "ATHLETE" | "GUARDIAN";
                /** @enum {string} */
                status: "PENDING" | "ACCEPTED" | "EXPIRED";
                /** Format: date-time */
                expires_at: string;
                /** Format: date-time */
                created_at: string;
            }[];
            total: number;
        };
        ActivationRequested: {
            /** @enum {string} */
            status: "READY" | "CONSENT_PENDING";
        };
        ActivationReview: {
            accepted: boolean;
        };
        ActivationReviewed: {
            /** Format: uuid */
            group_id: string;
            /** Format: uuid */
            membership_id: string;
        };
        ActivationQuery: {
            /** @default 1 */
            page: number;
            /** Format: uuid */
            athlete_user_id?: string;
        };
        Activations: {
            data: {
                /** Format: uuid */
                request_id: string;
                /** Format: uuid */
                membership_id: string;
                full_name: string;
                relationship: string;
                /** @enum {string} */
                status: "PENDING" | "APPROVED";
                total_count: number;
            }[];
        };
        Session: {
            /** Format: uuid */
            user_id: string;
        };
        Empty: Record<string, never>;
        PageQuery: {
            /** @default 1 */
            page: number;
            /** @default 50 */
            page_size: number;
        };
        GroupParams: {
            /** Format: uuid */
            groupId: string;
        };
        MyGroups: {
            data: {
                /** Format: uuid */
                id: string;
                name: string;
                sport: string | null;
                logo_url: string | null;
                roles: ("ADMIN" | "ATHLETE" | "GUARDIAN" | "COACH")[];
            }[];
            pagination: {
                page: number;
                page_size: number;
                total: number;
            };
        };
        GroupDetail: {
            /** Format: uuid */
            id: string;
            name: string;
            sport: string | null;
            logo_url: string | null;
            roles: ("ATHLETE" | "GUARDIAN" | "COACH")[];
            description: string | null;
            can_view_group_stats: boolean;
            /** @enum {string} */
            access: "member";
        } | {
            /** Format: uuid */
            id: string;
            name: string;
            sport: string | null;
            logo_url: string | null;
            roles: ("ADMIN" | "ATHLETE" | "GUARDIAN" | "COACH")[];
            description: string | null;
            can_view_group_stats: boolean;
            /** @enum {string} */
            access: "admin";
            invite_code: string;
            settings: {
                athletes_can_view_group_stats: boolean;
                guardians_can_view_group_stats: boolean;
            };
            /** Format: date-time */
            settings_updated_at: string | null;
            settings_updated_by_name: string | null;
        };
        CreateGroup: {
            name: string;
            sport: string;
            description?: string;
            logo_url?: string;
        };
        GroupCreated: {
            /** Format: uuid */
            group_id: string;
        };
        OwnProfile: {
            /** Format: uuid */
            id: string;
            full_name: string;
            email: string | null;
            phone: string | null;
            birthdate: string | null;
            avatar_url: string | null;
        };
        UpdateOwnProfile: {
            full_name: string;
            phone: string | null;
            birthdate: string | null;
        };
        ProfileUpdated: {
            profile: {
                /** Format: uuid */
                id: string;
                full_name: string;
                email: string | null;
                phone: string | null;
                birthdate: string | null;
                avatar_url: string | null;
            };
            birthdate_change_pending: boolean;
        };
        GroupSettingsChange: {
            athletes_can_view_group_stats?: boolean;
            guardians_can_view_group_stats?: boolean;
        };
        GroupSettings: {
            settings: {
                athletes_can_view_group_stats: boolean;
                guardians_can_view_group_stats: boolean;
            };
        };
        InviteCode: {
            code: string;
        };
        JoinByCode: {
            code: string;
        };
        JoinedGroup: {
            membership: {
                /** Format: uuid */
                group_id: string;
                /** @enum {string} */
                status: "ACTIVE" | "PENDING";
            };
        };
        Success: {
            /** @enum {boolean} */
            success: true;
        };
        ProfileContext: {
            avatar_allowed: boolean;
            has_admin_role: boolean;
            birthdate_request: {
                /** Format: uuid */
                id: string;
                requested_birthdate: string;
                /** @enum {string} */
                status: "PENDING" | "APPROVED" | "APPLIED" | "REJECTED" | "CANCELLED";
            } | null;
            avatar_permissions: {
                /** Format: uuid */
                guardianship_id: string;
                full_name: string;
                allows_avatar: boolean;
            }[];
        };
        BirthdateReviews: {
            data: {
                /** Format: uuid */
                request_id: string;
                /** Format: uuid */
                group_id: string;
                group_name: string;
                full_name: string;
                old_birthdate: string;
                requested_birthdate: string;
                approved: boolean;
            }[];
        };
        ReviewParams: {
            /** Format: uuid */
            requestId: string;
        };
        ReviewBirthdate: {
            /** Format: uuid */
            group_id: string;
            approve: boolean;
        };
        BirthdateReviewed: {
            /** @enum {string} */
            status: "PENDING" | "APPLIED" | "REJECTED";
        };
        AvatarParams: {
            /** Format: uuid */
            ownerId: string;
            fileName: string;
        };
        AvatarUpload: {
            /** @enum {string} */
            type: "image/jpeg" | "image/png" | "image/webp";
            content_base64: string;
        };
        AvatarDownload: {
            /** @enum {string} */
            type: "image/jpeg" | "image/png" | "image/webp";
            content_base64: string;
        };
        AvatarPermissionParams: {
            /** Format: uuid */
            guardianshipId: string;
        };
        AvatarPermissionChange: {
            allow: boolean;
        };
        ApiError: {
            error: {
                code: string;
                message: string;
                details: {
                    [key: string]: unknown;
                };
            };
        };
        Health: {
            /** @enum {string} */
            status: "ok";
        };
        Ready: {
            /** @enum {string} */
            status: "ready";
        };
        WardHistoryParams: {
            /** Format: uuid */
            groupId: string;
            /** Format: uuid */
            athleteUserId: string;
        };
        HistoryQuery: {
            /**
             * @default month
             * @enum {string}
             */
            period: "week" | "month" | "custom" | "season";
            /** Format: date */
            from?: string;
            /** Format: date */
            to?: string;
            /** @default  */
            activity_type_ids: string;
            /** @default 1 */
            page: number;
            /** @default 50 */
            page_size: number;
        };
        ReportQuery: {
            /**
             * @default month
             * @enum {string}
             */
            period: "week" | "month" | "custom" | "season";
            /** Format: date */
            from?: string;
            /** Format: date */
            to?: string;
            /** @default  */
            activity_type_ids: string;
            /** @default 1 */
            page: number;
            /** @default 50 */
            page_size: number;
            /** @default false */
            include_inactive: boolean;
            /**
             * @default attendance
             * @enum {string}
             */
            sort: "attendance" | "name";
        };
        StatsQuery: {
            /** @default 1 */
            page: number;
            /** @default 50 */
            page_size: number;
        };
        AttendanceHistory: {
            /** Format: uuid */
            group_id: string;
            /** Format: uuid */
            membership_id: string;
            full_name: string;
            period: {
                /** @enum {string} */
                type: "week" | "month" | "custom" | "season";
                from: string;
                to: string;
                /** @enum {string} */
                timezone: "America/Santiago";
            };
            totals: {
                convened: number;
                present: number;
                late: number;
                absent: number;
                excused: number;
                attendance_pct: number | null;
                late_rate: number | null;
            };
            records: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                activity_id: string;
                title: string;
                /** Format: date-time */
                starts_at: string;
                /** Format: uuid */
                activity_type_id: string;
                activity_type_name: string;
                activity_type_color: string;
                is_system_type: boolean;
                /** @enum {string} */
                status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
                note: string | null;
            }[];
            page: number;
            page_size: number;
        };
        GroupAttendanceReport: {
            /** Format: uuid */
            group_id: string;
            period: {
                /** @enum {string} */
                type: "week" | "month" | "custom" | "season";
                from: string;
                to: string;
                /** @enum {string} */
                timezone: "America/Santiago";
            };
            has_activities: boolean;
            totals: {
                convened: number;
                present: number;
                late: number;
                absent: number;
                excused: number;
                attendance_pct: number | null;
                late_rate: number | null;
                athletes: number;
                activities: number;
                average_attendance_pct: number | null;
                best_full_name: string | null;
            };
            by_athlete: {
                convened: number;
                present: number;
                late: number;
                absent: number;
                excused: number;
                attendance_pct: number | null;
                late_rate: number | null;
                /** Format: uuid */
                membership_id: string;
                full_name: string;
                /** @enum {string} */
                membership_status: "ACTIVE" | "INACTIVE";
            }[];
            by_activity_type: {
                convened: number;
                present: number;
                late: number;
                absent: number;
                excused: number;
                attendance_pct: number | null;
                late_rate: number | null;
                /** Format: uuid */
                activity_type_id: string;
                name: string;
                color: string;
                is_system: boolean;
                activities: number;
            }[];
            trend: {
                week_from: string;
                attendance_pct: number | null;
                convened: number;
            }[];
            page: number;
            page_size: number;
        };
        GroupStats: {
            /** Format: uuid */
            group_id: string;
            members: {
                convened: number;
                present: number;
                late: number;
                absent: number;
                excused: number;
                attendance_pct: number | null;
                late_rate: number | null;
                /** Format: uuid */
                membership_id: string;
                full_name: string;
                avatar_url: string | null;
            }[];
            totals: {
                convened: number;
                present: number;
                late: number;
                absent: number;
                excused: number;
                attendance_pct: number | null;
                late_rate: number | null;
                athletes: number;
            };
            page: number;
            page_size: number;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    loginPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthLogin"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthTokens"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    registerPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthRegister"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    requestRecovery: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthRecovery"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthRecoveryResult"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    resetPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthReset"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    refreshSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthRefresh"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthTokens"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    logoutSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    changePassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthPassword"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getQrSettings: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QrSettings"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    setQrSettings: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QrSettings"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QrSettings"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    issueCheckinQr: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                activityId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CheckinQr"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    selfCheckin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CheckinInput"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CheckinReceipt"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getAnnouncements: {
        parameters: {
            query?: {
                page?: number;
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnnouncementWall"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    publishAnnouncement: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PublishAnnouncement"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnnouncementPublished"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    deleteAnnouncement: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                announcementId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeleteAnnouncement"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    updateAnnouncement: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                announcementId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateAnnouncement"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getAnnouncementPush: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PushState"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    setAnnouncementPush: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PushPreference"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    registerAnnouncementToken: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterPushToken"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PushTokenRegistered"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    unregisterAnnouncementToken: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UnregisterPushToken"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getGroupBilling: {
        parameters: {
            query?: {
                page?: number;
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingSummary"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    manageSubscription: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BillingRequest"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingResult"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listGroupActivities: {
        parameters: {
            query?: {
                page?: number;
                period?: "upcoming" | "past";
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Activities"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    createActivity: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateActivity"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityCreated"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listActivities: {
        parameters: {
            query: {
                group_ids: string;
                page?: number;
                period?: "upcoming" | "past";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Activities"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getHomeActivities: {
        parameters: {
            query: {
                group_ids: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HomeActivities"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getActivity: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                activityId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Activity"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    deleteActivity: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                activityId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeleteActivity"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivitiesAffected"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    updateActivity: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                activityId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateActivity"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivitiesAffected"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listActivityTypes: {
        parameters: {
            query?: {
                page?: number;
                include_inactive?: boolean;
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityTypes"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    createActivityType: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateActivityType"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityTypeSaved"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    updateActivityType: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                typeId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateActivityType"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityTypeSaved"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getAttendanceRoster: {
        parameters: {
            query?: {
                page?: number;
            };
            header?: never;
            path: {
                groupId: string;
                activityId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceRoster"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    saveAttendance: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                activityId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SaveAttendance"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceSaved"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    clearAttendance: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                activityId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceCleared"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    updateAttendance: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                activityId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateAttendance"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceSaved"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listGroupMembers: {
        parameters: {
            query?: {
                role?: "ADMIN" | "ATHLETE" | "GUARDIAN" | "COACH";
                status?: "INVITED" | "PENDING" | "ACTIVE" | "INACTIVE";
                search?: string;
                page?: number;
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Members"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    createManagedMember: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ManagedMember"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ManagedMemberCreated"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    updateManagedMember: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ManagedMemberEdit"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ManagedMemberUpdated"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    approveMembership: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    rejectMembership: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    deactivateMembership: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    reactivateMembership: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    assignMemberCoach: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listMembershipOnboarding: {
        parameters: {
            query?: {
                group_id?: string;
                athlete_user_id?: string;
                membership_id?: string;
                as_guardian?: boolean;
                page?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Onboarding"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    consentMembershipData: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DataConsent"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DataConsented"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    createGuardianship: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Guardianship"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GuardianshipCreated"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listGuardianshipAthletes: {
        parameters: {
            query?: {
                search?: string;
                page?: number;
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EligibleAthletes"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getPendingSummary: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PendingSummary"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getCurrentAccountConsent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentAccountConsent"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    acceptAccountTerms: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountConsent"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listMyWards: {
        parameters: {
            query?: {
                page?: number;
                group_id?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Wards"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getWard: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                athleteUserId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Ward"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sendInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvitationSend"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationSent"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    previewInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvitationToken"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationPreview"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    acceptInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvitationToken"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationAccepted"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    registerInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvitationRegistration"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationAccepted"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    claimInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvitationClaim"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationAccepted"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listInvitations: {
        parameters: {
            query?: {
                page?: number;
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Invitations"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    requestManagedActivation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivationRequested"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    reviewManagedActivation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivationReview"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivationReviewed"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listManagedActivations: {
        parameters: {
            query?: {
                page?: number;
                athlete_user_id?: string;
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Activations"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Session"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    health: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Health"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    ready: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Ready"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listMyGroups: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyGroups"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getGroup: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupDetail"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    updateGroup: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateGroup"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    createGroup: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateGroup"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupCreated"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    updateGroupSettings: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupSettingsChange"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupSettings"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    rotateInviteCode: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InviteCode"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    joinAsAthlete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    joinByCode: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JoinByCode"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JoinedGroup"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    uploadAvatar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AvatarUpload"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getAvatar: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ownerId: string;
                fileName: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AvatarDownload"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getProfileContext: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileContext"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listBirthdateReviews: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BirthdateReviews"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    reviewBirthdate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReviewBirthdate"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BirthdateReviewed"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    setAvatarPermission: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                guardianshipId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AvatarPermissionChange"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Success"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getOwnProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OwnProfile"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    updateOwnProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateOwnProfile"];
            };
        };
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileUpdated"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getMyAttendanceHistory: {
        parameters: {
            query?: {
                period?: "week" | "month" | "custom" | "season";
                from?: string;
                to?: string;
                activity_type_ids?: string;
                page?: number;
                page_size?: number;
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceHistory"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getWardAttendanceHistory: {
        parameters: {
            query?: {
                period?: "week" | "month" | "custom" | "season";
                from?: string;
                to?: string;
                activity_type_ids?: string;
                page?: number;
                page_size?: number;
            };
            header?: never;
            path: {
                groupId: string;
                athleteUserId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceHistory"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getGroupAttendanceReport: {
        parameters: {
            query?: {
                period?: "week" | "month" | "custom" | "season";
                from?: string;
                to?: string;
                activity_type_ids?: string;
                page?: number;
                page_size?: number;
                include_inactive?: boolean;
                sort?: "attendance" | "name";
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupAttendanceReport"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getGroupStats: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
            };
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Respuesta válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupStats"];
                };
            };
            /** @description Error 400; sin SQL, tokens ni datos privados */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 401; sin SQL, tokens ni datos privados */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 403; sin SQL, tokens ni datos privados */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 404; sin SQL, tokens ni datos privados */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 409; sin SQL, tokens ni datos privados */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 410; sin SQL, tokens ni datos privados */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 422; sin SQL, tokens ni datos privados */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 429; sin SQL, tokens ni datos privados */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 500; sin SQL, tokens ni datos privados */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 503; sin SQL, tokens ni datos privados */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Error 504; sin SQL, tokens ni datos privados */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
}
