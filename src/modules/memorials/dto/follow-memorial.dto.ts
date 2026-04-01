import { MemorialRelationshipKind } from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";

export class FollowMemorialDto {
  @IsEnum(MemorialRelationshipKind)
  relationship!: MemorialRelationshipKind;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  qualifier!: string[];

  @IsOptional()
  @IsString()
  notifications?: string;
}
