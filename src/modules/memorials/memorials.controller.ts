import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/modules/auth/decorators/current-user.decorator";
import { UseJwtAuth } from "@/modules/auth/decorators/use-jwt-auth.decorator";
import { MemorialsService } from "./memorials.service";
import { MemorialFollowService } from "./memorial-follow.service";
import { MemoryService } from "./memory.service";
import { ObituaryService } from "./obituary.service";
import { MarkerService } from "./marker.service";
import { FollowMemorialDto } from "./dto/follow-memorial.dto";
import { CreateMemoryDto } from "./dto/create-memory.dto";
import { NearbyMemoriesQueryDto } from "./dto/nearby-memories-query.dto";
import { HomepageMarkersQueryDto } from "./dto/homepage-markers-query.dto";
import { CreateMemorialDto, UpdateMemorialDto } from "./dto/memorial.dto";
import { PlaceAnchorDto } from "./dto/place-anchor.dto";
import { SearchMemorialsQueryDto } from "./dto/search-memorials-query.dto";
import { AnchorService } from "./anchor.service";

type JwtUser = { sub?: string };

function requireUser(user: JwtUser | undefined): string {
  if (!user?.sub) throw new UnauthorizedException();
  return user.sub;
}

@ApiTags("memorials")
@Controller("memorials")
export class MemorialsController {
  constructor(
    private readonly memorialsService: MemorialsService,
    private readonly followService: MemorialFollowService,
    private readonly memoryService: MemoryService,
    private readonly obituaryService: ObituaryService,
    private readonly anchorService: AnchorService,
    private readonly markerService: MarkerService,
  ) {}

  // ── My Memorials ───────────────────────────────────────────────────────────

  @Get("me")
  @UseJwtAuth()
  getMyMemorials(@CurrentUser() user: JwtUser) {
    return this.memorialsService.getUserConnectedMemorials(requireUser(user));
  }

  // ── Search ───────────────────────────────────────────────────────────────────

  @Get("search")
  searchMemorials(@Query() query: SearchMemorialsQueryDto) {
    return this.memorialsService.searchMemorials(query);
  }

  // ── Manage Memorials ─────────────────────────────────────────────────────────

  @Post()
  @UseJwtAuth()
  createMemorial(
    @CurrentUser() user: JwtUser,
    @Body() data: CreateMemorialDto,
  ) {
    return this.memorialsService.createMemorial(data, requireUser(user));
  }

  @Get(":id")
  getMemorial(@Param("id") id: string) {
    return this.memorialsService.getMemorialById(id);
  }

  @Patch(":id")
  @UseJwtAuth()
  updateMemorial(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() data: UpdateMemorialDto,
  ) {
    return this.memorialsService.updateMemorial(id, data, requireUser(user));
  }

  // ── Follow ──────────────────────────────────────────────────────────────────

  @Post(":id/follow")
  @UseJwtAuth()
  followMemorial(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() dto: FollowMemorialDto,
  ) {
    return this.followService.followMemorial(requireUser(user), id, dto);
  }

  @Delete(":id/follow")
  @UseJwtAuth()
  unfollowMemorial(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.followService.unfollowMemorial(requireUser(user), id);
  }

  @Get(":id/follow")
  @UseJwtAuth()
  isFollowing(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.followService.isFollowing(requireUser(user), id);
  }

  // ── Marker feeds ─────────────────────────────────────────────────────────────

  @Get("markers/homepage")
  @UseJwtAuth()
  getHomepageMarkers(
    @CurrentUser() user: JwtUser,
    @Query() query: HomepageMarkersQueryDto,
  ) {
    return this.markerService.getHomepageMarkers(
      requireUser(user),
      query.lat,
      query.lng,
      query.radiusMeters ?? 10000,
      query.cursor,
      query.limit ?? 20,
    );
  }

  // ── Memories — static routes MUST come before :id parameterised routes ──────

  @Get("memories/created")
  @UseJwtAuth()
  getMyCreatedMemories(
    @CurrentUser() user: JwtUser,
    @Query("cursor") cursor?: string,
  ) {
    return this.memoryService.getMyCreatedMemories(requireUser(user), cursor);
  }

  @Get("memories/nearby")
  @UseJwtAuth()
  discoverNearby(
    @CurrentUser() user: JwtUser,
    @Query() query: NearbyMemoriesQueryDto,
  ) {
    return this.memoryService.discoverNearby(
      requireUser(user),
      query.lat,
      query.lng,
      query.cursor,
    );
  }

