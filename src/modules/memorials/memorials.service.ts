import { Injectable } from "@nestjs/common";
import { FollowTargetType, Memorial, MemorialStatus, Visibility } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateMemorialDto, UpdateMemorialDto } from "./dto/memorial.dto";
import { SearchMemorialsQueryDto } from "./dto/search-memorials-query.dto";

const MEMORIAL_SELECT = {
  id: true,
  slug: true,
  shortId: true,
  displayName: true,
  coverAssetUrl: true,
  salutation: true,
  yearOfBirth: true,
  yearOfPassing: true,
  theme: true,
  visibility: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class MemorialsService {
  constructor(private readonly prisma: PrismaService) {}

    async getMemorialById(id: string): Promise<Memorial | null> {
        return await this.prisma.memorial.findUnique({
            where: { id },
        });
    }

  /**
   * Returns all memorials the user owns or follows, de-duplicated,
   * with a `connection` field indicating "OWNER", "FOLLOWING", or "BOTH".
   */
  async getUserConnectedMemorials(userId: string) {
    const [owned, follows] = await Promise.all([
      this.prisma.memorial.findMany({
        where: { ownerUserId: userId },
        select: MEMORIAL_SELECT,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.follow.findMany({
        where: {
          userId,
          targetType: FollowTargetType.MEMORIAL,
        },
        select: { targetId: true },
      }),
    ]);

    const followedIds = new Set(follows.map((f) => f.targetId));
    const ownedIds = new Set(owned.map((m) => m.id));

    // Fetch followed memorials that aren't already in the owned list
    const followOnlyIds = [...followedIds].filter((id) => !ownedIds.has(id));

    const followedMemorials =
      followOnlyIds.length > 0
        ? await this.prisma.memorial.findMany({
            where: { id: { in: followOnlyIds } },
            select: MEMORIAL_SELECT,
            orderBy: { createdAt: "desc" },
          })
        : [];

    const results = [
      ...owned.map((m) => ({
        ...m,
        connection: followedIds.has(m.id)
          ? ("BOTH" as const)
          : ("OWNER" as const),
      })),
      ...followedMemorials.map((m) => ({
        ...m,
        connection: "FOLLOWING" as const,
      })),
    ];

    return { memorials: results, total: results.length };
  }

  async createMemorial({ salutationDecoratorId, ...data }: CreateMemorialDto, ownerUserId: string) {

    let salutation = "In loving memory of";

    if (salutationDecoratorId) {
        const decorator = await this.prisma.decorator.findUnique({
            where: { id: salutationDecoratorId },
        });
        if (decorator) {
            salutation = decorator.textValue ?? salutation;
        }
    }

    const shortId = await this.generateMemorialShortId();
    const slug = await this.generateMemorialSlug(data.displayName, data.yearOfPassing ?? 0, data.yearOfBirth ?? 0, shortId);
    const shareUrl = await this.memorialShareLinkFromSlug(slug);

    return this.prisma.$transaction(async (tx) => {
      const memorial = await tx.memorial.create({
        data: {
          ...data,
          slug,
          shortId,
          salutationDecoratorId,
          salutation,
          ownerUserId,
          shareUrl,
        },
      });

      await tx.follow.create({
        data: {
          userId: ownerUserId,
          targetType: FollowTargetType.MEMORIAL,
          targetId: memorial.id,
        },
      });

      return memorial;
    });
  }

  async updateMemorial(id: string, updateData: UpdateMemorialDto, ownerUserId: string) {
    const memorial = await this.prisma.memorial.findUnique({ where: { id, ownerUserId } });
    if (!memorial) {
      throw new Error("Memorial not found");
    }

    let salutation = memorial.salutation;

    if (updateData.salutationDecoratorId && updateData.salutationDecoratorId !== memorial.salutationDecoratorId) {
        const decorator = await this.prisma.decorator.findUnique({
            where: { id: updateData.salutationDecoratorId },
        });
        if (decorator) {
            salutation = decorator.textValue ?? salutation;
        }
    }

    return await this.prisma.memorial.update({
      where: { id },
      data: {
        ...updateData,
        salutation,
      },
    });
  
  }

  async searchMemorials(dto: SearchMemorialsQueryDto) {
    const cursorId = dto.cursor
      ? (JSON.parse(Buffer.from(dto.cursor, "base64url").toString()).id as string)
      : undefined;

    const memorials = await this.prisma.memorial.findMany({
      where: {
        displayName: { contains: dto.q, mode: "insensitive" },
        visibility: Visibility.PUBLIC,
        status: MemorialStatus.ACTIVE,
      },
      select: MEMORIAL_SELECT,
      orderBy: { createdAt: "desc" },
      take: 21,
      ...(cursorId && { cursor: { id: cursorId }, skip: 1 }),
    });

    const hasMore = memorials.length > 20;
    const results = hasMore ? memorials.slice(0, 20) : memorials;
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ id: results[results.length - 1].id })).toString("base64url")
      : undefined;

    return { memorials: results, nextCursor };
  }

  async generateMemorialShortId(): Promise<string> {
    const generateShortId = () => {
      return Math.random().toString(36).substring(2, 8);
    };

    let shortId = generateShortId();
    while (await this.prisma.memorial.findUnique({ where: { shortId } })) {
      shortId = generateShortId();
    }

    return shortId;
  }

  async generateMemorialSlug(displayName: string, yearOfPassing: number, yearOfBirth: number, shortId: string): Promise<string> {
    const baseSlug = `${displayName}-${yearOfBirth}-${yearOfPassing}-${shortId}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50); // limit slug length

    let slug = baseSlug;
    let suffix = 1;

    while (await this.prisma.memorial.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    return slug;
  }

  async memorialShareLinkFromSlug(slug: string): Promise<string> {
    return `https://share.welcometotheafterlife.app/m/${slug}`;
  }
}
