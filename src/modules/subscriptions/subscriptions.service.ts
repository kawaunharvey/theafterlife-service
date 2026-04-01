import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";
import { Env } from "@/config/env";

@Injectable()
export class SubscriptionsService {
  private readonly cap: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.cap = config.get("LIFETIME_MEMBERSHIP_CAP", { infer: true });
  }

  async getLifetimeAvailability(): Promise<{ available: boolean; remaining: number }> {
    const count = await this.prisma.user.count({
      where: { entitlement: "memorial_lifetime" },
    });
    const remaining = Math.max(0, this.cap - count);
    return { available: remaining > 0, remaining };
  }

  async grantLifetimeEntitlement(userId: string, purchasedAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        entitlement: "memorial_lifetime",
        foundingMember: true,
        discoveryRangeMeters: this.config.get("DISCOVERY_RANGE_LIFETIME_METERS", { infer: true }),
        anchorLimit: 2,
        purchasedAt,
      },
    });
  }

  async restoreLifetimeEntitlement(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        entitlement: "memorial_lifetime",
        foundingMember: true,
        discoveryRangeMeters: this.config.get("DISCOVERY_RANGE_LIFETIME_METERS", { infer: true }),
        anchorLimit: 2,
      },
    });
  }

  async revokeEntitlement(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        entitlement: "memorial_free",
        discoveryRangeMeters: this.config.get("DISCOVERY_RANGE_FREE_METERS", { infer: true }),
        anchorLimit: 0,
      },
    });
  }
}
