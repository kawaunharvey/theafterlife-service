import { Transform } from "class-transformer";
import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class HomepageMarkersQueryDto {
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : 10000))
  @IsNumber()
  @Min(1)
  @Max(50000)
  radiusMeters?: number = 10000;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 20))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  cursor?: string;
}
