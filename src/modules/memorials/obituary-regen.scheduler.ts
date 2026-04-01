import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MemorialRelationshipKind, PostStatus } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

const DEBOUNCE_HOURS = 24;

@Injectable()
export class ObituaryRegenScheduler {
  private readonly logger = new Logger(ObituaryRegenScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue("obituary-generation")
    private readonly obituaryQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processDebounceQueue(): Promise<void> {
    const cutoff = new Date(Date.now() - DEBOUNCE_HOURS * 60 * 60 * 1000);

    const memorials = await this.prisma.memorial.findMany({
      where: {
        pendingRegeneration: true,
        lastMemoryAt: { lte: cutoff },
      },
      select: { id: true },
    });

    if (memorials.length === 0) return;

    this.logger.log(`Processing obituary regen debounce for ${memorials.length} memorial(s)`);

    for (const memorial of memorials) {
      const contributingKinds = await this.prisma.memory.findMany({
        where: { memorialId: memorial.id, status: PostStatus.PUBLISHED },
        select: { relationship: true },
        distinct: ["relationship"],
      });

      await Promise.allSettled(
        contributingKinds.map((m) =>
          this.obituaryQueue.add("generate", {
            memorialId: memorial.id,
            relationshipKind: m.relationship as MemorialRelationshipKind,
          }),
        ),
      );

      await this.prisma.memorial.update({
        where: { id: memorial.id },
        data: { pendingRegeneration: false },
      });

      this.logger.log(
        `Enqueued regen for memorial ${memorial.id} (${contributingKinds.length} relationship kind(s))`,
      );
    }
  }
}
