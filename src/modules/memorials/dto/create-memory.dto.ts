import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Visibility } from "@prisma/client";

export class CreateMemoryDto {
  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  body: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assetIds?: string[];

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prompt?: string;
}
