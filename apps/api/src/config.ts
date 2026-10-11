import { z } from 'zod';
import { isIP } from 'node:net';

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
  S3_LOCAL_POLICY_ONLY: z.literal('1').optional(),
  S3_AVATAR_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).optional(),
  S3_REGION: z.string().min(1).default('sa-east-1'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  OAUTH_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  OAUTH_APPLE_CLIENT_ID: z.string().min(1).optional(),
  OAUTH_APPLE_CLIENT_SECRET: z.string().min(1).optional(),
  NATIVE_AUTH_DATABASE_URL: z.string().url().optional(),
  NATIVE_AUTH_SECRET: z.string().min(32).optional(),
  NATIVE_AUTH_ISSUER: z.string().url().optional(),
  NATIVE_AUTH_WEB_URL: z.string().url().optional(),
  NATIVE_AUTH_PROXY_SECRET: z.string().min(32).optional(),
  WEB_AUTH_ENABLED: z.literal('1').optional(),
  // Exact socket peers, never a client-controlled X-Forwarded-For chain.
  WEB_TRUSTED_PROXY_IPS: z.string().refine(value=>!value||value.split(',').every(ip=>!!isIP(ip.trim()))).default(''),
  AUTH_TIMEOUT_MS: milliseconds(2000),
  BILLING_DATABASE_URL: z.string().url().optional(),
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  MERCADOPAGO_COLLECTOR_ID: z.string().regex(/^\d+$/).optional(),
  BILLING_WEB_URL: z.string().url().optional(),
  BILLING_WEBHOOK_URL: z.string().url().optional(),
  INVITATION_DATABASE_URL: z.string().url().optional(),
  INVITATION_PROXY_SECRET: z.string().min(32).optional(),
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
  const retired = ['SUPABASE_AUTH_URL', 'SUPABASE_AUTH_PUBLIC_KEY', 'INVITATION_AUTH_BRIDGE_SECRET'];
  const configured = retired.filter(name => environment[name]);
  if (configured.length) throw new ConfigurationError(configured);
  const parsed = configSchema.superRefine((value, ctx) => {
    for (const provider of ['GOOGLE','APPLE'] as const) {
      const id=value[`OAUTH_${provider}_CLIENT_ID`],secret=value[`OAUTH_${provider}_CLIENT_SECRET`];
      if (!!id !== !!secret || id && !value.NATIVE_AUTH_SECRET) ctx.addIssue({code:'custom',path:[`OAUTH_${provider}_CLIENT_ID`],message:'OAuth requiere cliente y Auth propio completos.'});
      if (provider==='APPLE' && id && !value.NATIVE_AUTH_WEB_URL?.startsWith('https://')) ctx.addIssue({code:'custom',path:['OAUTH_APPLE_CLIENT_ID'],message:'Apple requiere retorno HTTPS.'});
    }
    const native = [value.NATIVE_AUTH_DATABASE_URL,value.NATIVE_AUTH_SECRET,value.NATIVE_AUTH_ISSUER,value.NATIVE_AUTH_WEB_URL,value.NATIVE_AUTH_PROXY_SECRET];
    if(value.WEB_AUTH_ENABLED&&!native.every(Boolean))ctx.addIssue({code:'custom',path:['WEB_AUTH_ENABLED'],message:'La fachada web requiere Auth completo.'});
    if (value.NODE_ENV === 'production' && !native.every(Boolean)) ctx.addIssue({code:'custom',path:['NATIVE_AUTH_SECRET'],message:'Producción requiere identidad propia completa.'});
    if (native.some(Boolean) && !native.every(Boolean)) ctx.addIssue({code:'custom',path:['NATIVE_AUTH_SECRET'],message:'Configura Auth independiente completo.'});
    if (value.NATIVE_AUTH_DATABASE_URL) {
      const a=new URL(value.DATABASE_URL),b=new URL(value.NATIVE_AUTH_DATABASE_URL);
      if (!['postgres:','postgresql:'].includes(b.protocol) || a.hostname!==b.hostname || a.port!==b.port || a.pathname!==b.pathname) ctx.addIssue({code:'custom',path:['NATIVE_AUTH_DATABASE_URL'],message:'Misma base requerida.'});
    }
    for (const field of ['NATIVE_AUTH_ISSUER','NATIVE_AUTH_WEB_URL'] as const) {
      if (!value[field]) continue;
      const url=new URL(value[field]);
      if (url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||value.NODE_ENV!=='production'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))) ctx.addIssue({code:'custom',path:[field],message:'Origen inválido.'});
    }
    if (!!value.S3_ACCESS_KEY_ID !== !!value.S3_SECRET_ACCESS_KEY) ctx.addIssue({code:'custom',path:['S3_ACCESS_KEY_ID'],message:'Configura las credenciales juntas.'});
    if(value.S3_LOCAL_POLICY_ONLY && (value.NODE_ENV === 'production' || !value.S3_ENDPOINT || !['127.0.0.1','localhost'].includes(new URL(value.S3_ENDPOINT).hostname))) ctx.addIssue({code:'custom',path:['S3_LOCAL_POLICY_ONLY'],message:'Solo admite un fixture local sin ACL.'});
    if (value.S3_ENDPOINT) {
      const url = new URL(value.S3_ENDPOINT);
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !(url.protocol === 'https:' || value.NODE_ENV !== 'production' && url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname))) ctx.addIssue({code:'custom',path:['S3_ENDPOINT'],message:'Endpoint inválido.'});
    }
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

  }).safeParse(environment);
  if (!parsed.success) throw new ConfigurationError([...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]);
  return parsed.data;
}
