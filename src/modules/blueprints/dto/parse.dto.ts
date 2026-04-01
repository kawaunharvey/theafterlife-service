import { IsString, IsOptional, IsNumber, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class LocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class ParseBlueprintDto {
  @IsString()
  input!: string;

  @IsString()
  locale!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional()
  @IsString()
  memorialId?: string;
}
