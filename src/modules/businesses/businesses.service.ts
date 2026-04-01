import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * DEPRECATED: This service used old schema fields (primaryCategory, tags, serviceOfferings, googleSnapshot).
 * Use Blueprint v0.2.0 PlannerService for business discovery instead.
 * This stub maintains compatibility with existing endpoints but returns minimal data.
 */
@Injectable()
export class BusinessesService {
  private readonly logger = new Logger(BusinessesService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(query?: any) {
    this.logger.warn(
      "BusinessesService.findAll is deprecated. Use PlannerService instead.",
    );

    const businesses = await this.prisma.business.findMany({
      where: { isActive: true },
      take: query?.limit || 50,
      select: {
        id: true,
        name: true,
        description: true,
        phone: true,
        addressLine1: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        isActive: true,
      },
    });

    return businesses;
  }

  async findOne(id: string) {
    this.logger.warn(
      "BusinessesService.findOne is deprecated. Use PlannerService instead.",
    );

    return this.prisma.business.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        phone: true,
        addressLine1: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        isActive: true,
      },
    });
  }

  async findByPlaceId(placeId: string) {
    this.logger.warn("BusinessesService.findByPlaceId is deprecated.");

    return this.prisma.business.findFirst({
      where: {
        places: {
          some: {
            id: placeId,
          },
        },
      },
    });
  }

  async create(data: any) {
    this.logger.warn("BusinessesService.create is deprecated.");

    const business = await this.prisma.business.create({
      data: {
        name: data.name,
        description: data.description,
        phone: data.phone,
        addressLine1: data.addressLine1,
        city: data.city,
        state: data.state,
        latitude: data.latitude,
        longitude: data.longitude,
        taxonomyIds: data.taxonomyIds || [],
      },
    });

    return business;
  }

  async update(id: string, data: any) {
    this.logger.warn("BusinessesService.update is deprecated.");

    const previous = await this.prisma.business.findUnique({
      where: { id },
    });

    const business = await this.prisma.business.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        phone: data.phone,
        addressLine1: data.addressLine1,
        city: data.city,
        state: data.state,
        latitude: data.latitude,
        longitude: data.longitude,
      },
    });

    return business;
  }

  async delete(id: string) {
    this.logger.warn("BusinessesService.delete is deprecated.");

    const previous = await this.prisma.business.findUnique({
      where: { id },
    });

    const business = await this.prisma.business.update({
      where: { id },
      data: { isActive: false },
    });

    return business;
  }

  // Stub methods for controller compatibility
  async upsertFromCrownworks(data: any) {
    this.logger.warn("upsertFromCrownworks is deprecated.");
    return { success: true };
  }

  async listBusinesses(query: any) {
    return this.findAll(query);
  }

  async getBusinessProfile(id: string) {
    return this.findOne(id);
  }

  async updateBusiness(id: string, data: any) {
    return this.update(id, data);
  }

  async submitClaim(businessId: string, userId: string, data: any) {
    this.logger.warn("submitClaim is deprecated.");
    return { success: true };
  }

  async listClaimsForUser(userId: string) {
    this.logger.warn("listClaimsForUser is deprecated.");
    return [];
  }

  async approveClaim(claimId: string, userId: string) {
    this.logger.warn("approveClaim is deprecated.");
    return { success: true };
  }

  async rejectClaim(claimId: string, userId: string, reason: string) {
    this.logger.warn("rejectClaim is deprecated.");
    return { success: true };
  }
}
