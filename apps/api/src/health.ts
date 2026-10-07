import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Database } from './database.js';
import { httpSchemas } from '@asisteam/core/runtime';

@Controller()
export class HealthController {
  constructor(@Inject(Database) private readonly database: Database) {}
  @Get(['health', 'api/v1/health']) health() { return httpSchemas.Health.parse({ status: 'ok' }); }
  @Get(['ready', 'api/v1/ready']) async ready() {
    if (!await this.database.ready()) throw new ServiceUnavailableException();
    return httpSchemas.Ready.parse({ status: 'ready' });
  }
}
