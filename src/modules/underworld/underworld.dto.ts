import { IsString, IsOptional, IsNumber, Min, Max } from "class-validator";

// ==================== Common Search DTOs ====================

export class PaginationDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}

// ==================== Memorial Search ====================

export class SearchMemorialsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE";

  @IsOptional()
  @IsString()
  status?: "ACTIVE" | "ARCHIVED";

  @IsOptional()
  @IsString()
  verificationStatus?: string;

  @IsOptional()
  @IsString()
  sortBy?: "createdAt" | "displayName" | "updatedAt";

  @IsOptional()
  @IsString()
  sortOrder?: "asc" | "desc";
}

export class MemorialSearchResult {
  id: string;
  slug: string;
  displayName: string;
  coverAssetUrl?: string;
  yearOfBirth?: number;
  yearOfPassing?: number;
  bioSummary?: string;
  visibility: string;
  status: string;
  verificationStatus: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

// ==================== Place Search ====================

export class SearchPlacesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  taxonomyId?: string;

  @IsOptional()
  @IsNumber()
  minRating?: number;

  @IsOptional()
  @IsString()
  sortBy?: "createdAt" | "name" | "rating";

  @IsOptional()
  @IsString()
  sortOrder?: "asc" | "desc";

  @IsOptional()
  @IsString()
  claimed?: "true" | "false";
}

export class PlaceSearchResult {
  id: string;
  googlePlaceId: string;
  claimed: boolean;
  businessId?: string;
  latitude?: number;
  longitude?: number;
  taxonomyId?: string;
  googleSnapshot?: {
    name?: string;
    formattedAddress?: string;
    categories?: string[];
    rating?: number;
    userRatingsTotal?: number;
    website?: string;
    internationalPhone?: string;
  };
}

// ==================== Taxonomy Search ====================

export class SearchTaxonomiesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  kind?: "DTE" | "CATEGORY" | "TAG" | "SERVICE" | "INTENT";

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  sortBy?: "createdAt" | "name" | "key";

  @IsOptional()
  @IsString()
  sortOrder?: "asc" | "desc";

  @IsOptional()
  @IsString()
  isActive?: "true" | "false";
}

export class TaxonomySearchResult {
  id: string;
  key: string;
  kind: string;
  name: string;
  description?: string;
  group?: string;
  parentId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

// ==================== Provider Detail ====================

export class ProviderDetailDto {
  uwId: string; // "biz_{objectId}" or "plc_{objectId}"
  source: "business" | "place";
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  photos: string[];
  rating?: number; // 0–100 for businesses; Google 1–5 normalized to 0–100 for places
  operatingHours?: Record<string, any>;
  taxonomies: string[]; // Taxonomy IDs
  claimed: boolean;
  googlePlaceId?: string; // Only present for places
}
