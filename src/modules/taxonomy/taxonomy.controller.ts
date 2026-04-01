import {
  Controller,
  Logger,
  Get,
  Query,
  Param,
  Post,
} from "@nestjs/common";
import { TaxonomyService } from "./taxonomy.service";
import {
  ListTaxonomyNodesQuery,
  PaginatedTaxonomyNodesResponseDto,
  ResolveKeysQuery,
  ResolveKeysResponseDto,
} from "./taxonomy.dto";


/**
 * TaxonomiesController
 * Handles taxonomy data operations including managing categories and tags
 */
@Controller("taxonomies")
export class TaxonomiesController {
  private readonly logger = new Logger(TaxonomiesController.name);

  constructor(private readonly taxonomyService: TaxonomyService) {}

  /**
   * Get paginated list of taxonomy nodes with optional filtering by kind
   * @param query - Query parameters for pagination and filtering
   * @returns Paginated list of taxonomy nodes
   */
  @Get()
  async listTaxonomyNodes(
    @Query() query: ListTaxonomyNodesQuery,
  ): Promise<PaginatedTaxonomyNodesResponseDto> {
    const skip = query.skip || 0;
    const take = query.take || 50;
    const kind = query.kind;

    const [nodes, total] = await Promise.all([
      this.taxonomyService.listTaxonomyNodes(kind, skip, take),
      
      
        this.taxonomyService.countTaxonomyNodes(kind),
    ]);

    return {
      data: nodes,
      pagination: {
        skip,
        take,
        total,
        hasMore: skip + take < total,
      },
    };
  }

  @Get("resolve")
  async resolveTaxonomyNodes(
    @Query() query: ResolveKeysQuery,
  ): Promise<ResolveKeysResponseDto> {
    const keys = query.keys
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);

    return this.taxonomyService.resolveTaxonomyNodesByKeys(Array.from(new Set(keys)));
  }

  @Get(":id")
  async getTaxonomyNode(@Param("id") id: string) {
    return this.taxonomyService.getTaxonomyNode(id);
  }

  @Post(":id/aliases")
  async createAlias(@Param("id") id: string, @Query("alias") alias: string) {
    return this.taxonomyService.createTaxonomyAlias({ taxonomyId: id, label: alias });
  }
}
