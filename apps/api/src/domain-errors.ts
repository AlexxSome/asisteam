import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { CHECKIN_ERROR_MESSAGES, ANNOUNCEMENT_ERROR_MESSAGES, BILLING_ERROR_MESSAGES, ATTENDANCE_ERROR_MESSAGES, ACTIVITY_ERROR_MESSAGES, ACTIVITY_TYPE_ERROR_MESSAGES, GUARDIANSHIP_ERROR_MESSAGES, MANAGED_MEMBER_ERROR_MESSAGES, MEMBER_MANAGEMENT_ERRORS, MEMBERSHIP_REVIEW_ERROR_MESSAGES, GROUP_ERROR_MESSAGES, SEND_INVITATION_ERROR_MESSAGES, invitationErrorMessages } from '@asisteam/core/runtime';

const memberMessages = { ...CHECKIN_ERROR_MESSAGES, ...ANNOUNCEMENT_ERROR_MESSAGES, ...BILLING_ERROR_MESSAGES, ...ATTENDANCE_ERROR_MESSAGES, ...ACTIVITY_ERROR_MESSAGES, ...ACTIVITY_TYPE_ERROR_MESSAGES, ...SEND_INVITATION_ERROR_MESSAGES, ...invitationErrorMessages, ...MEMBER_MANAGEMENT_ERRORS, ...MEMBERSHIP_REVIEW_ERROR_MESSAGES, ...MANAGED_MEMBER_ERROR_MESSAGES, ...GUARDIANSHIP_ERROR_MESSAGES, invalid_member_filters: 'Revisa los filtros de integrantes.' };
const profileMessages: Record<string, string> = {
  invalid_report_filters: 'Revisa el período y la página seleccionados.',
  invalid_report_activity_type: 'Selecciona tipos de actividad del grupo.',
  attendance_history_not_found: 'El historial no existe o no tienes acceso.',
  group_stats_disabled: 'Las estadísticas del grupo no están habilitadas para tu rol.',
  account_consent_required: 'Acepta las condiciones vigentes para continuar.',
  athlete_birthdate_required: 'La fecha de nacimiento es obligatoria para deportistas.',
  minor_requires_guardian_consent: 'Necesitas un apoderado y su consentimiento vigente.',
  avatar_consent_required: 'La imagen necesita consentimiento vigente del apoderado.',
  invalid_birthdate: 'Revisa la fecha de nacimiento.', invalid_phone: 'Revisa el teléfono.',
  invalid_birthdate_request: 'La solicitud de fecha no es válida.',
  birthdate_confirmation_not_required: 'Esta fecha no necesita revisión.',
  request_not_found: 'La solicitud no existe o no tienes acceso.',
  birthdate_request_stale: 'La solicitud cambió. Actualiza la página.',
  minor_consent_required: 'Necesitas consentimiento vigente para cambiar el permiso de imagen.',
  invalid_avatar_permission: 'El permiso de imagen ya no es válido.',
  invalid_decision: 'Revisa la decisión.', guardianship_not_found: 'El vínculo no existe o no tienes acceso.',
};
export class DomainException extends HttpException {
  readonly safeBody;
  constructor(status: number, code: string) {
    const message = profileMessages[code] ?? memberMessages[code as keyof typeof memberMessages] ?? GROUP_ERROR_MESSAGES[code];
    super(message ?? 'No pudimos procesar la solicitud.', message ? status : 500);
    this.safeBody = { error: { code: message ? code : 'internal_error', message: message ?? 'No pudimos procesar la solicitud.', details: {} } };
  }
}
/** Only exact known domain codes are returned. Never expose PostgreSQL diagnostics. */
export function domainSqlError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'PT503'
    && 'message' in error && error.message === 'identity_authority_frozen') throw new ServiceUnavailableException();
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    && (Object.hasOwn(profileMessages, error.message) || Object.hasOwn(memberMessages, error.message) || Object.hasOwn(GROUP_ERROR_MESSAGES, error.message))) {
    const sqlState = 'code' in error ? String(error.code) : '';
    const status = /^PT(400|401|403|404|409|422|429)$/.test(sqlState) ? Number(sqlState.slice(2))
      : sqlState === 'P0002' ? 404 : sqlState === '40001' || sqlState === '23505' ? 409
      : sqlState === '22023' ? 400 : 422;
    throw new DomainException(status, error.message);
  }
  throw error;
}
