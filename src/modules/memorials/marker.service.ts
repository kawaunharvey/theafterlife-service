import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FollowTargetType, PostStatus, Visibility } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { Env } from "@/config/env";

// ---- Shared select snippets -----------------------------------------------

const MEMORIAL_SELECT = {
  id: true,
  displayName: true,
  salutation: true,
  coverAssetUrl: true,
  theme: true,
} as const;

const AUTHOR_SELECT = {
  id: true,
  name: true,
  handle: true,
  imageUrl: true,
} as const;

// ---- Public types ----------------------------------------------------------

export type MemorialSnippet = {
  id: string;
  displayName: string;
  salutation: string | null;
  coverAssetUrl: string | null;
  theme: string | null;
};

export type AuthorSnippet = {
  id: string;
  name: string | null;
  handle: string | null;
  imageUrl: string | null;
};

export type ArtifactSnippet = {
  url: string | null;
  assetId: string | null;
  type: string;
};

export type MemoryMarker = {
  kind: "MEMORY";
  id: string;
  body: string;
  createdAt: string;
  point: unknown;
  memorialId: string;
  discoveredByCurrentUser: boolean;
  likesCount: number;
  commentsCount: number;
  artifacts: ArtifactSnippet[];
  memorial: MemorialSnippet;
  author: AuthorSnippet;
};

export type AnchorMarker = {
  kind: "ANCHOR";
  id: string;
  createdAt: string;
  point: unknown;
  memorialId: string;
  memorial: MemorialSnippet;
};

export type MarkerItem = MemoryMarker | AnchorMarker;

export type MarkersPage = {
  items: MarkerItem[];
  nextCursor: string | null;
};

// ---- Cursor helpers --------------------------------------------------------

function encodeCursor(lastCreatedAt: Date): string {
  return Buffer.from(
    JSON.stringify({ lastCreatedAt: lastCreatedAt.toISOString() }),
  ).toString("base64");
}

function decodeCursor(cursor: string): Date {
  const { lastCreatedAt } = JSON.parse(
    Buffer.from(cursor, "base64").toString(),
  );
  return new Date(lastCreatedAt);
}

// ---- Raw ObjectId extraction -----------------------------------------------

function extractOid(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.$oid === "string") return obj.$oid;
  return String(raw);
}

// ---- Service ---------------------------------------------------------------

