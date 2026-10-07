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
  const parsed = configSchema.safeParse(environment);
  if (!parsed.success) throw new ConfigurationError([...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]);
  return parsed.data;
}
