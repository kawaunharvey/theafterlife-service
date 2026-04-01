import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '@/prisma/prisma.module';
import { Env } from '@/config/env';
import { ValidationService } from './validation.service';
import { ContextStoreService } from './context-store.service';
import { TaxonomyValidatorService } from './taxonomy-validator.service';
import { BlueprintValidatorService } from './blueprint-validator.service';
import {
  ProvisionalReviewProcessor,
  ProvisionalReviewScheduler,
  PEC_PROVISIONAL_REVIEW_QUEUE,
} from './provisional-review.processor';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueueAsync({
      name: PEC_PROVISIONAL_REVIEW_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          url: config.get('REDIS_URL', { infer: true }),
          maxRetriesPerRequest: 2,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      }),
    }),
  ],
  providers: [
    ValidationService,
    ContextStoreService,
    TaxonomyValidatorService,
    BlueprintValidatorService,
    ProvisionalReviewProcessor,
    ProvisionalReviewScheduler,
  ],
  exports: [
    ValidationService,
    ContextStoreService,
    TaxonomyValidatorService,
    BlueprintValidatorService,
  ],
})
export class PecModule {}
