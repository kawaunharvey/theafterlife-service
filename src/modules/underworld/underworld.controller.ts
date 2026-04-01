import { Controller, Get, Param, Query, Logger } from "@nestjs/common";
import { UnderworldService } from "./underworld.service";
import {
  SearchMemorialsDto,
  SearchPlacesDto,
  SearchTaxonomiesDto,
  PaginatedResponse,
  MemorialSearchResult,
  PlaceSearchResult,
  TaxonomySearchResult,
  ProviderDetailDto,
} from "./underworld.dto";
import { UseApiKeyAuth } from "../auth/decorators/use-api-key-auth.decorator"

/**
 * UnderworldController
 * Provides public API endpoints for searching across memorials, places, and taxonomies.
 * These endpoints are designed for API-connected applications.
 */
// @UseApiKeyAuth() // Apply API key authentication to all endpoints in this controller
@Controller("api/underworld")
export class UnderworldController {
  private readonly logger = new Logger(UnderworldController.name);

  constructor(private readonly underworldService: UnderworldService) {}

  /**
   * Get a single provider by underworld ID
   * GET /api/underworld/providers/:uwId
   *
   * uwId format: "biz_{objectId}" for businesses, "plc_{objectId}" for places.
   * This ID is returned on every ScoredBusiness in plan execution results.
   *
   * Example: GET /api/underworld/providers/biz_507f1f77bcf86cd799439011
   */
  @Get("providers/:uwId")
  async getProvider(@Param("uwId") uwId: string): Promise<ProviderDetailDto> {
    this.logger.debug(`Fetching provider: ${uwId}`);
    return this.underworldService.getProviderById(uwId);
  }

  /**
   * Search across memorials
   * GET /api/underworld/memorials/search
   *
   * Query parameters:
   * - query: Search string to filter memorials by name, bio summary, or tags
   * - visibility: Filter by visibility (PUBLIC, UNLISTED, PRIVATE)
   * - status: Filter by status (ACTIVE, ARCHIVED)
   * - verificationStatus: Filter by verification status
   * - sortBy: Sort field (createdAt, displayName, updatedAt) - default: createdAt
   * - sortOrder: Sort order (asc, desc) - default: desc
   * - page: Page number (default: 1)
   * - limit: Results per page (default: 10, max: 100)
   *
   * Example: GET /api/underworld/memorials/search?query=John&visibility=PUBLIC&page=1&limit=20
   */
  @Get("memorials/search")
  async searchMemorials(
    @Query() dto: SearchMemorialsDto,
  ): Promise<PaginatedResponse<MemorialSearchResult>> {
    this.logger.debug(
      `Searching memorials with query: ${JSON.stringify(dto)}`,
    );
    return this.underworldService.searchMemorials(dto);
  }

  /**
   * Search across places
   * GET /api/underworld/places/search
   *
   * Query parameters:
   * - query: Search string to filter places by name or address
  * - taxonomyId: Filter by taxonomy ID
   * - minRating: Filter places with minimum Google rating
   * - claimed: Filter by claimed status (true, false)
   * - sortBy: Sort field (createdAt, name, rating) - default: createdAt
   * - sortOrder: Sort order (asc, desc) - default: desc
   * - page: Page number (default: 1)
   * - limit: Results per page (default: 10, max: 100)
   *
   * Example: GET /api/underworld/places/search?query=funeral&minRating=4.0&page=1&limit=20
   */
  @Get("places/search")
  async searchPlaces(
    @Query() dto: SearchPlacesDto,
  ): Promise<PaginatedResponse<PlaceSearchResult>> {
    this.logger.debug(
      `Searching places with query: ${JSON.stringify(dto)}`,
    );
    return this.underworldService.searchPlaces(dto);
  }

  /**
   * Search across taxonomies
   * GET /api/underworld/taxonomies/search
   *
   * Query parameters:
   * - query: Search string to filter taxonomies by name, key, or description
   * - kind: Filter by taxonomy kind (DTE, CATEGORY, TAG, SERVICE, INTENT)
   * - parentId: Filter by parent taxonomy ID (for hierarchical queries)
   * - isActive: Filter by active status (true, false)
   * - sortBy: Sort field (createdAt, name, key) - default: createdAt
   * - sortOrder: Sort order (asc, desc) - default: desc
   * - page: Page number (default: 1)
   * - limit: Results per page (default: 10, max: 100)
   *
   * Example: GET /api/underworld/taxonomies/search?kind=SERVICE&query=cremation&page=1&limit=20
   */
  @Get("taxonomies/search")
  async searchTaxonomies(
    @Query() dto: SearchTaxonomiesDto,
  ): Promise<PaginatedResponse<TaxonomySearchResult>> {
    this.logger.debug(
      `Searching taxonomies with query: ${JSON.stringify(dto)}`,
    );
    return this.underworldService.searchTaxonomies(dto);
  }
}
