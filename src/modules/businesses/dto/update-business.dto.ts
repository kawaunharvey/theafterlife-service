import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  claimedName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  claimedDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  claimedPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  claimedWebsiteUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  claimedAddressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  claimedAddressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  claimedCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  claimedState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  claimedPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  claimedCountry?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : value))
  @IsNumber()
  claimedLatitude?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : value))
  @IsNumber()
  claimedLongitude?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
