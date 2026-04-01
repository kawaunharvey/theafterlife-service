import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { GooglePlacesClient } from "./google-places.client";

/**
 * PlacesMaintenanceService
 * Maintains Google Place snapshots with scheduled refreshes
 */
@Injectable()
export class PlacesMaintenanceService {
  private readonly logger = new Logger(PlacesMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googlePlaces: GooglePlacesClient,
  ) {}

  /**
   * Refresh Google snapshots for places that are stale or need updating
   * Runs every day at 3 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async refreshStaleSnapshots(): Promise<void> {
    this.logger.log("Starting scheduled Google snapshot refresh...");

    try {
      // Find places that need refresh (older than 7 days or never refreshed)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const stalePlaces = await this.prisma.place.findMany({
        where: {
          OR: [
            { snapshotRefreshJobAt: null },
            { snapshotRefreshJobAt: { lt: sevenDaysAgo } },
            { snapshotRefreshStatus: "failed" },
          ],
        },
        take: 100, // Process 100 at a time to avoid rate limits
        orderBy: { snapshotRefreshJobAt: "asc" },
      });

      this.logger.log(`Found ${stalePlaces.length} places to refresh`);

      let successCount = 0;
      let failCount = 0;

      for (const place of stalePlaces) {
        try {
          await this.refreshPlaceSnapshot(place.id);
          successCount++;
          // Small delay to avoid hitting rate limits
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          failCount++;
          this.logger.warn(
            `Failed to refresh place ${place.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `Snapshot refresh complete: ${successCount} success, ${failCount} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error in scheduled snapshot refresh: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Refresh a single place's Google snapshot
   */
  async refreshPlaceSnapshot(placeId: string): Promise<void> {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
    });

    if (!place) {
      throw new Error(`Place ${placeId} not found`);
    }

    try {
      const details = await this.googlePlaces.getPlaceDetails(
        place.googlePlaceId,
      );

      if (!details) {
        await this.prisma.place.update({
          where: { id: placeId },
          data: {
            snapshotRefreshJobAt: new Date(),
            snapshotRefreshStatus: "failed",
          },
        });
        throw new Error(`No details returned for place ${place.googlePlaceId}`);
      }

      // Calculate expiration (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Update place with fresh snapshot
      await this.prisma.place.update({
        where: { id: placeId },
        data: {
          googleSnapshot: {
            name: details.name,
            formattedAddress: details.formattedAddress,
            internationalPhone: details.internationalPhoneNumber,
            website: details.website,
            location: details.location
              ? {
                  type: "Point",
                  coordinates: [details.location.lng, details.location.lat],
                }
              : undefined,
            viewport: details.viewport,
            categories: details.types || [],
            rating: details.rating,
            userRatingsTotal: details.userRatingsTotal,
            openingHours: details.openingHours,
            priceLevel: details.priceLevel,
            utcOffsetMinutes: details.utcOffsetMinutes,
            cachedAt: new Date(),
            expiresAt,
          },
          googleSnapshotVersion: { increment: 1 },
          snapshotRefreshJobAt: new Date(),
          snapshotRefreshStatus: "success",
          latitude: details.location?.lat,
          longitude: details.location?.lng,
          locationPoint: details.location
            ? {
                type: "Point",
                coordinates: [details.location.lng, details.location.lat],
              }
            : undefined,
        },
      });

      this.logger.debug(
        `Refreshed snapshot for place ${placeId} (${details.name})`,
      );
    } catch (error) {
      await this.prisma.place.update({
        where: { id: placeId },
        data: {
          snapshotRefreshJobAt: new Date(),
          snapshotRefreshStatus: "failed",
        },
      });
      throw error;
    }
  }

  /**
   * Clear expired snapshots (older than 60 days)
   * Runs every week
   */
  @Cron(CronExpression.EVERY_WEEK)
  async clearExpiredSnapshots(): Promise<void> {
    this.logger.log("Clearing expired Google snapshots...");

    try {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const result = await this.prisma.place.updateMany({
        where: {
          snapshotRefreshJobAt: { lt: sixtyDaysAgo },
        },
        data: {
          googleSnapshot: null,
          snapshotRefreshStatus: null,
        },
      });

      this.logger.log(
        `Cleared ${result.count} expired snapshots (older than 60 days)`,
      );
    } catch (error) {
      this.logger.error(
        `Error clearing expired snapshots: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
