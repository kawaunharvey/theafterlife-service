import { Inject, Injectable, Logger } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import { PrismaService } from "../../prisma/prisma.service";
import { PostStatus, Visibility } from "@prisma/client";
import { Policy } from "./app-data.types";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AppDataService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private configService: ConfigService,
  ) {}

  private logger = new Logger(AppDataService.name);

  private mapToResponse(
    memorial: {
      id: string;
      slug: string;
      shortId: string | null;
      ownerUserId: string;
      displayName: string;
      salutation: string | null;
      yearOfBirth: number | null;
      yearOfPassing: number | null;
      bioSummary: string | null;
      tags: string[];
      visibility: Visibility;
      createdAt: Date;
      theme: string | null;
      updatedAt: Date;
      archivedAt: Date | null;
      obituaryId?: string | null;
      obituaryServiceSessionId?: string | null;
      coverAssetUrl?: string | null;
      coverAssetId?: string | null;
      fundraising?: {
        id: string;
        beneficiaryName: string | null;
        beneficiaryOnboardingStatus: string | null;
        beneficiaryExternalId: string | null;
      } | null;
      location: {
        googlePlaceId?: string | null;
        formattedAddress?: string | null;
        lat?: number | null;
        lng?: number | null;
        city?: string | null;
        state?: string | null;
        country?: string | null;
      } | null;
    },
    postsCount?: number,
  ) {
    return {
      id: memorial.id,
      slug: memorial.slug,
      displayName: memorial.displayName,
      salutation: memorial.salutation,
      yearOfBirth: memorial.yearOfBirth,
      yearOfPassing: memorial.yearOfPassing,
      location: memorial.location,
      bioSummary: memorial.bioSummary,
      tags: memorial.tags,
      visibility: memorial.visibility,
      ownerUserId: memorial.ownerUserId,
      createdAt: memorial.createdAt,
      updatedAt: memorial.updatedAt,
      archivedAt: memorial.archivedAt,
      fundraising: memorial.fundraising || undefined,
      obituaryId: memorial.obituaryId || null,
      coverAssetUrl: memorial.coverAssetUrl || null,
      coverAssetId: memorial.coverAssetId || null,
      obituaryServiceSessionId: memorial.obituaryServiceSessionId || null,
      theme: memorial.theme,
      postsCount: postsCount ?? 0,
      links: {
        iosAppUrl: `${this.configService.get("IOS_APP_SCHEMA")}://memorial/${memorial.id}`,
        androidAppUrl: `${this.configService.get("ANDROID_APP_SCHEMA")}://memorial/${memorial.id}`,
        webUrl: `${this.configService.get("SHARE_BASE_URL")}/memorial/${memorial.slug}`,
        shortUrl: `${this.configService.get("SHORT_URL_BASE")}/m/${memorial.shortId}`,
      },
    };
  }

  /**
   * Get all memorials closest to the user's location, prioritize most recent
   */
  async getNearbyMemorials(lat: number, lng: number, limit = 20, skip = 0) {
    // Haversine formula for distance calculation in MongoDB aggregation
    // Prisma does not support geo queries natively, so we use a workaround
    // We'll sort by proximity (approximate) and recency
    // Note: This assumes location.lat/lng are present
    const memorials = await this.prisma.memorial.findMany({
      where: {
        location: {
          isNot: null,
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit * 3, // fetch more to filter by distance in JS
      include: {
        location: true,
      },
    });
    // Calculate distance in JS (since Prisma/MongoDB doesn't support geo queries directly)
    const withDistance = memorials
      .map((m) => {
        const mLat = m.location?.lat;
        const mLng = m.location?.lng;
        if (typeof mLat !== "number" || typeof mLng !== "number") return null;
        const d = this.haversine(lat, lng, mLat, mLng);
        return { ...m, distance: d };
      })
      .filter(
        (m): m is (typeof memorials)[number] & { distance: number } => !!m,
      )
      .sort((a, b) => {
        if (!a || !b) return 0;
        return (
          a.distance - b.distance ||
          b.createdAt.getTime() - a.createdAt.getTime()
        );
      });
    const items = withDistance.slice(skip, skip + limit);
    // if there are not enough nearby memorials, fill in with most recent
    if (items.length < limit) {
      return await this.prisma.memorial.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: limit, // fetch more to filter by distance in JS
      });
    }
    return items;
  }

  /**
   * Get posts by creator, filterable by tags
   */
  async getCreatorPosts(creatorId: string, tags?: string[], limit = 20) {
    const where = {
      creatorId,
      status: PostStatus.PUBLISHED,
      ...(tags && tags.length > 0 ? { tags: { hasSome: tags } } : {}),
    };
    const posts = await this.prisma.memory.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: limit,
    });
    return posts;
  }

  getDemoUserData() {
    this.logger.log("Fetching demo user data");
    return {
      demoUser: {
        email: process.env.DEMO_USER_EMAIL,
        disabled: false,
        code: process.env.DEMO_USER_CODE,
        message:
          "All data associated with this demo user will be periodically deleted to reset the demo environment.",
      },
    };
  }

  async getPolicies() {
    // get from cache first
    const cacheKey = "app:policies";
    try {
      const cached = await this.cache.get<Policy[]>(cacheKey);
      if (cached) {
        this.logger.log("Returning cached policies");
        return {
          policies: cached,
        };
      }
    } catch (error) {
      this.logger.warn("Cache read failed, continuing without cache", error);
    }
    // # Legal
    // APP_TERMS_OF_SERVICE_URL="https://welcometotheafterlife.app/terms"
    // APP_PRIVACY_POLICY_URL="https://welcometotheafterlife.app/privacy"
    // APP_COMMUNITY_GUIDELINES_URL="https://welcometotheafterlife.app/guidelines"
    // APP_SUPPORT_URL="https://welcometotheafterlife.app/support"
    // APP_YOUR_DATA_URL="https://welcometotheafterlife.app/your-data"
    // APP_ABOUT_US_URL="https://welcometotheafterlife.app/about-us"

    this.logger.log("Fetching policies");
    const policyList = [
      {
        id: "aboutUs",
        url: process.env.APP_ABOUT_US_URL,
        label: "About Us",
      },
      {
        id: "termsOfService",
        url: process.env.APP_TERMS_OF_SERVICE_URL,
        label: "Terms of Service",
      },
      {
        id: "privacyPolicy",
        url: process.env.APP_PRIVACY_POLICY_URL,
        label: "Privacy Policy",
      },
      {
        id: "yourData",
        url: process.env.APP_YOUR_DATA_URL,
        label: "Your Data",
      },
      {
        id: "communityGuidelines",
        url: process.env.APP_COMMUNITY_GUIDELINES_URL,
        label: "Community Guidelines",
      },
      {
        id: "support",
        url: process.env.APP_SUPPORT_URL,
        label: "Help & Support",
      },
    ].filter((p) => Boolean(p.url));
    // cache policies in Redis for 1 hour
    try {
      await this.cache.set(cacheKey, policyList, 3600);
    } catch (error) {
      this.logger.warn("Cache write failed, continuing without cache", error);
    }
    return {
      policies: policyList,
    };
  }

  /**
   * Haversine formula for distance between two lat/lng points (km)
   */
  private haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async getAppVersion() {
    return {
      version: process.env.APP_VERSION || "unknown",
    };
  }
  /** Get application limits and restrictions
   */
  async getAppLimits() {
    return {
      maxSignUps: 1000,
      maxMemorialsPerUser: 1,
      inviteOnly: true,
      maxFundraisingProgramsPerUser: 1,
      maxFundraisingGoalAmountCents: 2000000, // $20,000
      maxAmountDonatedCents: 250000, // $2,500
      acceptedCurrencies: ["USD"],
      maxPostLimitPerUser: 25,
    };
  }

  private createSuggestion() {
    return {
      label: "Call key people",
      blockType: "contact",
    };
  }

  async getLedgerJournies() {
    const templates = [
      {
        id: "1",
        name: "An Expected Death",
        subtext:
          "Structure for the moment everything feels heavy, but not chaotic.",
        suggestions: [this.createSuggestion()],
      },
    ];

    const section1 = {
      title: "First 72 Hours",
      description:
        "Guidance for the most overwhelming window after a death—focused on stabilizing communication, decisions, and responsibilities when clarity is hardest.",
      templates: [templates[0]],
    };

    return {
      suggestions: [section1],
    };
  }

  async checkSession(sessionId: string): Promise<{
    active: boolean;
    expiresAt?: Date;
    userId?: string;
  }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { active: false };
    }

    const now = new Date();
    const isActive = session.expiresAt > now;

    return {
      active: isActive,
      expiresAt: session.expiresAt,
      userId: isActive ? session.userId : undefined,
    };
  }

  async getSalutationDecorators() {
    const decorators = await this.prisma.decorator.findMany({
      where: {
        type: "SALUTATION",
      },
      orderBy: {
        updatedAt: "asc",
      }
    });
    return {
      decorators,
    };
  }

  async getPromptDecorators({ limit = 8 }: { limit?: number } = {}) {
    // we should return just 3 random prompts

    const count = await this.prisma.decorator.count({
      where: {
        type: "PROMPT",
      },
    });

    const randomIndexes = new Set<number>();
    while (randomIndexes.size < Math.min(limit, count)) {
      randomIndexes.add(Math.floor(Math.random() * count));
    }

    const decorators = await this.prisma.decorator.findMany({
      where: {
        type: "PROMPT",
      },
      skip: Math.min(...randomIndexes),
      take: limit,
    });

    return {
      decorators,
    };  
  }

  async getPromptDecoratorById(id: string) {
    const decorator = await this.prisma.decorator.findUnique({
      where: {
        id,
        type: "PROMPT",
      },
    });

    return {
      decorator,
    };  
  }

  async getRelationshipDecorators() {
    const decorators = await this.prisma.decorator.findMany({
      where: {
        type: "RELATIONSHIP",
      },
      orderBy: {
        updatedAt: "asc",
      }
    });
    return {
      decorators,
    };
  }
}
