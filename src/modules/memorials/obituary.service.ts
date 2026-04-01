import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { LiveObituaryStatus, MemorialRelationshipKind, PostStatus } from "@prisma/client";
import { ObituaryBlock } from "@/common/types/obituary-block.types";
import { PrismaService } from "@/prisma/prisma.service";
import { MemorialFollowService } from "./memorial-follow.service";

@Injectable()
export class ObituaryService {
  private readonly logger = new Logger(ObituaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue("obituary-generation")
    private readonly obituaryQueue: Queue,
    private readonly followService: MemorialFollowService,
  ) {}

  async getLiveObituary(memorialId: string, requestingUserId: string) {
    const relationship = await this.followService.getRelationship(
      requestingUserId,
      memorialId,
    );

    if (!relationship) {
      return { status: "unavailable" as const };
    }

    const relationshipKind = relationship.relationship as MemorialRelationshipKind;

    const obituary = await this.prisma.liveObituary.findUnique({
      where: { memorialId_relationshipKind: { memorialId, relationshipKind } },
    });

    if (!obituary) {
      await this.obituaryQueue
        .add("generate", { memorialId, relationshipKind })
        .catch((err) =>
          this.logger.error("Failed to enqueue obituary generation", err),
        );
      return { status: "pending" as const, memorialId, relationshipKind };
    }

    if (obituary.status === LiveObituaryStatus.EXCLUDED) {
      return { status: "unavailable" as const };
    }

    if (obituary.status === LiveObituaryStatus.PENDING) {
      return { status: "pending" as const, memorialId, relationshipKind };
    }

    return {
      status: "ready" as const,
      blocks: obituary.blocks as ObituaryBlock[],
      relationshipKind: obituary.relationshipKind,
      pecConfidence: obituary.pecConfidence,
      generatedAt: obituary.generatedAt,
      memoryCount: obituary.memoryCount,
    };
  }

  async triggerRegeneration(memorialId: string, requestingUserId: string): Promise<{ queued: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { entitlement: true },
    });

    if (user?.entitlement !== "memorial_lifetime") {
      throw new ForbiddenException("Obituary regeneration requires a lifetime membership");
    }

    const memorial = await this.prisma.memorial.findUnique({
      where: { id: memorialId },
      select: { id: true },
    });
    if (!memorial) throw new NotFoundException("Memorial not found");

    const relationship = await this.followService.getRelationship(requestingUserId, memorialId);
    if (!relationship) throw new ForbiddenException("You do not have access to this memorial");

    const contributingKinds = await this.prisma.memory.findMany({
      where: { memorialId, status: PostStatus.PUBLISHED },
      select: { relationship: true },
      distinct: ["relationship"],
    });

    await Promise.allSettled(
      contributingKinds.map((m) =>
        this.obituaryQueue.add("generate", {
          memorialId,
          relationshipKind: m.relationship as MemorialRelationshipKind,
        }),
      ),
    );

    await this.prisma.memorial.update({
      where: { id: memorialId },
      data: { pendingRegeneration: false },
    });

    this.logger.log(
      `Manual regen triggered for memorial ${memorialId} by user ${requestingUserId} (${contributingKinds.length} kind(s))`,
    );

    return { queued: contributingKinds.length };
  }
}
