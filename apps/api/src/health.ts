import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Database } from './database.js';

@Controller()
export class HealthController {
  constructor(@Inject(Database) private readonly database: Database) {}
  @Get('health') health() { return { status: 'ok' }; }
  @Get('ready') async ready() {
    if (!await this.database.ready()) throw new ServiceUnavailableException();
    return { status: 'ready' };
  }
}
