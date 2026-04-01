import {
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";

class ParsedNodeDto {
  @IsString()
  key!: string;

  @IsIn(["DTE", "INTENT", "TAG"])
  kind!: "DTE" | "INTENT" | "TAG";

  @IsNumber()
  confidence!: number;

  @IsIn(["confirmed", "provisional"])
  status!: "confirmed" | "provisional";
}

class ParseLocationDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  resolved?: boolean;
}

class ParseLocationsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ParseLocationDto)
  user?: ParseLocationDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ParseLocationDto)
  event?: ParseLocationDto | null;
}

export class BuildBlueprintDto {
  @IsString()
  parseId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParsedNodeDto)
  nodes!: ParsedNodeDto[];

  @ValidateNested()
  @Type(() => ParseLocationsDto)
  locations!: ParseLocationsDto;

  @IsString()
  rawInput!: string;

  @IsOptional()
  @IsString()
  memorialId?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
