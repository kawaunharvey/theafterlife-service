import { Injectable } from "@nestjs/common";
import { FollowTargetType, PostStatus, Visibility } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

const MEMORY_INCLUDE = {
  memorial: {
    select: {
      id: true,
      displayName: true,
      salutation: true,
      coverAssetUrl: true,
      theme: true,
      yearOfBirth: true,
      yearOfPassing: true,
    },
  },
  author: {
    select: {
      id: true,
      name: true,
      handle: true,
      imageUrl: true,
    },
  },
} as const;

const NEARBY_RADIUS_METERS = 50_000; // 50km for feed context

function toFeedEntry(memory: any) {
  return {
    id: memory.id,
    publishedAt: memory.publishedAt,
    score: 0,
    reasons: [] as string[],
    post: memory,
  };
}

@Injectable()
export class FeedsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMemorialFeed(
    memorialId: string,
    offset: number,
    limit: number,
    excludeMemoryId?: string,
  ) {
    const where: any = {
      memorialId,
      status: PostStatus.PUBLISHED,
      visibility: Visibility.PUBLIC,
    };
    if (excludeMemoryId) {
      where.id = { not: excludeMemoryId };
    }

    const memories = await this.prisma.memory.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: offset,
      take: limit + 1,
      include: MEMORY_INCLUDE,
    });

    const hasMore = memories.length > limit;
    const page = memories.slice(0, limit);

    return {
      entries: page.map(toFeedEntry),
      hasMore,
      cursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getFollowingFeed(userId: string, offset: number, limit: number) {
    const follows = await this.prisma.follow.findMany({
      where: { userId, targetType: FollowTargetType.MEMORIAL },
      select: { targetId: true },
    });

    if (follows.length === 0) {
      return { entries: [], hasMore: false, cursor: null };
    }

    const memorialIds = follows.map((f) => f.targetId);

    const memories = await this.prisma.memory.findMany({
      where: {
        memorialId: { in: memorialIds },
        status: PostStatus.PUBLISHED,
        visibility: Visibility.PUBLIC,
      },
      orderBy: { publishedAt: "desc" },
      skip: offset,
      take: limit + 1,
      include: MEMORY_INCLUDE,
    });

    const hasMore = memories.length > limit;
    const page = memories.slice(0, limit);

    return {
      entries: page.map(toFeedEntry),
      hasMore,
      cursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getNearbyFeed(
    userId: string,
    lat: number,
    lng: number,
    offset: number,
    limit: number,
  ) {
    // Find memorials the user already follows (to exclude from nearby)
    const follows = await this.prisma.follow.findMany({
      where: { userId, targetType: FollowTargetType.MEMORIAL },
      select: { targetId: true },
    });
    const followedIds = follows.map((f) => f.targetId);

    // Find memorial IDs within 50km using geo query
    const radiusRadians = NEARBY_RADIUS_METERS / 6378100;
    const nearbyRaw = (await this.prisma.memorial.findRaw({
      filter: {
        status: "ACTIVE",
        "point.coordinates": {
          $geoWithin: { $centerSphere: [[lng, lat], radiusRadians] },
        },
        ...(followedIds.length > 0
          ? { _id: { $nin: followedIds.map((id) => ({ $oid: id })) } }
          : {}),
      },
      options: { projection: { _id: 1 } },
    })) as unknown as Array<{ _id: { $oid: string } | string }>;

    const nearbyMemorialIds = nearbyRaw.map((m) =>
      typeof m._id === "string" ? m._id : (m._id as any).$oid,
    );

    if (nearbyMemorialIds.length === 0) {
      return { entries: [], hasMore: false, cursor: null };
    }

    const memories = await this.prisma.memory.findMany({
      where: {
        memorialId: { in: nearbyMemorialIds },
        status: PostStatus.PUBLISHED,
        visibility: Visibility.PUBLIC,
      },
      orderBy: { publishedAt: "desc" },
      skip: offset,
      take: limit + 1,
      include: MEMORY_INCLUDE,
    });

    const hasMore = memories.length > limit;
    const page = memories.slice(0, limit);

    return {
      entries: page.map(toFeedEntry),
      hasMore,
      cursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getMemoryById(memoryId: string) {
    return this.prisma.memory.findUnique({
      where: { id: memoryId },
      include: MEMORY_INCLUDE,
    });
  }
}
