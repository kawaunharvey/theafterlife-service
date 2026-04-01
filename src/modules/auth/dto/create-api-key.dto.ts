import { IsArray, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateApiKeyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions: string[] = [];

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimit?: number;
}
