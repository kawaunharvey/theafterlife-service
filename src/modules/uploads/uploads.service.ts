import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import {
  ContentServiceClient,
  CONTENT_POLICIES,
} from "../../common/http-client/content-service.client";
import {
  CreateUploadBootstrapDto,
  CompleteUploadsDto,
  UploadSessionDto,
  UploadCompletionResultDto,
  AssetVariantDto,
} from "./dto/upload.dto";

@Injectable()
export class UploadsService {
  private readonly logger = new Logger("UploadsService");

  constructor(private contentServiceClient: ContentServiceClient) {}

  /**
   * Bootstrap upload sessions: create sessions in Content Service and return signed URLs.
   */
  async bootstrapUploadSessions(
    dto: CreateUploadBootstrapDto,
  ): Promise<UploadSessionDto[]> {
    // Validate file constraints
    if (dto.files.length === 0) {
      throw new BadRequestException("At least one file is required");
    }

    if (dto.files.length > 50) {
      throw new BadRequestException("Maximum 50 files per batch");
    }

    for (const file of dto.files) {
      if (file.sizeBytes > 5 * 1024 * 1024 * 1024) {
        // 5GB limit
        throw new BadRequestException(
          `File ${file.filename} exceeds maximum size of 5GB`,
        );
      }
    }

    // Create sessions in Content Service
    const sessions: UploadSessionDto[] = [];

    for (const file of dto.files) {
      try {
        // Determine asset type based on MIME type
        const assetType = this.getAssetTypeFromMimeType(file.mimeType);

        // Choose appropriate policy based on visibility and asset type
        const policyId = this.selectPolicy(dto.visibility, assetType);

        const session = await this.contentServiceClient.createSession({
          policyId,
          originalFilename: file.filename,
          expectedMimeType: file.mimeType,
          assetType,
          expectedSizeBytes: file.sizeBytes,
          shouldFlip: dto.shouldFlip,
        });

        sessions.push({
          sessionId: session.id,
          uploadUrl: session.uploadUrl,
          signedHeaders: session.signedHeaders,
          objectName: session.objectName,
          expiresAt: session.expiresAt,
        });
      } catch (error) {
        this.logger.error(
          `Failed to create session for ${file.filename}`,
          error,
        );
        throw new BadRequestException(
          `Failed to create upload session for ${file.filename}`,
        );
      }
    }

    return sessions;
  }

  /**
   * Complete upload sessions in Content Service.
   */
  async completeUploadSessions(
    dto: CompleteUploadsDto,
  ): Promise<UploadCompletionResultDto[]> {
    if (dto.sessions.length === 0) {
      throw new BadRequestException("At least one session is required");
    }

    const results: UploadCompletionResultDto[] = [];

    for (const session of dto.sessions) {
      try {
        const completion = await this.contentServiceClient.completeSession(
          session.sessionId,
          session.assetMeta ? { assetMeta: session.assetMeta } : undefined,
        );

        results.push({
          sessionId: session.sessionId,
          id: completion.id,
          storagePath: completion.storagePath,
          assetId: completion.assetId ?? completion.id,
          objectName: completion.objectName ?? completion.storagePath,
          mimeType: completion.mimeType,
          sizeBytes: completion.sizeBytes,
          uploadedAt: completion.uploadedAt,
          readUrl: completion.readUrl,
        });
      } catch (error) {
        this.logger.error(
          `Failed to complete session ${session.sessionId}`,
          error,
        );
        throw new BadRequestException(
          `Failed to complete session ${session.sessionId}`,
        );
      }
    }

    return results;
  }

  /**
   * Get asset variants (thumbnails, transcodes, etc.) from Content Service.
   */
  async getAssetVariants(assetId: string): Promise<AssetVariantDto[]> {
    try {
      this.logger.debug(`Fetching variants for asset ${assetId}`);

      const variants =
        await this.contentServiceClient.getAssetVariants(assetId);

      // Map the response from content service to our DTO format
      return variants.map((variant) => ({
        id: variant.id,
        variantType: variant.variantType,
        mimeType: variant.mimeType,
        extension: variant.extension,
        storagePath: variant.storagePath,
        sizeBytes: variant.sizeBytes,
        width: variant.width,
        height: variant.height,
        durationMs: variant.durationMs,
        format: variant.format,
        qualityHint: variant.qualityHint,
        publicUrl: variant.publicUrl,
        createdAt: new Date(variant.createdAt),
        readUrl: variant.readUrl,
      }));
    } catch (error) {
      this.logger.error(`Failed to fetch variants for asset ${assetId}`, error);
      throw new BadRequestException(
        `Failed to fetch variants for asset ${assetId}`,
      );
    }
  }

  /**
   * Determine asset type based on MIME type.
   */
  private getAssetTypeFromMimeType(mimeType: string): "MEDIA" | "DOCUMENT" {
    if (
      mimeType.startsWith("image/") ||
      mimeType.startsWith("video/") ||
      mimeType.startsWith("audio/") ||
      mimeType === "application/octet-stream"
    ) {
      return "MEDIA";
    }
    return "DOCUMENT";
  }

  /**
   * Select appropriate policy based on visibility and asset type.
   */
  private selectPolicy(
    visibility: "PUBLIC" | "UNLISTED" | "PRIVATE",
    assetType: "MEDIA" | "DOCUMENT",
  ): string {
    if (assetType === "DOCUMENT") {
      return CONTENT_POLICIES.DOCUMENT;
    }

    const effectiveVisibility =
      visibility === "UNLISTED" ? "PRIVATE" : visibility;

    if (visibility === "UNLISTED") {
      this.logger.warn(
        `UNLISTED visibility received for upload; defaulting to PRIVATE policy`,
      );
    }

    if (effectiveVisibility === "PRIVATE") {
      return CONTENT_POLICIES.PRIVATE_MEDIA;
    }

    return CONTENT_POLICIES.GENERAL_MEDIA;
  }
}
