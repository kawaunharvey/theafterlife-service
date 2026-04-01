import { IsOptional, IsString, MinLength } from "class-validator";

export class SearchMemorialsQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}
