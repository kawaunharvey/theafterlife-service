import { IsString, MinLength } from "class-validator";

export class HandleAvailabilityDto {
  @IsString()
  @MinLength(1)
  handle!: string;
}
