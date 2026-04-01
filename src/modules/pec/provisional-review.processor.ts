import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Job, Queue } from 'bullmq';
import { ContextStoreService } from './context-store.service';
import { ValidationService } from './validation.service';

export const PEC_PROVISIONAL_REVIEW_QUEUE = 'pec-provisional-review';

export interface ProvisionalReviewJobData {
  entityId: string;
  entityType: 'provider' | 'memorial';
}

// ─────────────────────────────────────────────────────────────────────────────
// Processor
// Handles a single entity at a time so failures are isolated.
// ─────────────────────────────────────────────────────────────────────────────

@Processor(PEC_PROVISIONAL_REVIEW_QUEUE)
export class ProvisionalReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(ProvisionalReviewProcessor.name);

  constructor(
    private readonly contextStore: ContextStoreService,
    private readonly validation: ValidationService,
  ) {
    super();
  }

  async process(job: Job<ProvisionalReviewJobData>): Promise<void> {
    const { entityId, entityType } = job.data;

    this.logger.log(`Reviewing provisional entries for ${entityType}:${entityId}`);

    try {
      const [promoted, demoted, expired] = await Promise.all([
        this.contextStore.promoteCorroborated(entityId, entityType),
        this.contextStore.demoteContradicted(entityId, entityType),
        this.contextStore.expireStale(entityId, entityType),
      ]);

      this.logger.log(
        `${entityType}:${entityId} — promoted: ${promoted.length}, ` +
          `demoted: ${demoted.length}, expired: ${expired.length}`,
      );
    } catch (err) {
      this.logger.error(
        `Provisional review failed for ${entityType}:${entityId}`,
        err,
      );
      // Rethrow so BullMQ marks the job as failed and can retry
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler
// Runs nightly at 02:00 UTC.  Enqueues one job per entity that has
// outstanding provisional entries — does not process them inline.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ProvisionalReviewScheduler {
  private readonly logger = new Logger(ProvisionalReviewScheduler.name);

  constructor(
    private readonly contextStore: ContextStoreService,
    @InjectQueue(PEC_PROVISIONAL_REVIEW_QUEUE)
    private readonly queue: Queue<ProvisionalReviewJobData>,
  ) {}

  @Cron('0 2 * * *', { name: 'pec-provisional-review', timeZone: 'UTC' })
  async scheduleNightlyReview(): Promise<void> {
    this.logger.log('Enqueuing nightly provisional review jobs');

    try {
      const entities = await this.contextStore.findEntitiesWithProvisional();

      if (entities.length === 0) {
        this.logger.log('No provisional entries to review');
        return;
      }

      await Promise.all(
        entities.map((entity) =>
          this.queue.add(
            'review',
            entity,
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              removeOnComplete: { count: 100 },
              removeOnFail: { count: 50 },
            },
          ),
        ),
      );

      this.logger.log(`Enqueued ${entities.length} provisional review jobs`);
    } catch (err) {
      this.logger.error('Failed to enqueue provisional review jobs', err);
    }
  }
}
