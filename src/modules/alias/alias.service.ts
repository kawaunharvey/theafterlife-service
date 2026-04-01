import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AliasResponseDto,
  ListAliasesQueryDto,
  PaginatedAliasResponseDto,
} from "./alias.dto";

@Injectable()
export class AliasService {
  private readonly logger = new Logger(AliasService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listAliases(
    query: ListAliasesQueryDto,
  ): Promise<PaginatedAliasResponseDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (query.taxonomyKeys && query.taxonomyKeys.length > 0) {
      where.taxonomy = {
        key: {
          in: query.taxonomyKeys,
        },
      };
    }

    this.logger.debug(
      `Listing aliases: page=${page}, limit=${limit}, where=${JSON.stringify(where)}`,
    );

    // Execute query with pagination
    const [aliases, total] = await Promise.all([
      this.prisma.taxonomyAlias.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          taxonomy: {
            select: {
              id: true,
              key: true,
              name: true,
              kind: true,
            },
          },
        },
      }),
      this.prisma.taxonomyAlias.count({ where }),
    ]);

    const data: AliasResponseDto[] = aliases.map((alias) => ({
      id: alias.id,
      label: alias.label,
      createdAt: alias.createdAt,
      taxonomy: {
        id: alias.taxonomy.id,
        key: alias.taxonomy.key,
        name: alias.taxonomy.name,
        kind: alias.taxonomy.kind,
      },
    }));

    const totalPages = Math.ceil(total / limit);

    this.logger.log(
      `Found ${data.length} aliases (page ${page}/${totalPages}, total ${total})`,
    );

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}
