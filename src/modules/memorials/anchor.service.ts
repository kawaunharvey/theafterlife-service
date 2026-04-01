import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class AnchorService {
  constructor(private readonly prisma: PrismaService) {}

  async placeAnchor(
    memorialId: string,
    ownerUserId: string,
    lat: number,
    lng: number,
  ) {
    const [user, memorial] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: ownerUserId },
        select: { entitlement: true, anchorLimit: true },
      }),
      this.prisma.memorial.findUnique({
        where: { id: memorialId },
        select: { id: true, ownerUserId: true },
      }),
    ]);

    if (!memorial) throw new NotFoundException("Memorial not found");
    if (memorial.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("Only the memorial owner can place anchors");
    }
    if (user?.entitlement !== "memorial_lifetime") {
      throw new ForbiddenException("Anchors require a lifetime membership");
    }

    const activeCount = await this.prisma.memoryAnchor.count({
      where: { memorialId, isActive: true },
    });
    if (activeCount >= (user.anchorLimit ?? 0)) {
      throw new ForbiddenException(
        `This memorial has reached its anchor limit (${user.anchorLimit})`,
      );
    }

    const anchor = await this.prisma.memoryAnchor.create({
      data: {
        memorialId,
        ownerUserId,
        point: { type: "Point", coordinates: [lng, lat] },
      },
    });

    // Assign all undiscovered memories for this memorial to this anchor
    // (nearest anchor reassignment runs daily, but we apply it immediately on placement)
    await this.assignMemoriesToNearestAnchor(memorialId);

    return anchor;
  }

  async removeAnchor(anchorId: string, ownerUserId: string) {
    const anchor = await this.prisma.memoryAnchor.findUnique({
      where: { id: anchorId },
      select: { id: true, ownerUserId: true, memorialId: true },
    });

    if (!anchor) throw new NotFoundException("Anchor not found");
    if (anchor.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("Only the anchor owner can remove it");
    }

    // Deactivate the anchor and release memories pointing to it
    await this.prisma.memoryAnchor.update({
      where: { id: anchorId },
      data: { isActive: false },
    });

    // Release memories that were heading to this anchor
    await this.prisma.memory.updateMany({
      where: { anchorId },
      data: { anchorId: null },
    });

    // Reassign remaining memories to any surviving active anchors
    await this.assignMemoriesToNearestAnchor(anchor.memorialId);
  }

  async listAnchors(memorialId: string) {
    return this.prisma.memoryAnchor.findMany({
      where: { memorialId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Assigns each undiscovered memory for a memorial to its nearest active anchor.
   *  If no active anchors exist, releases memories (anchorId → null). */
  async assignMemoriesToNearestAnchor(memorialId: string) {
    const anchors = await this.prisma.memoryAnchor.findMany({
      where: { memorialId, isActive: true },
      select: { id: true, point: true },
    });

    if (anchors.length === 0) {
      await this.prisma.memory.updateMany({
        where: { memorialId },
        data: { anchorId: null },
      });
      return;
    }

    const memories = await this.prisma.memory.findMany({
      where: { memorialId },
      select: { id: true, point: true },
    });

    await Promise.all(
      memories.map((memory) => {
        const [mLng, mLat] = (memory.point as { coordinates: number[] }).coordinates;
        let nearestId = anchors[0].id;
        let nearestDist = Infinity;

        for (const anchor of anchors) {
          const [aLng, aLat] = (anchor.point as { coordinates: number[] }).coordinates;
          const dist = Math.hypot(mLng - aLng, mLat - aLat); // approximate — exact math runs in drift job
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestId = anchor.id;
          }
        }

        return this.prisma.memory.update({
          where: { id: memory.id },
          data: { anchorId: nearestId },
        });
      }),
    );
  }
}
