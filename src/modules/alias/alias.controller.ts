import { Controller, Get, Query } from "@nestjs/common";
import { AliasService } from "./alias.service";
import {
  ListAliasesQueryDto,
  PaginatedAliasResponseDto,
} from "./alias.dto";
import { UseJwtAuth } from "../auth/decorators/use-jwt-auth.decorator"

@UseJwtAuth()
@Controller("aliases")
export class AliasController {
  constructor(private readonly aliasService: AliasService) {}

  /**
   * List aliases with optional filters
   * GET /aliases?taxonomyKeys[]=funeral-home&taxonomyKeys[]=cemetery&page=1&limit=20
   */
  @Get()
  async listAliases(
    @Query() query: ListAliasesQueryDto,
  ): Promise<PaginatedAliasResponseDto> {
    return this.aliasService.listAliases(query);
  }
}
