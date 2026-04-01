import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PostStatus } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { Env } from "@/config/env";

const EARTH_RADIUS_METERS = 6378100;
const BATCH_SIZE = 100;

/** Returns distance in meters between two [lng, lat] points (haversine). */
function distanceMeters(
  [lng1, lat1]: number[],
  [lng2, lat2]: number[],
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Returns bearing in radians from [lng1, lat1] toward [lng2, lat2]. */
function bearingTo([lng1, lat1]: number[], [lng2, lat2]: number[]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const lat1r = toRad(lat1);
  const lat2r = toRad(lat2);
  const y = Math.sin(dLng) * Math.cos(lat2r);
  const x =
    Math.cos(lat1r) * Math.sin(lat2r) -
    Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
  return Math.atan2(y, x);
}

/** Moves a [lng, lat] point by `meters` along `bearingRad`. */
function movePoint(
  [lng, lat]: number[],
  meters: number,
  bearingRad: number,
): [number, number] {
  const latRad = (lat * Math.PI) / 180;
  const newLat = Math.max(
    -90,
    Math.min(
      90,
      lat + (meters / 111111) * Math.cos(bearingRad),
    ),
  );
  const newLng = Math.max(
    -180,
    Math.min(
      180,
      lng +
        (meters / (111111 * Math.cos(latRad))) * Math.sin(bearingRad),
    ),
  );
  return [newLng, newLat];
}

@Injectable()
export class MemoryDriftService {
  private readonly logger = new Logger(MemoryDriftService.name);

  private readonly homeRadiusMeters: number;
  private readonly normalSpeedMeters: number;
  private readonly anchorSpeedMeters: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.homeRadiusMeters = config.get("ANCHOR_HOME_TERRITORY_RADIUS_METERS", { infer: true });
    this.normalSpeedMeters = config.get("NORMAL_DRIFT_SPEED_METERS_PER_HOUR", { infer: true });
    this.anchorSpeedMeters = config.get("ANCHOR_PULL_SPEED_METERS_PER_HOUR", { infer: true });
  }

  // ----------------------------------------------------------------
  // Hourly drift — moves all published memories one tick
  // ----------------------------------------------------------------
  @Cron(CronExpression.EVERY_HOUR)
  async driftMemories(): Promise<void> {
    this.logger.log("Starting memory drift...");

    // Pre-fetch anchors we'll need (keyed by anchor id)
    const activeAnchors = await this.prisma.memoryAnchor.findMany({
      where: { isActive: true },
      select: { id: true, point: true },
    });
    const anchorMap = new Map(
      activeAnchors.map((a) => [a.id, a.point.coordinates]),
    );

    let cursor: string | undefined;
    let totalMoved = 0;

    do {
      const memories = await this.prisma.memory.findMany({
        where: { status: PostStatus.PUBLISHED },
        select: { id: true, point: true, homePoint: true, anchorId: true },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
      });

      if (memories.length === 0) break;

      await Promise.all(
        memories.map((memory) => {
          const current = (memory.point as { coordinates: number[] })?.coordinates;

          // Skip legacy records with missing or invalid coordinates
          if (
            !Array.isArray(current) ||
            current.length < 2 ||
            !Number.isFinite(current[0]) ||
            !Number.isFinite(current[1])
          ) {
            return Promise.resolve();
          }

          const home = memory.homePoint
            ? (memory.homePoint as { coordinates: number[] }).coordinates
            : current; // legacy record — treat current position as home center

          if (
            !Number.isFinite(home[0]) ||
            !Number.isFinite(home[1])
          ) {
            return Promise.resolve();
          }

          let newPoint: [number, number];

          if (memory.anchorId && anchorMap.has(memory.anchorId)) {
            // Anchor pull: move toward anchor at 100m/hr
            const anchorCoords = anchorMap.get(memory.anchorId)!;
            const dist = distanceMeters(current, anchorCoords);

            if (dist <= 1) {
              // Already at anchor — no update needed
              return Promise.resolve();
            }

            const bearing = bearingTo(current, anchorCoords);
            const moveBy = Math.min(this.anchorSpeedMeters, dist);
            newPoint = movePoint(current, moveBy, bearing);
          } else {
            // Free drift: random direction, 10m, clamped to home territory
            const bearing = Math.random() * 2 * Math.PI;
            const candidate = movePoint(current, this.normalSpeedMeters, bearing);

            if (distanceMeters(candidate, home) <= this.homeRadiusMeters) {
              newPoint = candidate;
            } else {
              // Reflect: move toward home instead
              const homeBearing = bearingTo(current, home);
              newPoint = movePoint(current, this.normalSpeedMeters, homeBearing);
            }
          }

          if (!Number.isFinite(newPoint[0]) || !Number.isFinite(newPoint[1])) {
            this.logger.warn(`Skipping memory ${memory.id} — computed NaN coordinates`);
            return Promise.resolve();
          }

          return this.prisma.memory.update({
            where: { id: memory.id },
            data: { point: { type: "Point", coordinates: newPoint } },
          });
        }),
      );

      totalMoved += memories.length;
      cursor = memories.length === BATCH_SIZE ? memories[memories.length - 1].id : undefined;
    } while (cursor);

    this.logger.log(`Memory drift complete — moved ${totalMoved} memories`);
  }

  // ----------------------------------------------------------------
  // Daily anchor reassignment — each memory picks its nearest anchor
  // ----------------------------------------------------------------
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async reassignAnchors(): Promise<void> {
    this.logger.log("Starting anchor reassignment...");

    const activeAnchors = await this.prisma.memoryAnchor.findMany({
      where: { isActive: true },
      select: { id: true, memorialId: true, point: true },
    });

    // Group anchors by memorialId
    const anchorsByMemorial = new Map<string, typeof activeAnchors>();
    for (const anchor of activeAnchors) {
      const list = anchorsByMemorial.get(anchor.memorialId) ?? [];
      list.push(anchor);
      anchorsByMemorial.set(anchor.memorialId, list);
    }

    let cursor: string | undefined;
    let totalReassigned = 0;

    do {
      const memories = await this.prisma.memory.findMany({
        where: {
          status: PostStatus.PUBLISHED,
          anchorId: { not: null },
        },
        select: { id: true, memorialId: true, point: true, anchorId: true },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
      });

      if (memories.length === 0) break;

      await Promise.all(
        memories.map((memory) => {
          const memorialAnchors = anchorsByMemorial.get(memory.memorialId);
          if (!memorialAnchors || memorialAnchors.length === 0) {
            // No active anchors for this memorial — release
            return this.prisma.memory.update({
              where: { id: memory.id },
              data: { anchorId: null },
            });
          }

          const coords = (memory.point as { coordinates: number[] }).coordinates;

          // Find nearest anchor
          let nearestId = memorialAnchors[0].id;
          let nearestDist = distanceMeters(
            coords,
            memorialAnchors[0].point.coordinates,
          );
          for (const anchor of memorialAnchors.slice(1)) {
            const d = distanceMeters(coords, anchor.point.coordinates);
            if (d < nearestDist) {
              nearestDist = d;
              nearestId = anchor.id;
            }
          }

          if (nearestId === memory.anchorId) return Promise.resolve();

          totalReassigned++;
          return this.prisma.memory.update({
            where: { id: memory.id },
            data: { anchorId: nearestId },
          });
        }),
      );

      cursor = memories.length === BATCH_SIZE ? memories[memories.length - 1].id : undefined;
    } while (cursor);

    this.logger.log(`Anchor reassignment complete — reassigned ${totalReassigned} memories`);
  }
}
