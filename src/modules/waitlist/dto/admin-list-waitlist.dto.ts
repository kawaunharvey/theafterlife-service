import { IsIn, IsOptional, IsString } from "class-validator";
import { PaginationDto } from "@/modules/underworld/underworld.dto";

export class AdminListWaitlistDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @IsIn(["PENDING", "VERIFIED", "APPROVED"])
  status?: "PENDING" | "VERIFIED" | "APPROVED";

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(["createdAt", "position"])
  sortBy?: "createdAt" | "position";

  @IsOptional()
  @IsString()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";

  @IsOptional()
  @IsString()
  @IsIn(["csv"])
  export?: "csv";
}
