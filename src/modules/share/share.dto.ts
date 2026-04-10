import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { MemorialRelationshipKind, Visibility } from "@prisma/client";

export class MediaItemDto {
  @IsString()
  assetId: string;

  @IsString()
  url: string;
}

export class SubmitShareMemoryDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  body: string;

  @IsEnum(MemorialRelationshipKind)
  relationship: MemorialRelationshipKind;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  media?: MediaItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prompt?: string;

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualifiers?: string[];
}
