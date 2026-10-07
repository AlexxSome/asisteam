import { HttpException } from '@nestjs/common';
import { GUARDIANSHIP_ERROR_MESSAGES, MANAGED_MEMBER_ERROR_MESSAGES, MEMBER_MANAGEMENT_ERRORS, MEMBERSHIP_REVIEW_ERROR_MESSAGES, GROUP_ERROR_MESSAGES, SEND_INVITATION_ERROR_MESSAGES, invitationErrorMessages } from '@asisteam/core/runtime';

const memberMessages = { ...SEND_INVITATION_ERROR_MESSAGES, ...invitationErrorMessages, ...MEMBER_MANAGEMENT_ERRORS, ...MEMBERSHIP_REVIEW_ERROR_MESSAGES, ...MANAGED_MEMBER_ERROR_MESSAGES, ...GUARDIANSHIP_ERROR_MESSAGES, invalid_member_filters: 'Revisa los filtros de integrantes.' };
const profileMessages: Record<string, string> = {
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
