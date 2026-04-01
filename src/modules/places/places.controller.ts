import {
  Body,
  Controller,
  Post,
  HttpException,
  HttpStatus,
  Logger,
  Get,
  Param,
  Patch,
} from "@nestjs/common";
import { IsString, IsOptional, IsNotEmpty } from "class-validator";
import { PrismaService } from "@/prisma/prisma.service";
import { GooglePlacesClient } from "./google-places.client";

class UploadPlaceDto {
  @IsString()
  @IsNotEmpty()
  googlePlaceId!: string;

  @IsString()
  @IsOptional()
  taxonomyId?: string;
}

class UpdatePlaceTaxonomyDto {
  @IsString()
  @IsOptional()
  taxonomyId?: string;
}

/**
 * PlacesController
 * Handles place data operations including uploading places by Google Place ID
 */
@Controller("places")
export class PlacesController {
  private readonly logger = new Logger(PlacesController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googlePlaces: GooglePlacesClient,
  ) {}

  /**
   * Get place details by id
   * Returns the place record if it exists, otherwise returns 404
   */
  @Get(":id")
  async getPlace(@Param("id") id: string) {
    try {
      const place = await this.prisma.place.findUnique({
        where: { id },
        include: {
          taxonomy: true,
        },
      });

      if (!place) {
        throw new HttpException(`Place not found`, HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        place,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Upload a place by Google Place ID
   * Creates a new Place record and fetches initial Google snapshot
   */
  @Post()
  async uploadPlace(@Body() dto: UploadPlaceDto) {
    const { googlePlaceId, taxonomyId } = dto;
    try {
      // Check if place already exists
      const existing = await this.prisma.place.findUnique({
        where: { googlePlaceId },
        include: {
          taxonomy: true,
        },
      });

      if (existing) {
        this.logger.log(
          `Place with googlePlaceId ${googlePlaceId} already exists, returning existing record`,
        );
        return {
          success: true,
          place: existing,
          alreadyExists: true,
        };
      }

      // Validate taxonomyId if provided
      if (taxonomyId) {
        const taxonomy = await this.prisma.taxonomyNode.findUnique({
          where: { id: taxonomyId },
        });

        if (!taxonomy) {
          throw new HttpException(
            `Invalid taxonomyId: TaxonomyNode not found`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      // Fetch place details from Google
      this.logger.log(`Fetching details for place ${googlePlaceId}...`);
      const details = await this.googlePlaces.getPlaceDetails(googlePlaceId);

      if (!details) {
        throw new HttpException(
          `Unable to fetch details for Google Place ID: ${googlePlaceId}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Calculate expiration (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Create place with Google snapshot
      const place = await this.prisma.place.create({
        data: {
          claimed: false,
          googlePlaceId,
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
          googleSnapshotVersion: 1,
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
          taxonomyId: taxonomyId || null,
        },
        include: {
          taxonomy: true,
        },
      });

      this.logger.log(
        `Created place ${place.id} for ${details.name} (${googlePlaceId})`,
      );

      return {
        success: true,
        place,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Error uploading place: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new HttpException(
        `Failed to upload place: ${error instanceof Error ? error.message : String(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Assign taxonomy to an existing place
   */
  @Patch(":id/taxonomy")
  async updatePlaceTaxonomy(
    @Param("id") id: string,
    @Body() dto: UpdatePlaceTaxonomyDto,
  ) {
    const { taxonomyId } = dto;

    try {
      const place = await this.prisma.place.findUnique({
        where: { id },
      });

      if (!place) {
        throw new HttpException(`Place not found`, HttpStatus.NOT_FOUND);
      }

      if (taxonomyId) {
        const taxonomy = await this.prisma.taxonomyNode.findUnique({
          where: { id: taxonomyId },
        });

        if (!taxonomy) {
          throw new HttpException(
            `Invalid taxonomyId: TaxonomyNode not found`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      const updatedPlace = await this.prisma.place.update({
        where: { id },
        data: {
          taxonomyId: taxonomyId || null,
        },
        include: {
          taxonomy: true,
        },
      });

      return {
        success: true,
        place: updatedPlace,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Failed to update place taxonomy: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw new HttpException(
        `Failed to update place taxonomy: ${error instanceof Error ? error.message : String(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
