import { z } from 'zod';

const milliseconds = (fallback: number) => z.coerce.number().int().min(100).max(120_000).default(fallback);
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  DATABASE_URL: z.string().url().refine((value) => {
    try {
      const url = new URL(value);
      return ['postgres:', 'postgresql:'].includes(url.protocol) && !!url.hostname && !!url.pathname.slice(1);
    } catch { return false; }
  }),
  SUPABASE_AUTH_URL: z.string().url().optional(),
  SUPABASE_AUTH_PUBLIC_KEY: z.string().min(1).refine(value => {
    if (value.startsWith('sb_publishable_')) return true;
    try { return JSON.parse(Buffer.from(value.split('.')[1] ?? '', 'base64url').toString()).role === 'anon'; } catch { return false; }
  }).optional(),
  AUTH_TIMEOUT_MS: milliseconds(2000),
  BILLING_DATABASE_URL: z.string().url().optional(),
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  MERCADOPAGO_COLLECTOR_ID: z.string().regex(/^\d+$/).optional(),
  BILLING_WEB_URL: z.string().url().optional(),
  BILLING_WEBHOOK_URL: z.string().url().optional(),
  INVITATION_DATABASE_URL: z.string().url().optional(),
  INVITATION_PROXY_SECRET: z.string().min(32).optional(),
  INVITATION_AUTH_BRIDGE_SECRET: z.string().min(32).optional(),
  INVITATION_WEB_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  INVITATION_EMAIL_FROM: z.string().min(1).optional(),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  PG_CONNECT_TIMEOUT_MS: milliseconds(2000),
  PG_STATEMENT_TIMEOUT_MS: milliseconds(3000),
  HTTP_TIMEOUT_MS: milliseconds(5000),
  SHUTDOWN_TIMEOUT_MS: milliseconds(10000),
});
export type RuntimeConfig = z.infer<typeof configSchema>;
export const CONFIG = Symbol('runtime-config');

export class ConfigurationError extends Error {
  constructor(readonly fields: string[]) {
    super('La configuración de la API no es válida.');
  }
}
export function loadConfig(environment: NodeJS.ProcessEnv): RuntimeConfig {
  const parsed = configSchema.superRefine((value, ctx) => {
    if (!!value.SUPABASE_AUTH_URL !== !!value.SUPABASE_AUTH_PUBLIC_KEY) ctx.addIssue({ code: 'custom', path: ['SUPABASE_AUTH_URL'], message: 'Configura el emisor y la clave pública juntos.' });
    if (value.BILLING_DATABASE_URL) {
      const main = new URL(value.DATABASE_URL), billing = new URL(value.BILLING_DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(billing.protocol) || main.hostname !== billing.hostname || main.port !== billing.port || main.pathname !== billing.pathname) ctx.addIssue({code:'custom',path:['BILLING_DATABASE_URL'],message:'Las conexiones deben usar la misma base.'});
    }
    for (const field of ['BILLING_WEB_URL', 'BILLING_WEBHOOK_URL'] as const) {
      if (!value[field]) continue;
      const url = new URL(value[field]);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (field === 'BILLING_WEB_URL' && url.pathname !== '/')) ctx.addIssue({code:'custom',path:[field],message:'URL HTTPS inválida.'});
    }
    if (value.INVITATION_DATABASE_URL) {
      const main = new URL(value.DATABASE_URL), invitations = new URL(value.INVITATION_DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(invitations.protocol) || main.hostname !== invitations.hostname || main.port !== invitations.port || main.pathname !== invitations.pathname) ctx.addIssue({code:"custom",path:["INVITATION_DATABASE_URL"],message:"Las conexiones deben usar la misma base."});
    }
    if (value.SUPABASE_AUTH_URL) {
      let url: URL;
      try { url = new URL(value.SUPABASE_AUTH_URL); } catch { return; }
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/auth/v1' || (url.protocol !== 'https:' && !(value.NODE_ENV !== 'production' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) ctx.addIssue({ code: 'custom', path: ['SUPABASE_AUTH_URL'], message: 'Emisor inválido.' });
    }
  }).safeParse(environment);
  if (!parsed.success) throw new ConfigurationError([...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]);
  return parsed.data;
}
