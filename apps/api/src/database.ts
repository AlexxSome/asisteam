import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import { CONFIG, type RuntimeConfig } from './config.js';
import { SafeLogger } from './logger.js';

@Injectable()
export class Database implements OnApplicationShutdown {
  private readonly pool: pg.Pool;
  private draining = false;
  constructor(@Inject(CONFIG) config: RuntimeConfig, @Inject(SafeLogger) private readonly logger: SafeLogger) {
    this.pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: config.PG_POOL_MAX,
      connectionTimeoutMillis: config.PG_CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: 10000,
      statement_timeout: config.PG_STATEMENT_TIMEOUT_MS,
      query_timeout: config.PG_STATEMENT_TIMEOUT_MS,
      application_name: 'asisteam-api',
    });
    this.pool.on('error', () => this.logger.event('error', 'database_unavailable'));
  }
  async ready(): Promise<boolean> {
    if (this.draining) return false;
    try {
      await this.pool.query('SELECT 1');
      return !this.draining;
    } catch {
      return false;
    }
  }
  async onApplicationShutdown() {
    this.draining = true;
    await this.pool.end();
  }
}
