import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ShareService } from "./share.service";
import { SubmitShareMemoryDto } from "./share.dto";

@ApiTags("share")
@Controller("share")
export class ShareController {
    constructor(
        private readonly share: ShareService
    ) {}

    @Get("prompts")
    async getPromptList() {
        return this.share.getPromptList();
    }

    @Get("prompts/:id")
    async getPromptById(@Param("id") id: string) {
      return this.share.getPromptById(id);
    }

    @Get("memorial/:slug")
    async getMemorialBySlug(@Param("slug") slug: string) {
      return this.share.getMemorialBySlug(slug);
    }

    @Get("m/:id")
    async getMemorialById(@Param("id") id: string) {
      return this.share.getMemorialById(id);
    }

    @Get("location")
    async getLocationFromCoordinates(
      @Query("lat") lat: string,
      @Query("lng") lng: string,
    ) {
      return this.share.getLocationFromCoordinates(parseFloat(lat), parseFloat(lng));
    }

    @Post("memorial/:id/memories")
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
      summary: "Submit a memory for a memorial",
      description: "Public endpoint — finds or creates a user account for the provided email, establishes a memorial relationship, and creates the memory.",
    })
    @ApiResponse({ status: HttpStatus.CREATED, description: "Memory created successfully" })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Memorial not found" })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: "Memorial is not active" })
    async submitMemory(
      @Param("id") id: string,
      @Body() dto: SubmitShareMemoryDto,
    ) {
      return this.share.submitMemory(id, dto);
    }

    @Get("relationships")
    @ApiOperation({
      summary: "Get list of memorial relationship types",
      description: "Returns the list of relationship types that can be associated with a memory.",
    })
    @ApiResponse({ status: HttpStatus.OK, description: "List of relationships retrieved successfully" })
    async getRelationships() {
      return this.share.getRelationships();
    }
}
