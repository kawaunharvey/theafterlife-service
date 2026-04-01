import { IsArray, IsInt, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class ListAliasesQueryDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taxonomyKeys?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}

export interface AliasResponseDto {
  id: string;
  label: string;
  createdAt: Date;
  taxonomy: {
    id: string;
    key: string;
    name: string;
    kind: string;
  };
}

export interface PaginatedAliasResponseDto {
  data: AliasResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
