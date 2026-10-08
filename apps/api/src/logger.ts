import type { LoggerService } from '@nestjs/common';

type Event = 'runtime_started' | 'runtime_stopped' | 'startup_failed' | 'configuration_invalid' | 'shutdown_timeout' | 'database_unavailable' | 'request_completed' | 'request_failed' | 'framework' | 'worker_tick' | 'worker_failed' | 'worker_backlog';
type Fields = { request_id?: string; status?: number; duration_ms?: number; fields?: string[]; pending?: number; blocked?: number; retries?: number; oldest_seconds?: number; transition_overdue?: boolean };

/** Allowlist only: never serialize request, URL, exception, SQL or configuration values. */
export class SafeLogger implements LoggerService {
  constructor(private readonly write: (line: string) => void = (line) => process.stdout.write(line + '\n')) {}
  event(level: 'info' | 'error' | 'warn', event: Event, fields: Fields = {}) {
    this.write(JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }));
  }
  log(..._args: unknown[]) { this.event('info', 'framework'); }
  error(..._args: unknown[]) { this.event('error', 'framework'); }
  warn(..._args: unknown[]) { this.event('warn', 'framework'); }
  debug(..._args: unknown[]) {}
  verbose(..._args: unknown[]) {}
  fatal(..._args: unknown[]) { this.event('error', 'framework'); }
}
