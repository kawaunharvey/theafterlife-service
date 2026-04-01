import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiBody,
  ApiParam,
} from "@nestjs/swagger";
import { UploadsService } from "./uploads.service";
import {
  CreateUploadBootstrapDto,
  CompleteUploadsDto,
  CreateUploadBootstrapResponseDto,
  CompleteUploadsResponseDto,
  GetAssetVariantsResponseDto,
} from "./dto/upload.dto";

@ApiTags("uploads")
@Controller("uploads")
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  /**
   * Bootstrap upload sessions for direct client-to-Content-Service uploads.
   */
  @Post("bootstrap")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create upload sessions with pre-signed URLs",
    description:
      "Request upload sessions from Content Service and return pre-signed URLs for direct file uploads",
  })
  @ApiBody({ type: CreateUploadBootstrapDto })
  @ApiCreatedResponse({
    type: CreateUploadBootstrapResponseDto,
    description: "Array of upload sessions with signed URLs",
  })
  async bootstrapUploadSessions(
    @Body() dto: CreateUploadBootstrapDto,
  ): Promise<CreateUploadBootstrapResponseDto> {
    const sessions = await this.uploadsService.bootstrapUploadSessions(dto);
    return { sessions };
  }

  /**
   * Complete upload sessions and finalize assets in Content Service.
   */
  @Post("complete")
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // Allow extra properties for debugging
      transform: true,
    }),
  )
  @ApiOperation({
    summary: "Complete upload sessions",
    description:
      "Finalize uploaded sessions in Content Service and retrieve asset IDs",
  })
  @ApiBody({ type: CompleteUploadsDto })
  @ApiOkResponse({
    type: CompleteUploadsResponseDto,
    description: "Completion results with final asset IDs",
  })
  async completeUploadSessions(
    @Body() dto: CompleteUploadsDto,
  ): Promise<CompleteUploadsResponseDto> {
    const results = await this.uploadsService.completeUploadSessions(dto);
    return { results };
  }

  /**
   * Get asset variants (thumbnails, transcodes, etc.) for a specific asset.
   */
  @Get("assets/:assetId/variants")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get asset variants",
    description:
      "Fetch all variants (thumbnails, transcodes, etc.) for a specific asset from Content Service",
  })
  @ApiParam({
    name: "assetId",
    description: "Asset ID from Content Service",
    type: String,
  })
  @ApiOkResponse({
    type: GetAssetVariantsResponseDto,
    description: "Asset variants with URLs",
  })
  async getAssetVariants(
    @Param("assetId") assetId: string,
  ): Promise<GetAssetVariantsResponseDto> {
    const variants = await this.uploadsService.getAssetVariants(assetId);
    return { variants };
  }
}
