import { Inject, Injectable } from '@nestjs/common';
import { runAnnouncementPush } from '@asisteam/core/runtime';
import { SafeLogger } from '@asisteam/api/worker-services';
import { WORKER_CONFIG, type WorkerConfig } from './config.js';
import { WorkerStore } from './store.js';
@Injectable()
export class AnnouncementWorker {
  constructor(@Inject(WorkerStore) private readonly store: WorkerStore, @Inject(WORKER_CONFIG) private readonly config: WorkerConfig, @Inject(SafeLogger) private readonly logger: SafeLogger) {}
  async tick() {
    try {
      const response = await runAnnouncementPush({ expoAccessToken: this.config.EXPO_ACCESS_TOKEN, client: { rpc: async (name, args) => {
        const rows = name === 'claim_announcement_push' ? await this.store.call('pushClaim', [args.p_receipts])
          : name === 'complete_announcement_push' ? await this.store.call('pushComplete', [args.p_delivery_id, args.p_claim_token, args.p_outcome, args.p_ticket_id])
          : await this.store.call('pushRun', [args.p_processed]);
        return { data: name === 'claim_announcement_push' ? rows : null, error: null };
      } } });
      const metrics = (await this.store.call('pushMetrics'))[0]?.metrics ?? {};
      // Only bounded aggregate counters; no queue rows, content, tokens or errors.
      this.logger.event(response.ok ? 'info' : 'error', response.ok ? (Number(metrics.failed ?? 0) > 0 || Number(metrics.oldest_seconds ?? 0) > 600 ? 'push_backlog' : 'push_tick') : 'push_failed', {
        pending: Number(metrics.pending ?? 0), failed: Number(metrics.failed ?? 0), oldest_seconds: Number(metrics.oldest_seconds ?? 0),
      });
    } catch { this.logger.event('error', 'push_failed'); }
  }
}
