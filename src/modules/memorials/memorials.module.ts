import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "@/prisma/prisma.module";
import { PecModule } from "@/modules/pec/pec.module";
import { Env } from "@/config/env";
import { MemorialsController } from "./memorials.controller";
import { MemorialsService } from "./memorials.service";
import { MemorialFollowService } from "./memorial-follow.service";
import { MemoryService } from "./memory.service";
import { ObituaryService } from "./obituary.service";
import { ObituaryGeneratorProcessor } from "./obituary-generator.processor";
import { ArtifactContextProcessor } from "./artifact-context.processor";
import { MemoryDriftService } from "./memory-drift.service";
import { AnchorService } from "./anchor.service";
import { MarkerService } from "./marker.service";
import { ObituaryRegenScheduler } from "./obituary-regen.scheduler";

@Module({
  imports: [
    PrismaModule,
    PecModule,
    BullModule.registerQueueAsync({
      name: "obituary-generation",
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          url: config.get("REDIS_URL", { infer: true }),
          maxRetriesPerRequest: 2,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        },
      }),
    }),
    BullModule.registerQueueAsync({
      name: "artifact-context",
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          url: config.get("REDIS_URL", { infer: true }),
          maxRetriesPerRequest: 2,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        },
      }),
    }),
  ],
  controllers: [MemorialsController],
  providers: [
    MemorialsService,
    MemorialFollowService,
    MemoryService,
    ObituaryService,
    ObituaryGeneratorProcessor,
    ArtifactContextProcessor,
    MemoryDriftService,
    ObituaryRegenScheduler,
    AnchorService,
    MarkerService,
  ],
  exports: [MemorialsService, MemorialFollowService, MemoryService, ObituaryService, AnchorService],
})
export class MemorialsModule {}
