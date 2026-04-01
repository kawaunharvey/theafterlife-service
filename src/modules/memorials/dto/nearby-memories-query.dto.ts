import { Transform } from "class-transformer";
import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class NearbyMemoriesQueryDto {
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
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : 1000))
  @IsNumber()
  @Min(1)
  @Max(50000)
  radiusMeters?: number = 1000;

  @IsOptional()
  @IsString()
  cursor?: string;
}
