import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  SearchMemorialsDto,
  MemorialSearchResult,
  PaginatedResponse,
  SearchPlacesDto,
  PlaceSearchResult,
  SearchTaxonomiesDto,
  TaxonomySearchResult,
  ProviderDetailDto,
} from "./underworld.dto";

@Injectable()
export class UnderworldService {
  private readonly logger = new Logger(UnderworldService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get a single provider (Business or Place) by its prefixed underworld ID.
   * uwId format: "biz_{objectId}" for businesses, "plc_{objectId}" for places.
   */
  async getProviderById(uwId: string): Promise<ProviderDetailDto> {
    const bizPrefix = "biz_";
    const plcPrefix = "plc_";

    if (uwId.startsWith(bizPrefix)) {
      const id = uwId.slice(bizPrefix.length);
      const business = await this.prisma.business.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true,
          latitude: true,
          longitude: true,
          phone: true,
          links: true,
          photos: true,
          reputationScore: true,
          operatingHours: true,
          taxonomyIds: true,
          claimed: true,
        },
      });

      if (!business) {
        throw new NotFoundException(`Provider not found: ${uwId}`);
      }

      const website = business.links?.find((l) => l.url)?.url ?? undefined;

      return {
        uwId,
        source: "business",
        name: business.name ?? "Unknown",
        address: business.addressLine1 ?? undefined,
        city: business.city ?? undefined,
        state: business.state ?? undefined,
        postalCode: business.postalCode ?? undefined,
        latitude: business.latitude ?? undefined,
        longitude: business.longitude ?? undefined,
        phone: business.phone ?? undefined,
        website,
        photos: business.photos ?? [],
        rating: business.reputationScore ?? undefined,
        operatingHours: (business.operatingHours as Record<string, any>) ?? undefined,
        taxonomies: business.taxonomyIds ?? [],
        claimed: business.claimed,
      };
    }

    if (uwId.startsWith(plcPrefix)) {
      const id = uwId.slice(plcPrefix.length);
      const place = await this.prisma.place.findUnique({
        where: { id },
        select: {
          id: true,
          googlePlaceId: true,
          claimed: true,
          latitude: true,
          longitude: true,
          taxonomyId: true,
          googleSnapshot: true,
        },
      });

      if (!place) {
        throw new NotFoundException(`Provider not found: ${uwId}`);
      }

      const snap = place.googleSnapshot;
      // Normalize Google 1–5 rating to 0–100
      const rating = snap?.rating != null ? (snap.rating / 5) * 100 : undefined;

      return {
        uwId,
        source: "place",
        name: snap?.name ?? "Unknown",
        address: snap?.formattedAddress ?? undefined,
        latitude: place.latitude ?? undefined,
        longitude: place.longitude ?? undefined,
        phone: snap?.internationalPhone ?? undefined,
        website: snap?.website ?? undefined,
        photos: [],
        rating,
        operatingHours: (snap?.openingHours as Record<string, any>) ?? undefined,
        taxonomies: place.taxonomyId ? [place.taxonomyId] : [],
        claimed: place.claimed,
        googlePlaceId: place.googlePlaceId,
      };
    }

    throw new BadRequestException(
      `Invalid provider ID format: "${uwId}". Expected "biz_{id}" or "plc_{id}".`,
    );
  }

  /**
   * Search across memorials with pagination and filtering
   */
  async searchMemorials(
    dto: SearchMemorialsDto,
  ): Promise<PaginatedResponse<MemorialSearchResult>> {
    const {
      query,
      visibility,
      status,
      verificationStatus,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = dto;

    const skip = (page - 1) * limit;

    try {
      // Build filter conditions
      const where: any = {};

      if (query) {
        where.OR = [
          { displayName: { contains: query, mode: "insensitive" } },
          { bioSummary: { contains: query, mode: "insensitive" } },
          { tags: { hasSome: [query] } },
        ];
      }

      if (visibility) {
        where.visibility = visibility;
      }

      if (status) {
        where.status = status;
      }

      if (verificationStatus) {
        where.verificationStatus = verificationStatus;
      }

      // Get total count
      const total = await this.prisma.memorial.count({ where });

      // Get paginated results
      const memorials = await this.prisma.memorial.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        select: {
          id: true,
          slug: true,
          displayName: true,
          coverAssetUrl: true,
          yearOfBirth: true,
          yearOfPassing: true,
          visibility: true,
          status: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true,
          tags: true,
        },
      });

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: memorials as MemorialSearchResult[],
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error searching memorials: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Search across places with pagination and filtering
   */
  async searchPlaces(
    dto: SearchPlacesDto,
  ): Promise<PaginatedResponse<PlaceSearchResult>> {
    const {
      query,
      taxonomyId,
      minRating,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10,
      claimed,
    } = dto;

    const skip = (page - 1) * limit;

    try {
      // Build filter conditions
      // Note: MongoDB composite types don't support JSON path operators in Prisma
      // We only filter on root-level fields in the DB query
      const where: any = {};

      // Only apply DB-level filters for fields we CAN filter on
      if (taxonomyId) {
        where.taxonomyId = taxonomyId;
      }

      if (claimed !== undefined) {
        where.claimed = claimed === "true";
      }

      // Don't filter by query at DB level - googlePlaceId won't match business names
      // We'll filter by name/address in memory after fetching

      // Get all places matching the DB-level filters
      let places = await this.prisma.place.findMany({
        where,
        select: {
          id: true,
          googlePlaceId: true,
          claimed: true,
          businessId: true,
          latitude: true,
          longitude: true,
          taxonomyId: true,
          googleSnapshot: {
            select: {
              name: true,
              formattedAddress: true,
              categories: true,
              rating: true,
              userRatingsTotal: true,
              website: true,
              internationalPhone: true,
            },
          },
        },
      });

      // Filter by name/address in memory if query exists
      if (query) {
        const lowerQuery = query.toLowerCase();
        places = places.filter((place) => {
          const name = place.googleSnapshot?.name?.toLowerCase() || "";
          const address =
            place.googleSnapshot?.formattedAddress?.toLowerCase() || "";
          const placeId = place.googlePlaceId.toLowerCase();
          return (
            name.includes(lowerQuery) ||
            address.includes(lowerQuery) ||
            placeId.includes(lowerQuery)
          );
        });
      }

      // Filter by minRating in memory if provided
      if (minRating) {
        places = places.filter(
          (place) =>
            place.googleSnapshot?.rating && place.googleSnapshot.rating >= minRating,
        );
      }

      // Sort by rating if requested
      if (sortBy === "rating") {
        places.sort((a, b) => {
          const ratingA = a.googleSnapshot?.rating || 0;
          const ratingB = b.googleSnapshot?.rating || 0;
          return sortOrder === "asc" ? ratingA - ratingB : ratingB - ratingA;
        });
      } else if (sortBy === "name") {
        places.sort((a, b) => {
          const nameA = a.googleSnapshot?.name || "";
          const nameB = b.googleSnapshot?.name || "";
          return sortOrder === "asc"
            ? nameA.localeCompare(nameB)
            : nameB.localeCompare(nameA);
        });
      }

      // Get total after filtering
      const total = places.length;

      // Apply pagination in memory
      const skip = (page - 1) * limit;
      places = places.slice(skip, skip + limit);

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: places as PlaceSearchResult[],
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error searching places: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Search across taxonomies with pagination and filtering
   */
  async searchTaxonomies(
    dto: SearchTaxonomiesDto,
  ): Promise<PaginatedResponse<TaxonomySearchResult>> {
    const {
      query,
      kind,
      parentId,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10,
      isActive,
    } = dto;

    const skip = (page - 1) * limit;

    try {
      // Build filter conditions
      const where: any = {};

      if (query) {
        where.OR = [
          { name: { contains: query, mode: "insensitive" } },
          { key: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ];
      }

      if (kind) {
        where.kind = kind;
      }

      if (parentId) {
        where.parentId = parentId;
      }

      if (isActive !== undefined) {
        where.isActive = isActive === "true";
      }

      // Get total count
      const total = await this.prisma.taxonomyNode.count({ where });

      // Get paginated results
      const taxonomies = await this.prisma.taxonomyNode.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        select: {
          id: true,
          key: true,
          kind: true,
          name: true,
          description: true,
          group: true,
          parentId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          metadata: true,
        },
      });

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: taxonomies as TaxonomySearchResult[],
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error searching taxonomies: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
