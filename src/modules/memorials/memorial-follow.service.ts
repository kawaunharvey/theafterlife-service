import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FollowTargetType } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { FollowMemorialDto } from "./dto/follow-memorial.dto";

@Injectable()
export class MemorialFollowService {
  constructor(private readonly prisma: PrismaService) {}

  async followMemorial(
    userId: string,
    memorialId: string,
    dto: FollowMemorialDto,
  ) {
    const memorial = await this.prisma.memorial.findUnique({
      where: { id: memorialId },
      select: { id: true, status: true },
    });

    if (!memorial) throw new NotFoundException("Memorial not found");
    if (memorial.status !== "ACTIVE")
      throw new ForbiddenException("Memorial is not active");

    const [follow, relationship] = await this.prisma.$transaction([
      this.prisma.follow.upsert({
        where: {
          userId_targetType_targetId: {
            userId,
            targetType: FollowTargetType.MEMORIAL,
            targetId: memorialId,
          },
        },
        create: {
          userId,
          targetType: FollowTargetType.MEMORIAL,
          targetId: memorialId,
          notifications: dto.notifications,
        },
        update: {
          notifications: dto.notifications,
        },
      }),
      this.prisma.memorialRelationship.upsert({
        where: { memorialId_userId: { memorialId, userId } },
        create: {
          memorialId,
          userId,
          relationship: dto.relationship,
          qualifier: dto.qualifier,
        },
        update: {
          relationship: dto.relationship,
          qualifier: dto.qualifier,
        },
      }),
    ]);

    return { followId: follow.id, relationshipId: relationship.id, relationship: relationship.relationship };
  }

  async unfollowMemorial(userId: string, memorialId: string) {
    const memorial = await this.prisma.memorial.findUnique({
      where: { id: memorialId },
      select: { ownerUserId: true },
    });

    if (memorial?.ownerUserId === userId) {
      throw new ForbiddenException("Memorial owners cannot unfollow their own memorial");
    }

    await this.prisma.$transaction([
      this.prisma.follow.deleteMany({
        where: {
          userId,
          targetType: FollowTargetType.MEMORIAL,
          targetId: memorialId,
        },
      }),
      this.prisma.memorialRelationship.deleteMany({
        where: { memorialId, userId },
      }),
    ]);
  }

  async isFollowing(userId: string, memorialId: string) {
    const relationship = await this.prisma.memorialRelationship.findUnique({
      where: { memorialId_userId: { memorialId, userId } },
      select: { relationship: true },
    });

    return {
      following: relationship !== null,
      relationship: relationship?.relationship ?? null,
    };
  }

  async getRelationship(userId: string, memorialId: string) {
    return this.prisma.memorialRelationship.findUnique({
      where: { memorialId_userId: { memorialId, userId } },
    });
  }
}
