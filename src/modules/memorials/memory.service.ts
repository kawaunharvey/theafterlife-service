import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ArtifactContextStatus, ArtifactType, MemorialRelationshipKind, PostStatus, Visibility } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateMemoryDto } from "./dto/create-memory.dto";

function isVideoUrl(url: string): boolean {
  const path = url.split("?")[0].toLowerCase();
  return path.endsWith(".mov") || path.endsWith(".mp4") || path.endsWith(".m4v");
}

function mediaTypeToArtifactType(mediaType: string): ArtifactType {
  switch (mediaType.toLowerCase()) {
    case "video": return ArtifactType.VIDEO;
    case "audio": return ArtifactType.AUDIO;
    default:      return ArtifactType.IMAGE;
  }
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue("artifact-context")
    private readonly artifactContextQueue: Queue,
  ) {}

  async createMemory(
    authorUserId: string,
    memorialId: string,
    dto: CreateMemoryDto,
  ) {
    const [relationship, memorial] = await Promise.all([
      this.prisma.memorialRelationship.findUnique({
        where: { memorialId_userId: { memorialId, userId: authorUserId } },
      }),
      this.prisma.memorial.findUnique({
        where: { id: memorialId },
        select: { id: true, status: true, ownerUserId: true },
      }),
    ]);

    if (!memorial) throw new NotFoundException("Memorial not found");
    if (memorial.status !== "ACTIVE")
      throw new ForbiddenException("Memorial is not active");

    const isOwner = memorial.ownerUserId === authorUserId;
    if (!relationship && !isOwner)
      throw new ForbiddenException(
        "Only people with a memorial relationship can share memories",
      );

    const relationshipKind = (relationship?.relationship ?? MemorialRelationshipKind.IMMEDIATE_FAMILY) as MemorialRelationshipKind;

    const media = (dto.assetIds ?? []).map((assetId) => ({
      mediaType: isVideoUrl(assetId) ? "video" : "image",
      assetId,
      url: assetId,
    }));

    const memory = await this.prisma.memory.create({
      data: {
        memorialId,
        authorUserId,
        relationship: relationshipKind,
        body: dto.body,
        prompt: dto.prompt,
        media,
        locationId: dto.locationId,
        point: { type: "Point", coordinates: [dto.lng, dto.lat] },
        homePoint: { type: "Point", coordinates: [dto.lng, dto.lat] },
        visibility: dto.visibility ?? Visibility.PUBLIC,
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    await this.prisma.memorial
      .update({
        where: { id: memorialId },
        data: { pendingRegeneration: true, lastMemoryAt: new Date() },
      })
      .catch((err) =>
        this.logger.error("Failed to set pendingRegeneration flag", err),
      );

    if (media.length > 0) {
      await this.prisma.artifact.createMany({
        data: media.map((m) => ({
          memoryId: memory.id,
          memorialId,
          type: mediaTypeToArtifactType(m.mediaType),
          assetId: m.assetId,
          url: m.url,
          contextStatus: ArtifactContextStatus.PENDING,
        })),
      });

      const artifacts = await this.prisma.artifact.findMany({
        where: { memoryId: memory.id },
        select: { id: true },
      });

      await Promise.allSettled(
        artifacts.map((a) =>
          this.artifactContextQueue.add("generate-context", { artifactId: a.id }),
        ),
      ).catch((err) =>
        this.logger.error("Failed to enqueue artifact context jobs", err),
      );
    }

    return memory;
  }

  async getMemorialMemories(memorialId: string, cursor?: string, userId?: string) {
    const memories = await this.prisma.memory.findMany({
      where: { memorialId, status: PostStatus.PUBLISHED, ...(userId ? { authorUserId: userId } : {}) },
      orderBy: { publishedAt: "desc" },
      take: 21,
      include: {
        memorial: { select: { id: true, displayName: true, coverAssetUrl: true, salutation: true, theme: true } },
        author: { select: { id: true, name: true, handle: true, imageUrl: true } },
      },
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : {}),
    });

    const hasMore = memories.length > 20;
    const page = memories.slice(0, 20);
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return { memories: page, nextCursor };
  }

  async getMyCreatedMemories(userId: string, cursor?: string) {
    const memories = await this.prisma.memory.findMany({
      where: { authorUserId: userId, status: PostStatus.PUBLISHED },
      orderBy: { publishedAt: "desc" },
      take: 21,
      include: {
        memorial: { select: { id: true, displayName: true, coverAssetUrl: true, salutation: true, theme: true } },
        author: { select: { id: true, name: true, handle: true, imageUrl: true } },
      },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = memories.length > 20;
    const page = memories.slice(0, 20);
    return { memories: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async discoverNearby(
    userId: string,
    lat: number,
    lng: number,
    cursor?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { discoveryRangeMeters: true },
    });
    const radiusMeters = user?.discoveryRangeMeters ?? 375;
    const radiusRadians = radiusMeters / 6378100;
    const geoFilter = {
      status: "PUBLISHED",
      "point.coordinates": {
        $geoWithin: { $centerSphere: [[lng, lat], radiusRadians] },
      },
    };

    const rawResults = (await this.prisma.memory.findRaw({
      filter: {
        ...geoFilter,
        ...(cursor ? { _id: { $gt: { $oid: cursor } } } : {}),
      },
      options: { limit: 21 },
    })) as unknown as any[];

    const hasMore = rawResults.length > 20;
    const page = rawResults.slice(0, 20);

    const filtered = page.filter((m) => {
      if (m.visibility === "PUBLIC") return true;
      return m.authorUserId === userId;
    });

    const nextCursor = hasMore
      ? String((page[page.length - 1] as Record<string, unknown>)._id)
      : null;

    return { memories: filtered, nextCursor };
  }

  async getMemoryById(memoryId: string) {
    return this.prisma.memory.findUnique({
      where: { id: memoryId },
      include: {
        memorial: { select: { id: true, displayName: true, coverAssetUrl: true, salutation: true, theme: true, yearOfBirth: true, yearOfPassing: true } },
        author: { select: { id: true, name: true, handle: true, imageUrl: true } },
      },
    });
  }

  async recordDiscovery(userId: string, memoryId: string) {
    const memory = await this.prisma.memory.findUnique({
      where: { id: memoryId },
      select: { id: true },
    });
    if (!memory) throw new NotFoundException("Memory not found");

    return this.prisma.memoryDiscovery.upsert({
      where: { userId_memoryId: { userId, memoryId } },
      create: { userId, memoryId },
      update: {},
    });
  }

  async getDiscoveredMemoriesForMemorial(userId: string, memorialId: string, cursor?: string) {
    const [discoveries, totalDiscovered, totalMemories] = await Promise.all([
      this.prisma.memoryDiscovery.findMany({
        where: { userId, memory: { memorialId } },
        select: { memoryId: true },
        orderBy: { discoveredAt: "desc" },
        take: 21,
        ...(cursor
          ? { cursor: { userId_memoryId: { userId, memoryId: cursor } }, skip: 1 }
          : {}),
      }),
      this.prisma.memoryDiscovery.count({
        where: { userId, memory: { memorialId } },
      }),
      this.prisma.memory.count({
        where: { memorialId, status: PostStatus.PUBLISHED },
      }),
    ]);

    const memoryIds = discoveries.map((d) => d.memoryId);
    const memories = await this.prisma.memory.findMany({
      where: { id: { in: memoryIds }, status: PostStatus.PUBLISHED },
    });

    const nextCursor = discoveries.length > 20 ? memoryIds[19] : null;
    return { memories: memories.slice(0, 20), nextCursor, totalDiscovered, totalMemories };
  }

  async getDiscoveredMemories(userId: string, cursor?: string) {
    const discoveries = await this.prisma.memoryDiscovery.findMany({
      where: { userId },
      select: { memoryId: true },
      orderBy: { discoveredAt: "desc" },
      take: 21,
      ...(cursor
        ? { cursor: { userId_memoryId: { userId, memoryId: cursor } }, skip: 1 }
        : {}),
    });

    const memoryIds = discoveries.map((d) => d.memoryId);
    const memories = await this.prisma.memory.findMany({
      where: { id: { in: memoryIds }, status: PostStatus.PUBLISHED },
    });

    const nextCursor = discoveries.length > 20 ? memoryIds[19] : null;
    return { memories: memories.slice(0, 20), nextCursor };
  }
}
