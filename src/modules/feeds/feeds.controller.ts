import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/modules/auth/decorators/current-user.decorator";
import { UseJwtAuth } from "@/modules/auth/decorators/use-jwt-auth.decorator";
import { FeedsService } from "./feeds.service";

type JwtUser = { sub?: string };

function requireUser(user: JwtUser | undefined): string {
  if (!user?.sub) throw new UnauthorizedException();
  return user.sub;
}

@ApiTags("feeds")
@Controller("feeds")
export class FeedsController {
  constructor(private readonly feedsService: FeedsService) {}

  @Get("memorial/:memorialId")
  getMemorialFeed(
    @Param("memorialId") memorialId: string,
    @Query("offset") offset?: string,
    @Query("limit") limit?: string,
    @Query("excludeMemoryId") excludeMemoryId?: string,
  ) {
    return this.feedsService.getMemorialFeed(
      memorialId,
      offset ? parseInt(offset, 10) : 0,
      limit ? parseInt(limit, 10) : 20,
      excludeMemoryId,
    );
  }

  @Get("following")
  @UseJwtAuth()
  getFollowingFeed(
    @CurrentUser() user: JwtUser,
    @Query("offset") offset?: string,
    @Query("limit") limit?: string,
  ) {
    return this.feedsService.getFollowingFeed(
      requireUser(user),
      offset ? parseInt(offset, 10) : 0,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get("nearby")
  @UseJwtAuth()
  getNearbyFeed(
    @CurrentUser() user: JwtUser,
    @Query("lat") lat: string,
    @Query("lng") lng: string,
    @Query("offset") offset?: string,
    @Query("limit") limit?: string,
  ) {
    return this.feedsService.getNearbyFeed(
      requireUser(user),
      parseFloat(lat),
      parseFloat(lng),
      offset ? parseInt(offset, 10) : 0,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get("memory/:memoryId")
  async getMemory(@Param("memoryId") memoryId: string) {
    const memory = await this.feedsService.getMemoryById(memoryId);
    if (!memory) throw new NotFoundException("Memory not found");
    return memory;
  }

  // Keep /feeds/fallback for backward compat — alias to following feed
  @Get("fallback")
  @UseJwtAuth()
  getFallbackFeed(
    @CurrentUser() user: JwtUser,
    @Query("offset") offset?: string,
    @Query("limit") limit?: string,
  ) {
    return this.feedsService.getFollowingFeed(
      requireUser(user),
      offset ? parseInt(offset, 10) : 0,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
