import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class ListBusinessesDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return undefined;
  })
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsString()
  categoriesCsv?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? parseFloat(value) : undefined,
  )
  @IsNumber()
  @Min(-90)
  @Max(90)
  nearLat?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? parseFloat(value) : undefined,
  )
  @IsNumber()
  @Min(-180)
  @Max(180)
  nearLng?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? parseFloat(value) : undefined,
  )
  @IsNumber()
  @Min(0.5)
  @Max(500)
  radiusKm?: number = 50;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? parseInt(value, 10) : undefined,
  )
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? value === "true" : undefined,
  )
  @IsBoolean()
  includeServices?: boolean = true;
}

export class BusinessParamsDto {
  @IsString()
  id!: string;
}
