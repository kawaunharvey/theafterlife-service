import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsEnum,
  ValidateNested,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export const UploadVisibility = ["PUBLIC", "UNLISTED", "PRIVATE"] as const;
export type UploadVisibility = (typeof UploadVisibility)[number];

export class FileMetaDto {
  @ApiProperty({ description: "Original filename" })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ description: "MIME type of the file" })
  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @ApiProperty({ description: "File size in bytes" })
  @IsNumber()
  @Min(1)
  sizeBytes!: number;
}

export class CreateUploadBootstrapDto {
  @ApiProperty({
    description: "List of files to upload",
    type: [FileMetaDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileMetaDto)
  files!: FileMetaDto[];

  @ApiProperty({
    description: "Visibility level of uploaded content",
    enum: UploadVisibility,
  })
  @IsEnum(UploadVisibility)
  visibility!: UploadVisibility;
  @ApiPropertyOptional({
    description:
      "Whether to apply image flipping based on EXIF orientation metadata",
  })
  @IsOptional()
  shouldFlip?: boolean;
}

export class UploadSessionDto {
  @ApiProperty({ description: "Upload session ID from Content Service" })
  sessionId!: string;

  @ApiProperty({ description: "Pre-signed URL for direct upload" })
  uploadUrl!: string;

  @ApiPropertyOptional({
    description: "Headers required for the signed upload URL",
  })
  signedHeaders?: Record<string, string>;

  @ApiProperty({ description: "Object name/key in storage" })
  objectName!: string;

  @ApiProperty({ description: "Session expiration timestamp" })
  expiresAt!: string;
}

export class CreateUploadBootstrapResponseDto {
  @ApiProperty({
    description: "Array of upload sessions with signed URLs",
    type: [UploadSessionDto],
  })
  sessions!: UploadSessionDto[];
}

export class CompleteUploadSessionDto {
  @ApiProperty({ description: "Upload session ID" })
  @IsString()
  @MaxLength(255)
  sessionId!: string;

  @ApiPropertyOptional({ description: "Optional metadata for the asset" })
  @IsOptional()
  assetMeta?: Record<string, unknown>;
}

export class CompleteUploadsDto {
  @ApiProperty({
    description: "Sessions to complete",
    type: [CompleteUploadSessionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteUploadSessionDto)
  sessions!: CompleteUploadSessionDto[];
}

export class UploadCompletionResultDto {
  @ApiProperty({ description: "Upload session ID" })
  sessionId!: string;

  @ApiPropertyOptional({ description: "Raw asset id from Content Service" })
  id?: string;

  @ApiProperty({ description: "Resulting asset ID from Content Service" })
  assetId!: string;

  @ApiPropertyOptional({ description: "Raw storage path from Content Service" })
  storagePath?: string;

  @ApiProperty({ description: "Object name" })
  objectName!: string;

  @ApiProperty({ description: "MIME type" })
  mimeType!: string;

  @ApiProperty({ description: "File size in bytes" })
  sizeBytes!: number;

  @ApiProperty({ description: "Upload timestamp" })
  uploadedAt!: string;

  @ApiProperty({ description: "Final URL for accessing the uploaded file" })
  readUrl!: string;

  @ApiPropertyOptional({ description: "Additional asset metadata" })
  shouldFlip?: boolean;
}

export class CompleteUploadsResponseDto {
  @ApiProperty({
    description: "Completion results for each session",
    type: [UploadCompletionResultDto],
  })
  results!: UploadCompletionResultDto[];
}

export class AssetVariantDto {
  @ApiProperty({ description: "Variant ID" })
  id!: string;

  @ApiProperty({
    description: "Type of variant",
    enum: ["THUMBNAIL", "TRANSCODE", "PREVIEW", "OPTIMIZED", "COVER"],
  })
  variantType!: "THUMBNAIL" | "TRANSCODE" | "PREVIEW" | "OPTIMIZED" | "COVER";

  @ApiProperty({ description: "MIME type of the variant" })
  mimeType!: string;

  @ApiPropertyOptional({ description: "File extension" })
  extension?: string;

  @ApiProperty({ description: "Storage path" })
  storagePath!: string;

  @ApiProperty({ description: "File size in bytes" })
  sizeBytes!: string;

  @ApiPropertyOptional({ description: "Width in pixels" })
  width?: number;

  @ApiPropertyOptional({ description: "Height in pixels" })
  height?: number;

  @ApiPropertyOptional({ description: "Duration in milliseconds" })
  durationMs?: number;

  @ApiPropertyOptional({ description: "Format description" })
  format?: string;

  @ApiPropertyOptional({ description: "Quality hint (0-100)" })
  qualityHint?: number;

  @ApiPropertyOptional({ description: "Public URL if available" })
  publicUrl?: string;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt!: Date;

  @ApiProperty({ description: "URL to access the variant" })
  readUrl!: string;
}

export class GetAssetVariantsResponseDto {
  @ApiProperty({
    description: "Array of asset variants (thumbnails, transcodes, etc.)",
    type: [AssetVariantDto],
  })
  variants!: AssetVariantDto[];
}
