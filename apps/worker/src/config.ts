import { z } from 'zod';
export const WORKER_CONFIG = Symbol('worker-config');
const schema = z.object({
  DATABASE_URL: z.string().url().refine(value => { try { const url = new URL(value); return ['postgres:', 'postgresql:'].includes(url.protocol) && !!url.hostname && !!url.pathname.slice(1); } catch { return false; } }),
  RESEND_API_KEY: z.string().min(1).optional(), INVITATION_EMAIL_FROM: z.string().min(1).optional(),
  POLL_MS: z.coerce.number().int().min(1000).max(60000).default(1000),
});
export type WorkerConfig = z.infer<typeof schema>;
export function loadConfig(environment: NodeJS.ProcessEnv): WorkerConfig {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) throw new Error('Configuración del worker inválida.');
  return parsed.data;
}