  @Get("memories/discovered")
  @UseJwtAuth()
  getDiscoveredMemories(@CurrentUser() user: JwtUser, @Query("cursor") cursor?: string) {
    return this.memoryService.getDiscoveredMemories(requireUser(user), cursor);
  }

  @Post("memories/discover-nearby")
  @UseJwtAuth()
  discoverNearbyBulk(
    @CurrentUser() user: JwtUser,
    @Body() body: { lat: number; lng: number },
  ) {
    return this.markerService.discoverNearbyBulk(
      requireUser(user),
      body.lat,
      body.lng,
    );
  }

  @Get("memories/:id")
  async getMemoryById(@Param("id") memoryId: string) {
    const memory = await this.memoryService.getMemoryById(memoryId);
    if (!memory) throw new NotFoundException("Memory not found");
    return memory;
  }

  @Get("memories/recently-discovered")
  @UseJwtAuth()
  getRecentlyDiscoveredMemories(
    @CurrentUser() user: JwtUser,
    @Query("days") days?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.markerService.getRecentlyDiscoveredMemories(
      requireUser(user),
      days !== undefined ? parseInt(days, 10) : undefined,
      cursor,
      limit !== undefined ? parseInt(limit, 10) : 20,
    );
  }

  @Post("memories/:id/discover")
  @UseJwtAuth()
  recordDiscovery(
    @CurrentUser() user: JwtUser,
    @Param("id") memoryId: string,
  ) {
    return this.memoryService.recordDiscovery(requireUser(user), memoryId);
  }

  @Post(":id/memories")
  @UseJwtAuth()
  createMemory(
    @CurrentUser() user: JwtUser,
    @Param("id") memorialId: string,
    @Body() dto: CreateMemoryDto,
  ) {
    return this.memoryService.createMemory(requireUser(user), memorialId, dto);
  }

  @Get(":id/memories")
  @UseJwtAuth()
  getMemorialMemories(
    @Param("id") memorialId: string,
    @Query("cursor") cursor?: string,
    @Query("userId") userId?: string,
  ) {
    return this.memoryService.getMemorialMemories(memorialId, cursor, userId);
  }

  @Get(":id/markers")
  @UseJwtAuth()
  getMemorialMarkers(
    @CurrentUser() user: JwtUser,
    @Param("id") memorialId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.markerService.getMemorialMarkers(
      memorialId,
      requireUser(user),
      cursor,
      limit !== undefined ? parseInt(limit, 10) : 20,
    );
  }

  // ── Anchors ───────────────────────────────────────────────────────────────────

  @Post(":id/anchors")
  @UseJwtAuth()
  placeAnchor(
    @CurrentUser() user: JwtUser,
    @Param("id") memorialId: string,
    @Body() dto: PlaceAnchorDto,
  ) {
    return this.anchorService.placeAnchor(requireUser(user), memorialId, dto.lat, dto.lng);
  }

  @Delete(":id/anchors/:anchorId")
  @UseJwtAuth()
  removeAnchor(
    @CurrentUser() user: JwtUser,
    @Param("anchorId") anchorId: string,
  ) {
    return this.anchorService.removeAnchor(anchorId, requireUser(user));
  }

  @Get(":id/anchors")
  listAnchors(@Param("id") memorialId: string) {
    return this.anchorService.listAnchors(memorialId);
  }

  @Get(":id/memories/discovered")
  @UseJwtAuth()
  getDiscoveredMemoriesForMemorial(
    @CurrentUser() user: JwtUser,
    @Param("id") memorialId: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.memoryService.getDiscoveredMemoriesForMemorial(
      requireUser(user),
      memorialId,
      cursor,
    );
  }

  // ── Obituary ─────────────────────────────────────────────────────────────────

  @Get(":id/obituary")
  @UseJwtAuth()
  getLiveObituary(@CurrentUser() user: JwtUser, @Param("id") memorialId: string) {
    return this.obituaryService.getLiveObituary(memorialId, requireUser(user));
  }

  @Post(":id/obituary/regenerate")
  @UseJwtAuth()
  triggerObituaryRegeneration(@CurrentUser() user: JwtUser, @Param("id") memorialId: string) {
    return this.obituaryService.triggerRegeneration(memorialId, requireUser(user));
  }
}
