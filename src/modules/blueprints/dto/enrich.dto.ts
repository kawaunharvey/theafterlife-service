import { IsString, IsNumber, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class LocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class EnrichActionDto {
  @IsString()
  actionId!: string;

  @IsString()
  intentKey!: string;

  @ValidateNested()
  @Type(() => LocationDto)
  location!: LocationDto;

  @IsString()
  blueprintId!: string;

  @IsString()
  urgency!: string;
}
