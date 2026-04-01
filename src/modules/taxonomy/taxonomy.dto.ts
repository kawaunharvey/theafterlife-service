import { IsOptional, IsNumber, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class ResolveKeysQuery {
  @IsString()
  keys: string;
}

export type ResolveKeysResponseDto = Record<string, string>;

export class ListTaxonomyNodesQuery {
  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  take?: number = 50;
}

export class TaxonomyNodeResponseDto {
  id: string;
  key: string;
  kind: string;
  name: string;
  description?: string | null;
  group?: string | null;
  parentId?: string | null;
  metadata?: any;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  aliases?: any[];
}

export class PaginatedTaxonomyNodesResponseDto {
  data: TaxonomyNodeResponseDto[];
  pagination: {
    skip: number;
    take: number;
    total: number;
    hasMore: boolean;
  };
}