@Injectable()
export class MarkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ---- Private helpers -----------------------------------------------------

  /** Returns IDs of PUBLIC+PUBLISHED memories within the geo radius, created before `before`. */
  private async getMemoryIdsInRadius(
    lat: number,
    lng: number,
    radiusMeters: number,
    before: Date,
  ): Promise<string[]> {
    const radiusRadians = radiusMeters / 6378100;
    const raw = (await this.prisma.memory.findRaw({
      filter: {
        status: "PUBLISHED",
        visibility: "PUBLIC",
        "point.coordinates": {
          $geoWithin: { $centerSphere: [[lng, lat], radiusRadians] },
        },
        createdAt: { $lt: { $date: before.toISOString() } },
      },
      options: { limit: 500, projection: { _id: 1 } },
    })) as unknown as Array<{ _id: unknown }>;

    return raw.map((m) => extractOid(m._id));
  }

  /** Enriches memory records with Interaction-based counts and discovery status. */
  private async enrichMemories(
    memories: Array<{
      id: string;
      body: string;
      createdAt: Date;
      point: unknown;
      memorialId: string;
      artifacts: ArtifactSnippet[];
      memorial: MemorialSnippet;
      author: AuthorSnippet;
    }>,
    discoveredSet: Set<string>,
  ): Promise<MemoryMarker[]> {
    if (memories.length === 0) return [];

    const ids = memories.map((m) => m.id);

    const [likeGroups, unlikeGroups, commentGroups] = await Promise.all([
      this.prisma.interaction.groupBy({
        by: ["targetId"],
        where: { type: "LIKE", targetType: "POST", targetId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.interaction.groupBy({
        by: ["targetId"],
        where: { type: "UNLIKE", targetType: "POST", targetId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.interaction.groupBy({
        by: ["targetId"],
        where: { type: "COMMENT", targetType: "POST", targetId: { in: ids } },
        _count: { _all: true },
      }),
    ]);

    const likeMap = new Map(likeGroups.map((g) => [g.targetId, g._count._all]));
    const unlikeMap = new Map(
      unlikeGroups.map((g) => [g.targetId, g._count._all]),
    );
    const commentMap = new Map(
      commentGroups.map((g) => [g.targetId, g._count._all]),
    );

    return memories.map((m) => ({
      kind: "MEMORY" as const,
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      point: m.point,
      memorialId: m.memorialId,
      discoveredByCurrentUser: discoveredSet.has(m.id),
      likesCount: Math.max(
        0,
        (likeMap.get(m.id) ?? 0) - (unlikeMap.get(m.id) ?? 0),
      ),
      commentsCount: commentMap.get(m.id) ?? 0,
      artifacts: m.artifacts,
      memorial: m.memorial,
      author: m.author,
    }));
  }

  /** Merges, sorts by createdAt desc, slices to limit, encodes cursor. */
  private paginate(items: MarkerItem[], limit: number): MarkersPage {
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    const nextCursor = hasMore
      ? encodeCursor(new Date(page[page.length - 1].createdAt))
      : null;
    return { items: page, nextCursor };
  }

  // ---- Public methods -------------------------------------------------------

  async getHomepageMarkers(
    userId: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    cursor?: string,
    limit = 20,
  ): Promise<MarkersPage> {
    const before = cursor ? decodeCursor(cursor) : new Date();

    // 1. IDs within the geo radius (PUBLIC+PUBLISHED, before cursor date)
    const nearbyIds = await this.getMemoryIdsInRadius(
      lat,
      lng,
      radiusMeters,
      before,
    );

    // 2. Followed memorial IDs (for anchor source)
    const follows = await this.prisma.follow.findMany({
      where: { userId, targetType: FollowTargetType.MEMORIAL },
      select: { targetId: true },
    });
    const followedIds = follows.map((f) => f.targetId);

    // 3. Which nearby memories has the user already discovered?
    const nearbyDiscoveries =
      nearbyIds.length > 0
        ? await this.prisma.memoryDiscovery.findMany({
            where: { userId, memoryId: { in: nearbyIds } },
            select: { memoryId: true },
          })
        : [];
    const nearbyDiscoveredSet = new Set(nearbyDiscoveries.map((d) => d.memoryId));
    const undiscoveredNearbyIds = nearbyIds.filter(
      (id) => !nearbyDiscoveredSet.has(id),
    );

    // 4. Fetch all four sources in parallel
    const [undiscoveredMemories, myMemories, followedAnchors, myAnchors] =
      await Promise.all([
        // Source A: undiscovered nearby memories (not authored by user)
        undiscoveredNearbyIds.length > 0
          ? this.prisma.memory.findMany({
              where: {
                id: { in: undiscoveredNearbyIds },
                authorUserId: { not: userId },
                visibility: Visibility.PUBLIC,
              },
              include: {
                memorial: { select: MEMORIAL_SELECT },
                author: { select: AUTHOR_SELECT },
                artifacts: { select: { url: true, assetId: true, type: true } },
              },
            })
          : Promise.resolve([]),

        // Source B: memories authored by user (all locations, paginated)
        this.prisma.memory.findMany({
          where: {
            authorUserId: userId,
            status: PostStatus.PUBLISHED,
            createdAt: { lt: before },
          },
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          include: {
            memorial: { select: MEMORIAL_SELECT },
            author: { select: AUTHOR_SELECT },
            artifacts: { select: { url: true, assetId: true, type: true } },
          },
        }),

        // Source C: active anchors for followed memorials
        followedIds.length > 0
          ? this.prisma.memoryAnchor.findMany({
              where: {
                memorialId: { in: followedIds },
                isActive: true,
                createdAt: { lt: before },
              },
              include: { memorial: { select: MEMORIAL_SELECT } },
            })
          : Promise.resolve([]),

        // Source D: anchors personally placed by the user
        this.prisma.memoryAnchor.findMany({
          where: {
            ownerUserId: userId,
            isActive: true,
            createdAt: { lt: before },
          },
          include: { memorial: { select: MEMORIAL_SELECT } },
        }),
      ]);

    // 5. Build discovery set for myMemories enrichment
    const myMemoryIds = myMemories.map((m) => m.id);
    const myDiscoveries =
      myMemoryIds.length > 0
        ? await this.prisma.memoryDiscovery.findMany({
            where: { userId, memoryId: { in: myMemoryIds } },
            select: { memoryId: true },
          })
        : [];
    const myDiscoveredSet = new Set(myDiscoveries.map((d) => d.memoryId));

    // undiscoveredMemories are by definition not yet discovered — empty set for them
    const combinedDiscoveredSet = myDiscoveredSet;

    // 6. Enrich all memories together (single batch of Interaction queries)
    const allMemories = [...undiscoveredMemories, ...myMemories];
    const enriched = await this.enrichMemories(allMemories, combinedDiscoveredSet);

    // 7. Deduplicate anchors (user may follow a memorial they also own)
    const seenAnchorIds = new Set<string>();
    const allAnchors = [...followedAnchors, ...myAnchors].filter((a) => {
      if (seenAnchorIds.has(a.id)) return false;
      seenAnchorIds.add(a.id);
      return true;
    });

    const anchorMarkers: AnchorMarker[] = allAnchors.map((a) => ({
      kind: "ANCHOR" as const,
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      point: a.point,
      memorialId: a.memorialId,
      memorial: a.memorial,
    }));

    return this.paginate([...enriched, ...anchorMarkers], limit);
  }

  async getMemorialMarkers(
    memorialId: string,
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<MarkersPage> {
    const before = cursor ? decodeCursor(cursor) : new Date();

    const [memories, anchors] = await Promise.all([
      this.prisma.memory.findMany({
        where: {
          memorialId,
          status: PostStatus.PUBLISHED,
          visibility: Visibility.PUBLIC,
          createdAt: { lt: before },
        },
        include: {
          memorial: { select: MEMORIAL_SELECT },
          author: { select: AUTHOR_SELECT },
          artifacts: { select: { url: true, assetId: true, type: true } },
        },
      }),
      this.prisma.memoryAnchor.findMany({
        where: { memorialId, isActive: true, createdAt: { lt: before } },
        include: { memorial: { select: MEMORIAL_SELECT } },
      }),
    ]);

    // Filter out already-discovered memories
    const memoryIds = memories.map((m) => m.id);
    const discoveries =
      memoryIds.length > 0
        ? await this.prisma.memoryDiscovery.findMany({
            where: { userId, memoryId: { in: memoryIds } },
            select: { memoryId: true },
          })
        : [];
    const discoveredSet = new Set(discoveries.map((d) => d.memoryId));
    const undiscovered = memories.filter((m) => !discoveredSet.has(m.id));

    const enriched = await this.enrichMemories(undiscovered, new Set());

    const anchorMarkers: AnchorMarker[] = anchors.map((a) => ({
      kind: "ANCHOR" as const,
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      point: a.point,
      memorialId: a.memorialId,
      memorial: a.memorial,
    }));


    return this.paginate([...enriched, ...anchorMarkers], limit);
  }

  async discoverNearbyBulk(
    userId: string,
    lat: number,
    lng: number,
  ): Promise<MarkersPage> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { discoveryRangeMeters: true },
    });
    const radiusMeters = user?.discoveryRangeMeters ?? 375;
    const radiusRadians = radiusMeters / 6378100;

    // All PUBLIC+PUBLISHED memories in range
    const raw = (await this.prisma.memory.findRaw({
      filter: {
        status: "PUBLISHED",
        visibility: "PUBLIC",
        "point.coordinates": {
          $geoWithin: { $centerSphere: [[lng, lat], radiusRadians] },
        },
      },
      options: { projection: { _id: 1 } },
    })) as unknown as Array<{ _id: unknown }>;

    const nearbyIds = raw.map((m) => extractOid(m._id));
    if (nearbyIds.length === 0) return { items: [], nextCursor: null };

    // Which are already discovered?
    const existing = await this.prisma.memoryDiscovery.findMany({
      where: { userId, memoryId: { in: nearbyIds } },
      select: { memoryId: true },
    });
    const existingSet = new Set(existing.map((d) => d.memoryId));
    const newIds = nearbyIds.filter((id) => !existingSet.has(id));

    if (newIds.length === 0) return { items: [], nextCursor: null };

    // Record discoveries (idempotent)
    await this.prisma.memoryDiscovery.createMany({
      data: newIds.map((memoryId) => ({ userId, memoryId })),
      skipDuplicates: true as never,
    });

    // Fetch and return the newly discovered memories as marker-shaped data
    const memories = await this.prisma.memory.findMany({
      where: { id: { in: newIds } },
      include: {
        memorial: { select: MEMORIAL_SELECT },
        author: { select: AUTHOR_SELECT },
        artifacts: { select: { url: true, assetId: true, type: true } },
      },
    });

    const enriched = await this.enrichMemories(
      memories,
      new Set(newIds), // all just discovered → discoveredByCurrentUser: true
    );

    return this.paginate(enriched, enriched.length); // return all, no further pagination
  }

  async getRecentlyDiscoveredMemories(
    userId: string,
    days?: number,
    cursor?: string,
    limit = 20,
  ): Promise<MarkersPage & { items: MemoryMarker[] }> {
    const windowDays =
      days ?? this.config.get("RECENTLY_DISCOVERED_DAYS", { infer: true }) ?? 7;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const discoveries = await this.prisma.memoryDiscovery.findMany({
      where: {
        userId,
        discoveredAt: { gte: since },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { discoveredAt: "desc" },
      take: limit + 1,
      include: {
        memory: {
          include: {
            memorial: { select: MEMORIAL_SELECT },
            author: { select: AUTHOR_SELECT },
            artifacts: { select: { url: true, assetId: true, type: true } },
          },
        },
      },
    });

    const hasMore = discoveries.length > limit;
    const page = discoveries.slice(0, limit);
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const memoryIds = page.map((d) => d.memoryId);
    const [likeGroups, unlikeGroups, commentGroups] = await Promise.all([
      this.prisma.interaction.groupBy({
        by: ["targetId"],
        where: {
          type: "LIKE",
          targetType: "POST",
          targetId: { in: memoryIds },
        },
        _count: { _all: true },
      }),
      this.prisma.interaction.groupBy({
        by: ["targetId"],
        where: {
          type: "UNLIKE",
          targetType: "POST",
          targetId: { in: memoryIds },
        },
        _count: { _all: true },
      }),
      this.prisma.interaction.groupBy({
        by: ["targetId"],
        where: {
          type: "COMMENT",
          targetType: "POST",
          targetId: { in: memoryIds },
        },
        _count: { _all: true },
      }),
    ]);

    const likeMap = new Map(likeGroups.map((g) => [g.targetId, g._count._all]));
    const unlikeMap = new Map(
      unlikeGroups.map((g) => [g.targetId, g._count._all]),
    );
    const commentMap = new Map(
      commentGroups.map((g) => [g.targetId, g._count._all]),
    );

    const items: MemoryMarker[] = page.map((d) => ({
      kind: "MEMORY" as const,
      id: d.memory.id,
      body: d.memory.body,
      createdAt: d.memory.createdAt.toISOString(),
      point: d.memory.point,
      memorialId: d.memory.memorialId,
      discoveredByCurrentUser: true,
      likesCount: Math.max(
        0,
        (likeMap.get(d.memoryId) ?? 0) - (unlikeMap.get(d.memoryId) ?? 0),
      ),
      commentsCount: commentMap.get(d.memoryId) ?? 0,
      artifacts: d.memory.artifacts,
      memorial: d.memory.memorial,
      author: d.memory.author,
    }));

    return { items, nextCursor };
  }
}
