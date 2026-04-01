import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

class ClaimedLinkDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  type?: string;
}

export class UpsertBusinessDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  primaryCategory?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClaimedLinkDto)
  links?: ClaimedLinkDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? Number.parseFloat(value) : value,
  )
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? Number.parseFloat(value) : value,
  )
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  @IsBoolean()
  claimed?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  providerAccountId?: string | null;
}
