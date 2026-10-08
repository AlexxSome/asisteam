import { Inject, Injectable } from '@nestjs/common';
import { SafeLogger, TransactionalEmail, type EmailPayload } from '@asisteam/api/worker-services';
import { WorkerStore } from './store.js';
export function majorityText(audience: string, name: string) {
  if (audience === 'ATHLETE') return 'Cumpliste 18 años. Tus antiguos apoderados ya no tienen acceso a tus datos en Asisteam. Si tu cuenta aún es gestionada, pide al administrador que te invite a activar tus credenciales.';
  if (audience === 'GUARDIAN') return `${name} cumplió 18 años y dejó de aparecer entre tus pupilos. Ya no tienes acceso a su perfil, actividades, historial ni estadísticas como apoderado.`;
  return `${name} cumplió 18 años y mantiene una cuenta gestionada. Inicia la invitación para activar su cuenta propia desde la gestión de integrantes. Sus antiguos apoderados ya no tienen acceso a sus datos.`;
}
@Injectable()
export class MajorityWorker {
  constructor(@Inject(WorkerStore) private readonly store: WorkerStore, @Inject(TransactionalEmail) private readonly email: TransactionalEmail, @Inject(SafeLogger) private readonly logger: SafeLogger) {}
  async tick() {
    try {
      const [task] = await this.store.call('transition');
      if (task) await this.store.call('complete', [task.run_date, task.lease_token]);
      const [delivery] = await this.store.call('email');
      if (delivery) {
        let sent = false;
        try {
          const candidate = delivery.payload ?? this.email.payload(delivery.email, 'Mayoría de edad en Asisteam', majorityText(delivery.audience, delivery.full_name));
          const [prepared] = await this.store.call('payload', [delivery.delivery_id, delivery.claim_token, JSON.stringify(candidate)]);
          if (prepared?.payload) { await this.email.send(prepared.payload as EmailPayload, 'guardianship-majority-' + delivery.delivery_id); sent = true; }
        } catch { this.logger.event('warn', 'worker_failed'); }
        await this.store.call('finish', [delivery.delivery_id, delivery.claim_token, sent]);
      }
      const [result] = await this.store.call('metrics');
      const metrics = result?.metrics;
      if (metrics) this.logger.event(metrics.blocked > 0 || metrics.oldest_seconds > 600 || metrics.transition_overdue ? 'warn' : 'info', metrics.blocked > 0 || metrics.oldest_seconds > 600 || metrics.transition_overdue ? 'worker_backlog' : 'worker_tick', {
        pending: metrics.pending, blocked: metrics.blocked, retries: metrics.retries, oldest_seconds: metrics.oldest_seconds, transition_overdue: metrics.transition_overdue,
      });
    } catch { this.logger.event('error', 'worker_failed'); }
  }
}
