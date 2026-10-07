import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { apiErrorResponseSchema } from '@asisteam/core/runtime';
import type { Response } from 'express';
import { DomainException } from './domain-errors.js';
import { SafeLogger } from './logger.js';

const messages: Record<number, [string, string]> = {
  400: ['invalid_request', 'Revisa los datos de la solicitud.'],
  401: ['authentication_required', 'Inicia sesión para continuar.'],
  403: ['permission_denied', 'No tienes permiso para realizar esta acción.'],
  404: ['resource_not_found', 'El recurso no existe o no tienes acceso.'],
  405: ['method_not_allowed', 'El método no está permitido.'],
  408: ['request_timeout', 'La solicitud excedió el tiempo permitido.'],
  410: ['invitation_expired', 'La invitación expiró. Solicita una nueva.'],
  409: ['state_conflict', 'La operación entra en conflicto con el estado actual.'],
  413: ['payload_too_large', 'La solicitud supera el tamaño permitido.'],
  422: ['business_rule_violation', 'No se cumplen las condiciones para realizar esta acción.'],
  429: ['rate_limited', 'Demasiadas solicitudes. Vuelve a intentarlo.'],
  503: ['service_unavailable', 'El servicio no está disponible. Vuelve a intentarlo.'],
  504: ['request_timeout', 'La solicitud excedió el tiempo permitido.'],
};
export function errorBody(status: number) {
  const [code, message] = messages[status] ?? ['internal_error', 'No pudimos procesar la solicitud.'];
  return apiErrorResponseSchema.parse({ error: { code, message, details: {} } });
}
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: SafeLogger) {}
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    const parserType = exception && typeof exception === 'object' && 'type' in exception ? exception.type : undefined;
    const status = exception instanceof HttpException ? exception.getStatus()
      : parserType === 'entity.too.large' ? 413 : parserType === 'entity.parse.failed' ? 400 : 500;
    this.logger.event('error', 'request_failed', { request_id: response.locals.requestId, status });
    response.status(status).json(exception instanceof DomainException ? exception.safeBody : errorBody(status));
  }
}
