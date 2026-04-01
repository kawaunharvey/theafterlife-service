import { IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

export class MatchBusinessesDto {
  @IsString()
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsNumber()
  maxResults?: number;
}
