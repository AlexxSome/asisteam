import { Inject, Injectable } from '@nestjs/common';
export const EMAIL_CONFIG = Symbol('email-config');
export type EmailConfig = { key?: string; from?: string };
export type EmailPayload = { from: string; to: string[]; subject: string; text: string };
@Injectable()
export class TransactionalEmail {
  constructor(@Inject(EMAIL_CONFIG) private readonly config: EmailConfig) {}
  payload(to: string, subject: string, text: string): EmailPayload {
    if (!this.config.key || !this.config.from) throw new Error('Correo no configurado.');
    return { from: this.config.from, to: [to], subject, text };
  }
  async send(payload: EmailPayload, idempotencyKey: string, timeoutMs = 10000): Promise<void> {
    if (!this.config.key) throw new Error('Correo no configurado.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { authorization: 'Bearer ' + this.config.key, 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
    });
    const receipt: unknown = response.ok ? await response.json() : null;
    if (!response.ok || !receipt || typeof receipt !== 'object' || !('id' in receipt) || typeof receipt.id !== 'string') throw new Error('Entrega no confirmada.');
  }
}
