import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EMAIL_CONFIG, TransactionalEmail, SafeLogger } from '@asisteam/api/worker-services';
import { WORKER_CONFIG, type WorkerConfig } from './config.js';
import { WorkerStore } from './store.js';
import { MajorityWorker } from './worker.js';
import { AnnouncementWorker } from './announcements.js';
export async function createWorker(config: WorkerConfig, logger = new SafeLogger()) {
  @Module({ providers: [AnnouncementWorker, WorkerStore, MajorityWorker, TransactionalEmail, { provide: WORKER_CONFIG, useValue: config }, { provide: EMAIL_CONFIG, useValue: { key: config.RESEND_API_KEY, from: config.INVITATION_EMAIL_FROM } }, { provide: SafeLogger, useValue: logger }] })
  class WorkerModule {}
  return NestFactory.createApplicationContext(WorkerModule, { logger, abortOnError: false });
}
