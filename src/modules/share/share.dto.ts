import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { MemorialRelationshipKind, Visibility } from "@prisma/client";

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
  @IsString({ each: true })
  media?: string[];

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
