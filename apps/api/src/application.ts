import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import { CONFIG, type RuntimeConfig } from './config.js';
import { SessionController, SessionGuard, TokenVerifier } from './auth.js';
import { Database } from './database.js';
import { GroupsProfileController } from './groups-profile.js';
import { HealthController } from './health.js';
import { SafeLogger } from './logger.js';
import { errorBody, SafeExceptionFilter } from './errors.js';

export async function createApplication(config: RuntimeConfig, logger = new SafeLogger()) {
  @Module({
    controllers: [HealthController, SessionController, GroupsProfileController],
    providers: [{ provide: CONFIG, useValue: config }, { provide: SafeLogger, useValue: logger }, Database, TokenVerifier, SessionGuard],
  })
  class RuntimeModule {}
  const app = await NestFactory.create<NestExpressApplication>(RuntimeModule, { logger, abortOnError: false, bodyParser: false });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use((_request: unknown, response: import('express').Response, next: () => void) => {
    // Generate locally: arbitrary headers can contain PII, secrets or log injection.
    const requestId = randomUUID();
    const started = performance.now();
    response.locals.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    response.setHeader('cache-control', 'no-store');
    const timeout = setTimeout(() => {
      if (!response.headersSent) response.status(504).json(errorBody(504));
    }, config.HTTP_TIMEOUT_MS);
    timeout.unref();
    response.once('close', () => clearTimeout(timeout));
    response.once('finish', () => {
      clearTimeout(timeout);
      logger.event('info', 'request_completed', { request_id: requestId, status: response.statusCode, duration_ms: Math.round(performance.now() - started) });
    });
    next();
  });
  app.useBodyParser('json', { limit: '64kb' });
  app.useGlobalFilters(new SafeExceptionFilter(logger));
  const server: Server = app.getHttpServer();
  server.requestTimeout = config.HTTP_TIMEOUT_MS;
  server.headersTimeout = config.HTTP_TIMEOUT_MS;
  server.keepAliveTimeout = 5000;
  return app;
}
