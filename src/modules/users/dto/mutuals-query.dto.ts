import { IsOptional, IsString } from "class-validator";

export class MutualsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}
